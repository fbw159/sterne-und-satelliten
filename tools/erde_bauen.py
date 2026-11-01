#!/usr/bin/env python3
"""Baut die Erdkarten-Daten für „Satelliten über mir“ aus Natural Earth (gemeinfrei):

  data/grenzen.json  Küsten, große Seen und Landesgrenzen als Linien (vereinfacht)
  data/orte.json     Raster für „Gerade über …“: Land, großer See oder Meer an jeder Stelle

Aufruf:
  python3 tools/erde_bauen.py --ne pfad/zu/natural-earth-geojson --aus data

Benötigte Dateien (https://github.com/nvkelso/natural-earth-vector, Ordner geojson):
  ne_50m_coastline, ne_50m_admin_0_boundary_lines_land, ne_50m_lakes,
  ne_10m_admin_0_countries_deu (Grenzen aus deutscher Sicht), ne_50m_geography_marine_polys
"""
import argparse, json, math, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

TOL = 0.02        # Vereinfachung der Linien in Grad
AUFL = 0.2        # Rasterweite für „Gerade über“ in Grad
FEIN = 3          # zum Zeichnen 3x feiner, dann je Zelle die Mehrheit
KLEIN_KM2 = 300   # kleinere Länder nur dort, wo sonst Wasser wäre (Inseln), nicht z. B. Vatikanstadt statt Italien
SEE_MIN_KM2 = 400 # kleinere Seen werden nicht benannt

# Kürzere bzw. übliche Namen
UMBENENNEN = {
    "Volksrepublik China": "China", "Republik China": "Taiwan", "Republik Zypern": "Zypern",
    "Vereinigte Staaten": "USA", "Antarktika": "Antarktis", "Guantanamo Bay Naval Base": "US-Stützpunkt Guantánamo",
    "United States Minor Outlying Islands": "Kleinere Amerikanische Überseeinseln", "Cayman Islands": "Kaimaninseln",
    "Arktischer Ozean": "Nordpolarmeer", "Bahía de Campeche": "Bucht von Campeche",
    # Schreibweise wie in der deutschen Wikipedia (geprüft 01.11.2026)
    "Weddell-Meer": "Weddellmeer", "Bellingshausen-See": "Bellingshausensee", "Balearen-Meer": "Balearenmeer",
    "Schelichow-Bucht": "Schelichow-Golf",
}
# Dativ mit Artikel („gerade über …“); alle anderen Länder ohne Artikel
DATIV = {
    "Schweiz": "der Schweiz", "Türkei": "der Türkei", "Slowakei": "der Slowakei", "Ukraine": "der Ukraine",
    "Mongolei": "der Mongolei", "Westsahara": "der Westsahara", "Zentralafrikanische Republik": "der Zentralafrikanischen Republik",
    "Dominikanische Republik": "der Dominikanischen Republik", "Republik Kongo": "der Republik Kongo",
    "Demokratische Republik Kongo": "der Demokratischen Republik Kongo", "Elfenbeinküste": "der Elfenbeinküste",
    "Republik Moldau": "der Republik Moldau", "Antarktis": "der Antarktis", "Vatikanstadt": "der Vatikanstadt",
    "Clipperton-Insel": "der Clipperton-Insel", "Norfolkinsel": "der Norfolkinsel", "Isle of Man": "der Isle of Man",
    "Irak": "dem Irak", "Iran": "dem Iran", "Jemen": "dem Jemen", "Libanon": "dem Libanon", "Sudan": "dem Sudan",
    "Südsudan": "dem Südsudan", "Tschad": "dem Tschad", "Niger": "dem Niger", "Oman": "dem Oman", "Senegal": "dem Senegal",
    "Kosovo": "dem Kosovo", "Vereinigtes Königreich": "dem Vereinigten Königreich",
    "Britisches Territorium im Indischen Ozean": "dem Britischen Territorium im Indischen Ozean",
    "US-Stützpunkt Guantánamo": "dem US-Stützpunkt Guantánamo", "Scarborough-Riff": "dem Scarborough-Riff",
    "Niederlande": "den Niederlanden", "USA": "den USA", "Vereinigte Arabische Emirate": "den Vereinigten Arabischen Emiraten",
    "Philippinen": "den Philippinen", "Bahamas": "den Bahamas", "Malediven": "den Malediven", "Seychellen": "den Seychellen",
    "Komoren": "den Komoren", "Salomonen": "den Salomonen", "Marshallinseln": "den Marshallinseln", "Cookinseln": "den Cookinseln",
    "Falklandinseln": "den Falklandinseln", "Färöer": "den Färöern", "Turks- und Caicosinseln": "den Turks- und Caicosinseln",
    "Pitcairninseln": "den Pitcairninseln", "Britische Jungferninseln": "den Britischen Jungferninseln",
    "Amerikanische Jungferninseln": "den Amerikanischen Jungferninseln", "Kaimaninseln": "den Kaimaninseln",
    "Heard und McDonaldinseln": "den Heard- und McDonaldinseln", "Nördliche Marianen": "den Nördlichen Marianen",
    "Föderierte Staaten von Mikronesien": "den Föderierten Staaten von Mikronesien",
    "Südgeorgien und die Südlichen Sandwichinseln": "Südgeorgien und den Südlichen Sandwichinseln",
    "Korallenmeerinseln": "den Korallenmeerinseln", "Ashmore- und Cartierinseln": "den Ashmore- und Cartierinseln",
    "Kleinere Amerikanische Überseeinseln": "den Kleineren Amerikanischen Überseeinseln",
    "Französische Süd- und Antarktisgebiete": "den Französischen Süd- und Antarktisgebieten",
    "Australische Territorien im Indischen Ozean": "den Australischen Territorien im Indischen Ozean",
}


ADJ_SET = {"Großer": "Großen", "Oberer": "Oberen", "Weißer": "Weißen", "Schwarzes": "Schwarzen", "Rotes": "Roten",
           "Gelbes": "Gelben", "Weißes": "Weißen", "Totes": "Toten", "Frisches": "Frischen", "Große": "Großen"}


def beuge(wort, weiblich=False):
    """Adjektiv vor dem Namen in den Dativ setzen (nur echte Adjektive, nicht „Pleskauer“ o. ä.)"""
    if wort in ADJ_SET:
        return ADJ_SET[wort]
    if weiblich and wort.endswith("ische"):
        return wort + "n"
    if not weiblich and wort.endswith(("ischer", "licher", "isches", "liches")):
        return wort[:-2] + "en"
    return wort


def dativ_wasser(n):
    """„Atlantischer Ozean“ -> „dem Atlantischen Ozean“, „Irische See“ -> „der Irischen See“ usw."""
    w = n.split(" ")
    kopf = w[-1].lower()
    if w[0] in ("Golf", "Golfe"):
        return "dem " + n
    if w[0] in ("Straße", "Bucht", "Bay") or n == "Biskaya":
        return "der " + n
    if kopf.endswith(("see", "bucht", "straße", "passage", "bay", "bight")):
        return "der " + " ".join([beuge(x, True) for x in w[:-1]] + [w[-1]])
    if kopf.endswith(("ozean", "meer", "golf", "meerbusen", "kanal", "sund")):
        return "dem " + " ".join([beuge(x) for x in w[:-1]] + [w[-1]])
    return "dem " + n  # Flüsse, Inlets


SEE_NAMEN = {"Oberer": "Oberer See", "Weißer": "Weißer See", "Pleskauer": "Pleskauer See", "Lake Eyre North": "Eyresee",
             "Lake Eyre South": "Eyresee", "Lake Kariba": "Karibasee"}

# Seen ohne deutschen Namen in Natural Earth: dort steht in name_de oft nur der verkürzte Name („Reindeer“ statt
# „Reindeer Lake“) – daraus wurde früher „See Reindeer“. Jetzt (geprüft 01.11.2026, Schreibweisen wie in der
# deutschen Wikipedia): gebräuchlicher deutscher Name, sonst der Name vor Ort („Reindeer Lake“, „Lac Saint-Jean“).
# Schlüssel = Natural-Earth-Feld „name“ (bei Bermen fehlt es, dann name_de).
SEE_FEST = {
    "Lake Saimaa": "Saimaa", "Lake Turkana": "Turkana-See", "Issyk-Kul": "Yssykköl", "Vänern": "Vänern",
    "Päijänne": "Päijänne", "Qinghai Hu": "Qinghai-See", "Lagoa Mirim": "Lagoa Mirim", "Uvs Nuur": "Uws Nuur",
    "Khövsgöl Nuur": "Chöwsgöl Nuur", "Tonlé Sap": "Tonle Sap", "Syvash": "Siwasch", "Hulun Nuur": "Hulun Nur",
    "Tai Hu": "Tai Hu", "Hongze Hu": "Hongze Hu", "Poyang Hu": "Poyang-See", "Vättern": "Vättern",
    "Lago Buenos Aires": "Lago General Carrera", "Mälaren": "Mälaren", "Nam Co": "Nam Co", "Inarijärvi": "Inarisee",
    "Lago Argentino": "Lago Argentino", "Lago Madre": "Laguna Madre", "Har Us Nuur": "Char-Us-Nuur",
    "Lake Tuz": "Tuz Gölü", "Lake Tharthar": "Tharthar-See", "Siling Co": "Siling Co", "Lake Vygozero": "Wygosero",
    "Razzaza Lake": "Razazza-See", "Khyargas Nuur": "Chjargas Nuur", "Oulujärvi": "Oulujärvi", "Pielinen": "Pielinen",
    "Pyhäjärvi": "Pyhäjärvi", "Lago Viedma": "Lago Viedma", "Lake Topozero": "Toposero", "Bosten Hu": "Bosten-See",
    "Lake Segozerskoye": "Segosero", "Gaoyou Hu": "Gaoyou Hu", "Chao Hu": "Chao Hu", "Tangra Yumco": "Tangra Yumco",
    "Yamzho Yumco": "Yamzhog Yumco", "Lago Llanquihue": "Llanquihue-See", "Lago de Izabal": "Izabal-See",
    "Pääjärvi": "Pjaosero", "Lake Kovdozero": "Kowdosero", "Toktogul Res.": "Toktogul-Stausee",
    "Siletitengiz Köli": "Siletitengiz Köli", "Biwa Ko": "Biwa-See", "Lake Srednye Kuyto": "Sredneje Kuito",
    "Ayakkum Hu": "Ayakkum Hu", "Gyaring Hu": "Gyaring Hu", "Ngoring Hu": "Ngoring Hu", "Lake Balaton": "Balaton",
    "Storsjön": "Storsjön", "Uddjaure": "Uddjaure", "Buyr Nuur": "Buir Nuur", "Hjälmaren": "Hjälmaren",
    "Ngangla Ringeo": "Ngangla Ringco", "Qusmuryn Köli": "Qusmuryn Köli", "Ozero Krasnoye": "Krasnoje-See",
    "Lake Disappointment": "Kumpupintil Lake", "Rés. de La Grande 2": "Réservoir Robert-Bourassa",
    "Rés. de La Grande 3": "Réservoir La Grande 3", "Lake Bienville": "Lac Bienville", "Lake Naococane": "Lac Naococane",
    "Lake Sakami": "Lac Sakami", "Lac-à-l'Eau-Claire": "Lac à l’Eau Claire", "Cabonga Reservoir": "Réservoir Cabonga",
    "Lake Saint Clair": "Lake St. Clair", "Lower Red Lake": "Red Lake", "Bermen": "Lac Bermen",
}
# nicht mehr vorhanden: Der Kachowkaer Stausee ist seit der Zerstörung des Damms im Juni 2023 leergelaufen
SEE_WEG = {"Kakhovka Reservoir"}


def dativ_see(n):
    """Binnenseen mit deutschem Namen: „dem Bodensee“, „dem Großen Bärensee“, „der Schardara-Talsperre“"""
    n = SEE_NAMEN.get(n, n)
    w = n.split(" ")
    kopf = w[-1].lower()
    if kopf.endswith("talsperre"):
        return "der " + n
    if kopf.endswith(("see", "meer", "haff")):
        return "dem " + " ".join([beuge(x) for x in w[:-1]] + [w[-1]])
    if n.startswith(("Laguna ", "Lagoa ")):
        return "der " + n
    return "dem " + n


def see_name(p):
    """Name eines Sees im Dativ – oder None, wenn er nicht (mehr) benannt werden soll"""
    voll, de = p.get("name"), p.get("name_de")
    if voll in SEE_WEG:
        return None
    schl = voll or de
    if schl in SEE_FEST:
        return dativ_see(SEE_FEST[schl])
    if de and (de.lower().endswith(("see", "meer", "haff", "talsperre")) or de in SEE_NAMEN):
        return dativ_see(de)
    # sonst der Name vor Ort, wie er auch in der deutschen Wikipedia steht („Reindeer Lake“, „Lake Mead“)
    n = (voll or de).replace("Ft. ", "Fort ").replace("Rés. ", "Réservoir ").replace(" Res.", " Reservoir")
    return dativ_see(n)


def dp(punkte, tol):
    """Douglas-Peucker (Grad, eben genähert)"""
    if len(punkte) < 3:
        return punkte
    p = np.asarray(punkte, dtype=float)
    keep = np.zeros(len(p), dtype=bool)
    keep[0] = keep[-1] = True
    stapel = [(0, len(p) - 1)]
    while stapel:
        a, b = stapel.pop()
        if b <= a + 1:
            continue
        seg = p[b] - p[a]
        L = math.hypot(*seg)
        q = p[a + 1:b] - p[a]
        if L < 1e-12:
            d = np.hypot(q[:, 0], q[:, 1])
        else:
            d = np.abs(seg[0] * q[:, 1] - seg[1] * q[:, 0]) / L
        k = int(np.argmax(d))
        if d[k] > tol:
            m = a + 1 + k
            keep[m] = True
            stapel += [(a, m), (m, b)]
    return p[keep].tolist()


def linien(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    if geom["type"] == "Polygon":
        return geom["coordinates"]
    if geom["type"] == "MultiPolygon":
        return [r for poly in geom["coordinates"] for r in poly]
    return []


def polygone(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def flaeche_km2(ring):
    p = np.asarray(ring)
    x, y = p[:, 0], p[:, 1]
    a = 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    return a * 111.32 ** 2 * math.cos(math.radians(float(np.mean(y))))


def kodiere(listen):
    """Polylinien -> [n, x0, y0, dx, dy, …] mit x = Länge·100, y = Breite·100"""
    out = []
    for l in listen:
        q = [(int(round(x * 100)), int(round(y * 100))) for x, y in l]
        # doppelte Punkte weg
        r = [q[0]] + [b for a, b in zip(q, q[1:]) if a != b]
        if len(r) < 2:
            continue
        out.append(len(r))
        out += [r[0][0], r[0][1]]
        for a, b in zip(r, r[1:]):
            out += [b[0] - a[0], b[1] - a[1]]
    return out


def lade(ordner, name):
    with open(os.path.join(ordner, name + ".geojson"), encoding="utf-8") as f:
        return json.load(f)["features"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ne", required=True)
    ap.add_argument("--aus", required=True)
    a = ap.parse_args()

    # ---------------- Linien
    kueste = []
    for f in lade(a.ne, "ne_50m_coastline"):
        for l in linien(f["geometry"]):
            kueste.append(dp(l, TOL))
    seen = []
    for f in lade(a.ne, "ne_50m_lakes"):
        p = f["properties"]
        for poly in polygone(f["geometry"]):
            if flaeche_km2(poly[0]) >= SEE_MIN_KM2 * 4:  # nur große Seen als Linie
                kueste.append(dp(poly[0], TOL))
    grenze, strittig = [], []
    for f in lade(a.ne, "ne_50m_admin_0_boundary_lines_land"):
        p = f["properties"]
        klasse = p.get("FCLASS_DE") or p.get("FEATURECLA") or ""
        if klasse == "Unrecognized":
            continue
        ziel = grenze if klasse.startswith("International") else strittig
        for l in linien(f["geometry"]):
            ziel.append(dp(l, TOL))
    k, g, s = kodiere(kueste), kodiere(grenze), kodiere(strittig)
    with open(os.path.join(a.aus, "grenzen.json"), "w", encoding="utf-8") as f:
        json.dump({"quelle": "Natural Earth 1:50 Mio. (gemeinfrei), vereinfacht; Grenzen aus deutscher Sicht",
                   "format": "je Linie: Anzahl, Länge·100, Breite·100, dann Differenzen", "kueste": k, "grenze": g, "strittig": s},
                  f, separators=(",", ":"))
    print("Linien: Küste", len(kueste), "Grenzen", len(grenze), "strittig", len(strittig), "Punkte", (len(k) + len(g) + len(s)) // 2)

    # ---------------- Raster „Gerade über“
    W, H = int(round(360 / AUFL)), int(round(180 / AUFL))
    WF, HF, af = W * FEIN, H * FEIN, AUFL / FEIN
    namen = [""]
    def xy(ring):
        return [((x + 180) / af, (90 - y) / af) for x, y in ring]
    def male(img, polys, wert, loecher=True):
        d = ImageDraw.Draw(img)
        for poly in polys:
            if len(poly[0]) >= 3:
                d.polygon(xy(poly[0]), fill=wert)
            if loecher:
                for loch in poly[1:]:
                    if len(loch) >= 3:
                        d.polygon(xy(loch), fill=0)

    land = Image.new("I", (WF, HF), 0)
    klein = Image.new("I", (WF, HF), 0)
    laender = []
    for f in lade(a.ne, "ne_10m_admin_0_countries_deu"):
        p = f["properties"]
        n = UMBENENNEN.get(p["NAME_DE"], p["NAME_DE"])
        polys = polygone(f["geometry"])
        fl = sum(flaeche_km2(pl[0]) for pl in polys)
        laender.append((fl, n, polys))
    laender.sort(key=lambda x: -x[0])  # große zuerst, kleine (Enklaven) obendrauf
    for fl, n, polys in laender:
        namen.append(DATIV.get(n, n))
        male(land if fl >= KLEIN_KM2 else klein, polys, len(namen) - 1)
    L = np.array(land, dtype=np.int32)
    K = np.array(klein, dtype=np.int32)
    L = np.where((L == 0) & (K > 0), K, L)

    see = Image.new("I", (WF, HF), 0)
    seenamen = 0
    for f in sorted(lade(a.ne, "ne_50m_lakes"), key=lambda f: -sum(flaeche_km2(pl[0]) for pl in polygone(f["geometry"]))):
        p = f["properties"]
        n = p.get("name_de") or p.get("name")
        if not n:
            continue
        polys = polygone(f["geometry"])
        if sum(flaeche_km2(pl[0]) for pl in polys) < SEE_MIN_KM2:
            continue
        nm = see_name(p)
        if nm is None:
            continue
        namen.append(nm)
        male(see, polys, len(namen) - 1, loecher=False)
        seenamen += 1
    S = np.array(see, dtype=np.int32)

    meer = Image.new("I", (WF, HF), 0)
    marine = lade(a.ne, "ne_50m_geography_marine_polys")
    marine.sort(key=lambda f: (f["properties"].get("scalerank") or 0))
    for f in marine:
        p = f["properties"]
        n = p.get("name_de") or p.get("name")
        if not n or p.get("featurecla") in ("reef",):
            continue
        n = UMBENENNEN.get(n, n)
        namen.append(dativ_wasser(n))
        male(meer, polygone(f["geometry"]), len(namen) - 1, loecher=False)
    M = np.array(meer, dtype=np.int32)
    # Lücken im Meer: nächstgelegenes benanntes Meer
    leer = M == 0
    _, (iy, ix) = ndimage.distance_transform_edt(leer, return_indices=True)
    M = M[iy, ix]

    RF = np.where(S > 0, S, np.where(L > 0, L, M))
    # je Zelle der häufigste Wert der FEIN x FEIN Teilzellen
    b = RF.reshape(H, FEIN, W, FEIN).transpose(0, 2, 1, 3).reshape(H * W, FEIN * FEIN)
    b = np.sort(b, axis=1)
    best = b[:, 0].copy()
    bestn = np.zeros(H * W, dtype=np.int32)
    lauf = np.ones(H * W, dtype=np.int32)
    for j in range(1, FEIN * FEIN):
        gleich = b[:, j] == b[:, j - 1]
        lauf = np.where(gleich, lauf + 1, 1)
        besser = lauf > bestn
        bestn = np.where(besser, lauf, bestn)
        best = np.where(besser, b[:, j], best)
    j0 = b[:, 0]
    besser = (bestn < 1)
    best = np.where(besser, j0, best)
    R = best.reshape(H, W)
    # Lauflängen je Zeile
    zeilen = []
    laeufe = 0
    for y in range(H):
        z = R[y]
        wechsel = np.flatnonzero(np.diff(z)) + 1
        starts = np.concatenate([[0], wechsel])
        ends = np.concatenate([wechsel, [W]])
        reihe = []
        for s0, e0 in zip(starts, ends):
            reihe += [int(z[s0]), int(e0 - s0)]
        laeufe += len(starts)
        zeilen.append(reihe)
    # Namen-Duplikate zusammenlegen
    neu, karte = [], {}
    for i, n in enumerate(namen):
        if n not in karte:
            karte[n] = len(neu)
            neu.append(n)
    zeilen = [[karte[namen[v]] if j % 2 == 0 else v for j, v in enumerate(r)] for r in zeilen]
    with open(os.path.join(a.aus, "orte.json"), "w", encoding="utf-8") as f:
        json.dump({"quelle": "Natural Earth (gemeinfrei): Länder aus deutscher Sicht 1:10 Mio., Seen und Meere 1:50 Mio.",
                   "aufloesung": AUFL, "breite": W, "hoehe": H, "namen": neu, "zeilen": zeilen},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("Raster", W, "x", H, "Läufe", laeufe, "Namen", len(neu), "Seen", seenamen)


if __name__ == "__main__":
    main()

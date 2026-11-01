#!/usr/bin/env python3
"""Baut die Himmelsdaten für „Satelliten über mir“: Sterne bis 6 mag und Sternbilder.

Aufruf:
  python3 tools/himmel_bauen.py --bsc bsc5-short.json --d3 pfad/zu/d3-celestial/data --aus data

Quellen (siehe lib/LIZENZEN.md):
  - Sterne: Yale Bright Star Catalog, 5. Ausgabe, als JSON von Bretton Wade (MIT)
  - Sternbild-Linien, Namen und Beschriftungsorte: d3-celestial von Olaf Frohn (BSD-3),
    Linien nach den IAU-Sternkarten (IAU und Sky & Telescope)
  - Sternnamen: IAU-Namen (WGSN), deutsche Schreibweisen für bekannte Sterne
  - Entfernungen: gerundete Werte (Hipparcos, van Leeuwen 2007), nur für bekannte Sterne
"""
import argparse, json, math, os, re, sys

# Eigennamen nur für Sterne, deren Namen sicher sind: Schlüssel „Buchstabe Sternbild“ oder „Nummer Sternbild“.
# Der Name geht an den hellsten passenden Stern (z. B. α² CVn = Cor Caroli).
NAMEN = {
    "α CMa": "Sirius", "β CMa": "Mirzam", "δ CMa": "Wezen", "ε CMa": "Adhara", "η CMa": "Aludra", "ζ CMa": "Furud",
    "α Car": "Canopus", "β Car": "Miaplacidus", "ε Car": "Avior", "ι Car": "Aspidiske",
    "α Boo": "Arktur", "ε Boo": "Izar", "η Boo": "Muphrid", "γ Boo": "Seginus", "β Boo": "Nekkar",
    "α Cen": "Alpha Centauri", "β Cen": "Hadar", "θ Cen": "Menkent",
    "α Lyr": "Wega", "β Lyr": "Sheliak", "γ Lyr": "Sulafat",
    "α Aur": "Kapella", "β Aur": "Menkalinan", "θ Aur": "Mahasim", "ι Aur": "Hassaleh", "ε Aur": "Almaaz",
    "β Ori": "Rigel", "α Ori": "Beteigeuze", "γ Ori": "Bellatrix", "ε Ori": "Alnilam", "ζ Ori": "Alnitak",
    "δ Ori": "Mintaka", "κ Ori": "Saiph", "λ Ori": "Meissa",
    "α CMi": "Prokyon", "β CMi": "Gomeisa",
    "α Eri": "Achernar", "β Eri": "Cursa", "γ Eri": "Zaurak", "θ Eri": "Acamar",
    "α Aql": "Atair", "γ Aql": "Tarazed", "β Aql": "Alshain",
    "α Tau": "Aldebaran", "β Tau": "Elnath", "η Tau": "Alkyone", "27 Tau": "Atlas", "17 Tau": "Elektra",
    "20 Tau": "Maia", "23 Tau": "Merope", "19 Tau": "Taygeta",
    "α Sco": "Antares", "λ Sco": "Shaula", "θ Sco": "Sargas", "δ Sco": "Dschubba", "κ Sco": "Girtab",
    "β Sco": "Acrab", "υ Sco": "Lesath",
    "α Vir": "Spica", "ε Vir": "Vindemiatrix", "γ Vir": "Porrima", "β Vir": "Zavijava",
    "β Gem": "Pollux", "α Gem": "Kastor", "γ Gem": "Alhena", "μ Gem": "Tejat", "ε Gem": "Mebsuta",
    "α PsA": "Fomalhaut",
    "α Cyg": "Deneb", "γ Cyg": "Sadr", "β Cyg": "Albireo", "ε Cyg": "Aljanah",
    "β Cru": "Mimosa", "α Cru": "Acrux", "γ Cru": "Gacrux",
    "α Leo": "Regulus", "β Leo": "Denebola", "γ Leo": "Algieba", "δ Leo": "Zosma", "θ Leo": "Chertan",
    "α Gru": "Alnair",
    "ε UMa": "Alioth", "α UMa": "Dubhe", "η UMa": "Alkaid", "ζ UMa": "Mizar", "80 UMa": "Alkor",
    "β UMa": "Merak", "γ UMa": "Phecda", "δ UMa": "Megrez",
    "α Per": "Mirfak", "β Per": "Algol",
    "ε Sgr": "Kaus Australis", "σ Sgr": "Nunki", "ζ Sgr": "Ascella", "δ Sgr": "Kaus Media", "λ Sgr": "Kaus Borealis",
    "α TrA": "Atria", "α Pav": "Peacock", "α Hya": "Alphard",
    "α Ari": "Hamal", "β Ari": "Sheratan",
    "α UMi": "Polarstern", "β UMi": "Kochab", "γ UMi": "Pherkad",
    "β Cet": "Diphda", "α Cet": "Menkar", "ο Cet": "Mira",
    "α And": "Alpheratz", "β And": "Mirach", "γ And": "Almach",
    "α Oph": "Rasalhague", "η Oph": "Sabik", "β Oph": "Cebalrai",
    "λ Vel": "Suhail",
    "α Cas": "Schedar", "β Cas": "Caph", "γ Cas": "Navi", "δ Cas": "Ruchbah", "ε Cas": "Segin",
    "α CrB": "Alphecca", "γ Dra": "Eltanin", "β Dra": "Rastaban", "α Dra": "Thuban",
    "ζ Pup": "Naos",
    "ε Peg": "Enif", "β Peg": "Scheat", "α Peg": "Markab", "γ Peg": "Algenib",
    "α Phe": "Ankaa",
    "α Cep": "Alderamin", "β Cep": "Alfirk", "γ Cep": "Errai", "μ Cep": "Granatstern",
    "α Lep": "Arneb", "β Lep": "Nihal",
    "γ Crv": "Gienah", "β Crv": "Kraz", "δ Crv": "Algorab",
    "β Lib": "Zubeneschamali", "α Lib": "Zubenelgenubi",
    "α Ser": "Unukalhai",
    "β Her": "Kornephoros", "α Her": "Rasalgethi",
    "α Col": "Phact",
    "β Aqr": "Sadalsuud", "α Aqr": "Sadalmelik",
    "δ Cap": "Deneb Algedi", "β Cap": "Dabih",
    "α CVn": "Cor Caroli", "β CVn": "Chara",
    "α Del": "Sualocin", "β Del": "Rotanev",
}

# Entfernungen in Lichtjahren (gerundet; „~“ = unsicher)
ENTFERNUNG = {
    "α CMa": 8.6, "α Car": 310, "α Cen": 4.4, "α Boo": 37, "α Lyr": 25, "α Aur": 43, "β Ori": 860, "α CMi": 11.5,
    "α Eri": 139, "α Ori": "~550", "β Cen": 390, "α Aql": 16.7, "α Cru": 320, "α Tau": 65, "α Sco": "~550",
    "α Vir": 250, "β Gem": 34, "α PsA": 25, "α Cyg": "~2600", "β Cru": 280, "α Leo": 79, "ε CMa": 430,
    "α Gem": 51, "γ Cru": 88, "λ Sco": 570, "γ Ori": 250, "β Tau": 134, "β Car": 113, "α Gru": 101,
    "ε UMa": 83, "α UMa": 123, "α Per": 510, "η UMa": 104, "β Aur": 81, "γ Gem": 109, "α UMi": 430,
    "ζ UMa": 83, "80 UMa": 82, "β Per": 90, "α Ari": 66, "β Leo": 36, "α And": 97, "β And": 200,
    "α Cas": 230, "β UMi": 131, "α Oph": 49, "γ Dra": 154, "α CrB": 75, "β UMa": 79, "γ UMa": 84,
    "δ UMa": 81, "β Cas": 55, "β Cyg": 430, "γ Leo": 130, "δ Leo": 58, "α Dra": 300, "α Cep": 49,
    "β Peg": 196, "α Peg": 133, "ε Peg": 690, "κ Ori": "~650", "ο Cet": 300, "α Cet": 250, "β Cet": 96,
    "α Hya": 180, "α CVn": 110, "ε Boo": 200, "η Boo": 37, "σ Sgr": 228, "ε Sgr": 143, "α Pav": 179,
    "α TrA": 390, "θ Sco": 300, "δ Cas": 99, "β Lyr": "~960", "γ Aql": 395, "β Aql": 45, "η Tau": 440,
}

GRIECH = "αβγδεζηθικλμνξοπρστυφχψω"
HOCH = {"¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9"}


def winkel(t, stunden):
    m = re.match(r"([+-]?)(\d+)[h°]\s*(\d+)[m′']\s*([\d.]+)", t.strip())
    if not m:
        raise ValueError(t)
    v = int(m.group(2)) + int(m.group(3)) / 60 + float(m.group(4)) / 3600
    if m.group(1) == "-":
        v = -v
    return v * 15 if stunden else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bsc", required=True)
    ap.add_argument("--d3", required=True, help="Ordner data/ von d3-celestial")
    ap.add_argument("--aus", required=True)
    ap.add_argument("--grenze", type=float, default=6.0)
    a = ap.parse_args()

    namen_d3 = json.load(open(os.path.join(a.d3, "constellations.json"), encoding="utf-8"))
    linien_d3 = json.load(open(os.path.join(a.d3, "constellations.lines.json"), encoding="utf-8"))
    gen = {}
    for f in namen_d3["features"]:
        gen[f["id"]] = f["properties"]["gen"]

    roh = json.load(open(a.bsc, encoding="utf-8"))
    sterne = []
    for s in roh:
        v = float(s["V"])
        if v > a.grenze:
            continue
        ra, de = winkel(s["RA"], True), winkel(s["Dec"], False)
        k = int(round(float(s.get("K") or 6000) / 100))
        sterne.append({"ra": ra, "de": de, "v": v, "k": k, "B": s.get("B"), "F": s.get("F"), "C": s.get("C"), "hr": int(s["HR"])})
    sterne.sort(key=lambda x: x["v"])

    # Eigennamen: an den jeweils hellsten Stern mit diesem Schlüssel
    vergeben = set()
    for s in sterne:
        schl = []
        if s["B"] and s["C"]:
            b = s["B"]
            basis = "".join(ch for ch in b if ch in GRIECH)
            schl.append(f"{basis} {s['C']}")
        if s["F"] and s["C"]:
            schl.append(f"{s['F']} {s['C']}")
        s["name"] = ""
        s["lj"] = None
        for k in schl:
            if k in NAMEN and k not in vergeben:
                s["name"] = NAMEN[k]
                s["lj"] = ENTFERNUNG.get(k)
                vergeben.add(k)
                break
        # Bezeichnung
        if s["B"] and s["C"] in gen:
            s["bez"] = f"{s['B']} {gen[s['C']]}"
        elif s["F"] and s["C"] in gen:
            s["bez"] = f"{s['F']} {gen[s['C']]}"
        else:
            s["bez"] = f"HR {s['hr']}"
    fehlt = [k for k in NAMEN if k not in vergeben]
    if fehlt:
        print("Namen ohne Stern:", fehlt, file=sys.stderr)

    zeilen = []
    for s in sterne:
        z = [round(s["ra"], 3), round(s["de"], 3), round(s["v"], 2), s["k"], s["name"], s["bez"], s["C"] or ""]
        if s["lj"] is not None:
            z.append(s["lj"])
        while z and z[-1] == "":
            z.pop()
        zeilen.append(z)
    aus = {
        "quelle": "Yale Bright Star Catalog (5. Ausgabe, JSON von Bretton Wade, MIT-Lizenz); Namen nach IAU, deutsche Schreibweisen; Entfernungen gerundet (Hipparcos)",
        "felder": ["RA J2000 [°]", "Dec J2000 [°]", "Helligkeit [mag]", "Temperatur [100 K]", "Name", "Bezeichnung", "Sternbild", "Entfernung [Lichtjahre]"],
        "sterne": zeilen,
    }
    with open(os.path.join(a.aus, "sterne.json"), "w", encoding="utf-8") as f:
        json.dump(aus, f, ensure_ascii=False, separators=(",", ":"))
    print("Sterne:", len(zeilen), "mit Namen:", sum(1 for s in sterne if s["name"]))

    # ---- Sternbilder
    linien = {}
    for f in linien_d3["features"]:
        linien.setdefault(f["id"], []).extend(f["geometry"]["coordinates"])
    ra_ = lambda lon: lon + 360 if lon < 0 else lon
    sb = {}
    for f in namen_d3["features"]:
        p = f["properties"]
        k = f["id"]
        de = re.sub(r"\s+", " ", p["de"].replace(" ", " ")).strip()
        de = {"Kleine Männliche Wasserschlange": "Kleine Wasserschlange", "Kiel des Schiffs": "Schiffskiel"}.get(de, de)
        lon, lat = f["geometry"]["coordinates"]
        if k in sb:  # Schlange: Kopf und Schwanz
            sb[k]["pos"].append([round(ra_(lon), 2), round(lat, 2)])
            continue
        la = p["name"] if k != "Ser" else "Serpens"
        sb[k] = {"k": k, "de": de, "la": la, "gen": p["gen"], "rang": int(p["rank"]), "pos": [[round(ra_(lon), 2), round(lat, 2)]], "linien": []}
    # Linien als Folgen von Punkten; Abgleich mit dem Sternkatalog
    vek = [(math.cos(math.radians(s["de"])) * math.cos(math.radians(s["ra"])), math.cos(math.radians(s["de"])) * math.sin(math.radians(s["ra"])), math.sin(math.radians(s["de"]))) for s in sterne]
    ohne = 0
    punkte = 0
    for k, ls in linien.items():
        for l in ls:
            folge = []
            for lon, lat in l:
                ra, de = ra_(lon), lat
                folge += [round(ra, 3), round(de, 3)]
                v = (math.cos(math.radians(de)) * math.cos(math.radians(ra)), math.cos(math.radians(de)) * math.sin(math.radians(ra)), math.sin(math.radians(de)))
                best = max(vek, key=lambda w: w[0] * v[0] + w[1] * v[1] + w[2] * v[2])
                d = math.degrees(math.acos(min(1, best[0] * v[0] + best[1] * v[1] + best[2] * v[2])))
                punkte += 1
                if d > 0.1:
                    ohne += 1
            sb[k]["linien"].append(folge)
    print("Linienpunkte:", punkte, "davon ohne Stern im Katalog (>0,1°):", ohne)
    aus = {
        "quelle": "Linien, Namen und Beschriftungsorte: d3-celestial (Olaf Frohn, BSD-3-Lizenz), Linien nach den IAU-Sternkarten",
        "sternbilder": list(sb.values()),
    }
    with open(os.path.join(a.aus, "sternbilder.json"), "w", encoding="utf-8") as f:
        json.dump(aus, f, ensure_ascii=False, separators=(",", ":"))
    print("Sternbilder:", len(sb))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baut die Bahndaten für die Seite „Satelliten über mir“.

Ergebnis im Ordner data/:
  kern.json        ISS, Raumstationen und die hellsten Satelliten (klein, wird zuerst geladen)
  alle.json        alle übrigen aktiven Satelliten
  info.json        Steckbrief-Angaben aus dem Satellitenkatalog (SATCAT)
  gruppen.json     Zuordnung zu CelesTrak-Gruppen (Zwischenspeicher für den nächsten Lauf)
  helligkeit.json  beobachtete Helligkeiten (McCants qs.mag, Zwischenspeicher)
  stand.json       Zeitpunkt, Quellen, Anzahl

Quellen: CelesTrak (Bahndaten im OMM/JSON-Format, SATCAT), Mike McCants' qs.mag.
Fällt eine Quelle aus, nimmt das Skript einen Spiegel oder die zuletzt
veröffentlichten Daten (--vorher). Nur Python-Standardbibliothek.

Aufruf (GitHub Action):
  python3 tools/daten_bauen.py --aus data --vorher https://fbw159.github.io/sterne-und-satelliten/data/
Lokal mit heruntergeladenen Dateien:
  python3 tools/daten_bauen.py --aus data --lokal /pfad/zu/dateien
"""

import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

UA = "sterne-und-satelliten/1.0 (+https://github.com/fbw159/sterne-und-satelliten)"

CELESTRAK_GP = "https://celestrak.org/NORAD/elements/gp.php?GROUP={g}&FORMAT=json"
SPIEGEL_GP = "https://raw.githubusercontent.com/satvisorcom/satvisor-data/master/celestrak/json/{g}.json"
CELESTRAK_SATCAT = "https://celestrak.org/pub/satcat.csv"
SPIEGEL_SATCAT = "https://raw.githubusercontent.com/astrion-tech/celestrak-mirror/main/satcat/satcat.csv"
QSMAG = "https://raw.githubusercontent.com/barolfe/satellite-tracker/master/qs.mag"

# Gruppen mit Bahndaten, die bei jedem Lauf neu geholt werden
BAHN_GRUPPEN = ["active", "stations", "visual"]

# kleine Gruppen, nur für die Einordnung (einmal am Tag)
KAT_GRUPPEN = {
    "stations": "station",
    "gnss": "navi", "gps-ops": "navi", "glo-ops": "navi", "galileo": "navi",
    "beidou": "navi", "sbas": "navi", "nnss": "navi", "musson": "navi",
    "weather": "wetter", "goes": "wetter",
    "resource": "erde", "planet": "erde", "spire": "erde", "dmc": "erde", "argos": "erde", "sarsat": "erde",
    "science": "wissen", "geodetic": "wissen", "engineering": "wissen", "education": "wissen",
    "military": "militaer", "radar": "militaer",
    "intelsat": "funk", "ses": "funk", "eutelsat": "funk", "telesat": "funk", "iridium-NEXT": "funk",
    "globalstar": "funk", "orbcomm": "funk", "amateur": "funk", "satnogs": "funk", "x-comm": "funk",
    "other-comm": "funk", "tdrss": "funk", "geo": "funk",
    "cubesat": "sonst",
}
# Reihenfolge: was weiter vorn steht, gewinnt
KAT_RANG = ["iss", "station", "starlink", "internet", "navi", "wetter", "erde", "wissen",
            "militaer", "funk", "stufe", "sonst"]

NAMENSREGELN = [  # (Anfang des Namens, Kategorie)
    ("ISS (", "station"), ("CSS (", "station"),
    ("STARLINK", "starlink"),
    ("ONEWEB", "internet"), ("KUIPER", "internet"), ("QIANFAN", "internet"), ("HULIANWANG", "internet"),
    ("RASSVET", "internet"),
    ("NAVSTAR", "navi"), ("GPS ", "navi"), ("GALILEO", "navi"), ("BEIDOU", "navi"), ("GLONASS", "navi"),
    ("CENTISPACE", "navi"),
    ("NOAA ", "wetter"), ("METOP", "wetter"), ("METEOR-M", "wetter"), ("METEOSAT", "wetter"),
    ("FENGYUN", "wetter"), ("HIMAWARI", "wetter"), ("GOES ", "wetter"), ("YUNHAI", "wetter"),
    ("TOMORROW", "wetter"),
    ("SENTINEL", "erde"), ("LANDSAT", "erde"), ("FLOCK", "erde"), ("LEMUR", "erde"), ("ICEYE", "erde"),
    ("SKYSAT", "erde"), ("JILIN", "erde"), ("GAOFEN", "erde"), ("SUPERVIEW", "erde"), ("WORLDVIEW", "erde"),
    ("CAPELLA", "erde"), ("UMBRA", "erde"), ("PLEIADES", "erde"), ("IRIDE", "erde"), ("HAWK", "erde"),
    ("GRUS", "erde"), ("STRIX", "erde"), ("QPS-SAR", "erde"), ("GHGSAT", "erde"), ("NUSAT", "erde"),
    ("PIESAT", "erde"), ("TIANHUI", "erde"), ("NEONSAT", "erde"), ("ENVISAT", "erde"), ("TERRA", "erde"),
    ("AQUA", "erde"),
    ("YAOGAN", "militaer"), ("USA ", "militaer"), ("SDA ", "militaer"), ("PRAETORIAN", "militaer"),
    ("IRIDIUM", "funk"), ("GLOBALSTAR", "funk"), ("ORBCOMM", "funk"), ("INTELSAT", "funk"),
    ("EUTELSAT", "funk"), ("ASTRA", "funk"), ("SES", "funk"), ("O3B", "funk"), ("INMARSAT", "funk"),
    ("SPACEMOBILE", "funk"), ("BLUEBIRD", "funk"), ("TIANQI", "funk"), ("CONNECTA", "funk"),
    ("GEESAT", "funk"), ("KINEIS", "funk"), ("GONETS", "funk"),
    ("HST", "wissen"),
]

# geschätzte Standardhelligkeit (1000 km, 90° Phasenwinkel), wenn keine Beobachtung vorliegt
SCHAETZ_NAME = [
    ("STARLINK", 6.0), ("ONEWEB", 7.5), ("KUIPER", 6.5), ("QIANFAN", 5.5), ("HULIANWANG", 5.5),
    ("IRIDIUM", 6.0), ("GLOBALSTAR", 5.5), ("ORBCOMM", 8.0), ("FLOCK", 9.0), ("LEMUR", 9.0),
]
SCHAETZ_TYP = {"PAY": 6.0, "R/B": 4.5, "DEB": 9.0}
MCCANTS_ZUSCHLAG = 1.0  # qs.mag: volle Phase, hellste Lage -> umrechnen auf 90° Phase (Mittelwert)

ISS_ID = 25544


def log(*a):
    print(*a, flush=True)


def jetzt_utc():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    if not s:
        return None
    try:
        s = s.replace("Z", "+00:00")
        t = dt.datetime.fromisoformat(s)
        if t.tzinfo is None:
            t = t.replace(tzinfo=dt.timezone.utc)
        return t
    except Exception:
        return None


class Quelle:
    """Holt Texte aus dem Netz oder (für Tests) aus einem lokalen Ordner."""

    def __init__(self, lokal=None):
        self.lokal = lokal

    def text(self, url, name=None, versuche=3, timeout=90):
        if self.lokal:
            pfad = os.path.join(self.lokal, name or os.path.basename(url))
            if not os.path.exists(pfad):
                raise FileNotFoundError(pfad)
            with open(pfad, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        letzter = None
        for v in range(versuche):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    roh = r.read()
                return roh.decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                letzter = e
                if e.code in (403, 404):  # bei CelesTrak: Sperre oder unbekannte Gruppe -> nicht wiederholen
                    break
            except Exception as e:  # noqa: BLE001
                letzter = e
            time.sleep(3 * (v + 1))
        raise RuntimeError(f"{url}: {letzter}")


def gp_gueltig(daten, mindestens=1):
    if not isinstance(daten, list) or len(daten) < mindestens:
        return False
    x = daten[0]
    return isinstance(x, dict) and "NORAD_CAT_ID" in x and "MEAN_MOTION" in x and "EPOCH" in x


def hole_gp(q, gruppe, mindestens=1):
    """Bahndaten einer Gruppe: erst CelesTrak, dann Spiegel. Gibt (liste, quelle) oder (None, fehler)."""
    fehler = []
    for name, url in (("CelesTrak", CELESTRAK_GP.format(g=gruppe)), ("Spiegel", SPIEGEL_GP.format(g=gruppe))):
        try:
            txt = q.text(url, name=f"{gruppe}.json" if q.lokal else None)
            daten = json.loads(txt)
            if gp_gueltig(daten, mindestens):
                return daten, name
            fehler.append(f"{name}: unbrauchbare Antwort ({txt[:80]!r})")
        except Exception as e:  # noqa: BLE001
            fehler.append(f"{name}: {e}")
        if q.lokal:
            break
    return None, "; ".join(fehler)


def lade_vorher(quelle, datei):
    """Zuletzt veröffentlichte Datei (URL-Ordner oder lokaler Ordner)."""
    if not quelle:
        return None
    try:
        if quelle.startswith("http"):
            url = quelle.rstrip("/") + "/" + datei
            req = urllib.request.Request(url + f"?v={int(time.time())}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        pfad = os.path.join(quelle, datei)
        if os.path.exists(pfad):
            with open(pfad, encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:  # noqa: BLE001
        log(f"  (vorherige {datei} nicht lesbar: {e})")
    return None


def epoche_sekunden(s):
    t = parse_iso(s)
    if t is None:
        raise ValueError(f"Epoche unlesbar: {s}")
    return round(t.timestamp(), 3)


def parse_qsmag(txt):
    mags = {}
    for zeile in txt.splitlines()[1:]:
        if len(zeile) < 37:
            continue
        try:
            nr = int(zeile[0:5])
        except ValueError:
            continue
        s = zeile[32:37].strip()
        if not s:
            continue
        try:
            m = float(s)
        except ValueError:
            continue
        if -5 < m < 20:
            mags[str(nr)] = m
    return mags


def parse_satcat(txt, ids):
    """Nur die Einträge für unsere Satelliten. Felder: typ, status, land, start, ort, rcs."""
    info = {}
    leser = csv.DictReader(io.StringIO(txt))
    for r in leser:
        try:
            nr = int(r["NORAD_CAT_ID"])
        except (KeyError, ValueError):
            continue
        if nr not in ids:
            continue
        rcs = r.get("RCS") or ""
        try:
            rcs = round(float(rcs), 3) if rcs else None
        except ValueError:
            rcs = None
        info[str(nr)] = [
            r.get("OBJECT_TYPE") or "",
            r.get("OPS_STATUS_CODE") or "",
            r.get("OWNER") or "",
            r.get("LAUNCH_DATE") or "",
            r.get("LAUNCH_SITE") or "",
            rcs,
        ]
    return info


def kategorie(nr, name, gruppen_von, typ):
    if nr == ISS_ID:
        return "iss"
    kandidaten = []
    n = name.upper()
    for anfang, kat in NAMENSREGELN:
        if n.startswith(anfang):
            kandidaten.append(kat)
            break
    for g in gruppen_von.get(nr, ()):
        k = KAT_GRUPPEN.get(g)
        if k:
            kandidaten.append(k)
    if typ == "R/B" or " R/B" in n:
        kandidaten.append("stufe")
    if not kandidaten:
        return "sonst"
    return min(kandidaten, key=lambda k: KAT_RANG.index(k) if k in KAT_RANG else 99)


def schaetz_mag(name, typ, rcs):
    n = name.upper()
    for anfang, m in SCHAETZ_NAME:
        if n.startswith(anfang):
            return m
    if rcs and rcs > 0:
        # diffus reflektierende Kugel, Albedo 0,15, Querschnitt ~ RCS, 1000 km, 90° Phase
        import math
        fluss = 0.15 * rcs / (math.pi ** 2 * 1e12)
        return round(max(-1.0, min(12.0, -26.74 - 2.5 * math.log10(fluss))), 1)
    if typ == "R/B" or " R/B" in n:
        return SCHAETZ_TYP["R/B"]
    if typ == "DEB" or " DEB" in n:
        return SCHAETZ_TYP["DEB"]
    return SCHAETZ_TYP["PAY"]


def runde(x, stellen):
    try:
        return round(float(x), stellen)
    except (TypeError, ValueError):
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aus", default="data")
    ap.add_argument("--vorher", default="", help="URL oder Ordner der zuletzt veröffentlichten Daten")
    ap.add_argument("--lokal", default="", help="Ordner mit Testdateien statt Internet")
    ap.add_argument("--immer-alles", action="store_true", help="Gruppen, SATCAT und Helligkeiten neu holen")
    args = ap.parse_args()

    q = Quelle(args.lokal or None)
    t0 = jetzt_utc()
    os.makedirs(args.aus, exist_ok=True)
    vorher_quelle = args.vorher or (args.aus if os.path.exists(os.path.join(args.aus, "stand.json")) else "")

    # Vorheriger Stand: erst die veröffentlichte Seite, sonst die Dateien im Ordner (Stand im Repo)
    def vorher(datei):
        x = lade_vorher(vorher_quelle, datei)
        if x is None and vorher_quelle != args.aus and os.path.exists(os.path.join(args.aus, datei)):
            x = lade_vorher(args.aus, datei)
        return x

    v_stand = vorher("stand.json") or {}
    v_kern = vorher("kern.json")
    v_alle = vorher("alle.json")
    v_gruppen = vorher("gruppen.json") or {}
    v_hell = vorher("helligkeit.json") or {}
    v_info = vorher("info.json") or {}

    def alt(feld, tage):
        t = parse_iso(v_stand.get(feld, ""))
        return args.immer_alles or t is None or (t0 - t).total_seconds() > tage * 86400

    meldungen = []

    # ---------- 1. Bahndaten ----------
    log("Bahndaten …")
    bahn = {}            # id -> OMM-dict
    in_gruppe = {}       # id -> set(gruppen) (nur stations/visual)
    quelle_bahn = set()
    geladen = set()
    for g in BAHN_GRUPPEN:
        daten, info = hole_gp(q, g, mindestens=5000 if g == "active" else 3)
        if daten is None:
            meldungen.append(f"Gruppe {g} nicht geladen: {info}")
            log(f"  {g}: FEHLER {info}")
            continue
        geladen.add(g)
        quelle_bahn.add(info)
        for x in daten:
            try:
                nr = int(x["NORAD_CAT_ID"])
            except (KeyError, ValueError, TypeError):
                continue
            alt_x = bahn.get(nr)
            if alt_x is None or str(x.get("EPOCH", "")) > str(alt_x.get("EPOCH", "")):
                bahn[nr] = x
            if g != "active":
                in_gruppe.setdefault(nr, set()).add(g)
        log(f"  {g}: {len(daten)} ({info})")

    # Ausfall: vorherige Bahndaten weiterverwenden (für alles, was fehlt)
    vorher_saetze = {}
    for vd in (v_kern, v_alle):
        if vd and isinstance(vd.get("sats"), list):
            for s in vd["sats"]:
                vorher_saetze[int(s[0])] = s
    if geladen != set(BAHN_GRUPPEN) and vorher_saetze:
        meldungen.append("Bahndaten unvollständig – fehlende Sätze aus dem vorherigen Stand")
        log(f"  vorheriger Stand mit {len(vorher_saetze)} Sätzen wird ergänzt")
    if not bahn and not vorher_saetze:
        log("KEINE Bahndaten verfügbar – Abbruch")
        sys.exit(2)

    # ---------- 2. Gruppen für die Einordnung ----------
    gruppen = dict(v_gruppen.get("gruppen", {})) if isinstance(v_gruppen, dict) else {}
    gruppen_stand = v_stand.get("gruppen_stand")
    if alt("gruppen_stand", 1) or not gruppen:
        log("Gruppen …")
        ok = 0
        for g in KAT_GRUPPEN:
            daten, info = hole_gp(q, g)
            if daten is None:
                log(f"  {g}: nicht geladen ({info[:120]})")
                continue
            gruppen[g] = sorted({int(x["NORAD_CAT_ID"]) for x in daten if "NORAD_CAT_ID" in x})
            ok += 1
            time.sleep(0 if q.lokal else 1.0)  # CelesTrak schonen
        log(f"  {ok} von {len(KAT_GRUPPEN)} Gruppen geladen")
        if ok >= len(KAT_GRUPPEN) // 2:
            gruppen_stand = iso(t0)
        else:
            meldungen.append(f"nur {ok} Gruppen geladen")
    for g in ("visual", "stations"):  # aktuelle Mitglieder merken (Zwischenspeicher)
        if g in geladen:
            gruppen[g] = sorted(nr for nr, gs in in_gruppe.items() if g in gs)
    gruppen_von = {}
    for g, ids in gruppen.items():
        for nr in ids:
            gruppen_von.setdefault(int(nr), set()).add(g)
    for nr, gs in in_gruppe.items():
        gruppen_von.setdefault(nr, set()).update(gs)

    # ---------- 3. Helligkeiten ----------
    hell = dict(v_hell.get("mag", {})) if isinstance(v_hell, dict) else {}
    hell_stand = v_stand.get("helligkeit_stand")
    if alt("helligkeit_stand", 7) or not hell:
        log("Helligkeiten (qs.mag) …")
        try:
            neu = parse_qsmag(q.text(QSMAG, name="qs.mag"))
            if len(neu) > 1000:
                hell = neu
                hell_stand = iso(t0)
                log(f"  {len(hell)} Einträge")
            else:
                meldungen.append("qs.mag zu kurz")
        except Exception as e:  # noqa: BLE001
            meldungen.append(f"qs.mag nicht geladen: {e}")
            log(f"  FEHLER {e}")

    # ---------- 4. Satellitenkatalog ----------
    alle_ids = set(bahn) | set(vorher_saetze)
    info = dict(v_info.get("sats", {})) if isinstance(v_info, dict) else {}
    satcat_stand = v_stand.get("satcat_stand")
    fehlend = sum(1 for nr in alle_ids if str(nr) not in info)
    if alt("satcat_stand", 3) or fehlend > max(50, 0.02 * len(alle_ids)):
        log(f"SATCAT … (fehlend: {fehlend})")
        for name, url in (("CelesTrak", CELESTRAK_SATCAT), ("Spiegel", SPIEGEL_SATCAT)):
            try:
                neu = parse_satcat(q.text(url, name="satcat.csv", timeout=180), alle_ids)
                if len(neu) > 0.8 * len(alle_ids):
                    info.update(neu)
                    satcat_stand = iso(t0)
                    log(f"  {len(neu)} Einträge ({name})")
                    break
                log(f"  {name}: nur {len(neu)} Einträge")
            except Exception as e:  # noqa: BLE001
                log(f"  {name}: FEHLER {e}")
            if q.lokal:
                break
        else:
            meldungen.append("SATCAT nicht geladen")

    # ---------- 5. Sätze bauen ----------
    log("Sätze bauen …")
    saetze = {}
    neueste = None
    for nr, x in bahn.items():
        try:
            name = str(x.get("OBJECT_NAME", "")).strip() or f"#{nr}"
            ep = epoche_sekunden(x["EPOCH"])
            neueste = ep if neueste is None or ep > neueste else neueste
            satz = [
                nr, name, str(x.get("OBJECT_ID") or ""), ep,
                runde(x.get("MEAN_MOTION"), 8), runde(x.get("ECCENTRICITY"), 8),
                runde(x.get("INCLINATION"), 4), runde(x.get("RA_OF_ASC_NODE"), 4),
                runde(x.get("ARG_OF_PERICENTER"), 4), runde(x.get("MEAN_ANOMALY"), 4),
                float(x.get("BSTAR") or 0.0), float(x.get("MEAN_MOTION_DOT") or 0.0),
                float(x.get("MEAN_MOTION_DDOT") or 0.0), int(x.get("REV_AT_EPOCH") or 0),
                "", 0, None,
            ]
        except Exception as e:  # noqa: BLE001
            log(f"  Satz {nr} übersprungen: {e}")
            continue
        if not (0.05 < satz[4] < 20) or not (0 <= satz[5] < 1):
            continue
        saetze[nr] = satz
    # fehlende aus dem vorherigen Stand – nur wenn eine Gruppe ausfiel
    # (sonst blieben verglühte Satelliten für immer in den Daten)
    if geladen != set(BAHN_GRUPPEN):
        nur_kern = "active" in geladen  # active da -> nur stations/visual fehlen
        for nr, s in vorher_saetze.items():
            if nr in saetze:
                continue
            if nur_kern and not (int(s[15]) & 3):
                continue
            s = list(s)
            s[14], s[15], s[16] = "", 0, None
            saetze[nr] = s

    for nr, s in saetze.items():
        i = info.get(str(nr))
        typ = i[0] if i else ""
        rcs = i[5] if i else None
        gs = gruppen_von.get(nr, set())
        flags = 0
        if "visual" in gs:
            flags |= 1
        if "stations" in gs:
            flags |= 2
        if typ == "R/B" or " R/B" in s[1].upper():
            flags |= 8
        if typ == "DEB" or " DEB" in s[1].upper():
            flags |= 16
        m = hell.get(str(nr))
        if m is not None:
            mag = round(m + MCCANTS_ZUSCHLAG, 1)
            flags |= 4
        else:
            mag = schaetz_mag(s[1], typ, rcs)
        s[14] = kategorie(nr, s[1], gruppen_von, typ)
        s[15] = flags
        s[16] = mag

    kern_ids = {nr for nr, s in saetze.items() if s[15] & 3 or nr == ISS_ID}
    felder = ["id", "name", "cospar", "epoche", "n", "e", "i", "raan", "argp", "m",
              "bstar", "ndot", "nddot", "umlauf", "kat", "flags", "mag"]
    stand_iso = iso(t0)
    kopf = {"stand": stand_iso, "felder": felder}
    kern = dict(kopf, sats=[saetze[nr] for nr in sorted(kern_ids)])
    alle = dict(kopf, sats=[saetze[nr] for nr in sorted(saetze) if nr not in kern_ids])

    info_aus = {
        "stand": satcat_stand or stand_iso,
        "felder": ["typ", "status", "land", "start", "ort", "rcs"],
        "sats": {str(nr): info[str(nr)] for nr in sorted(saetze) if str(nr) in info},
    }
    gruppen_aus = {"stand": gruppen_stand, "gruppen": gruppen}
    hell_aus = {"stand": hell_stand, "hinweis": "McCants qs.mag (volle Phase); Seite rechnet +1,0 mag",
                "mag": hell}

    from collections import Counter
    zaehler = Counter(s[14] for s in saetze.values())
    stand = {
        "erzeugt": stand_iso,
        "bahndaten_quelle": ", ".join(sorted(quelle_bahn)) or "vorherige Daten",
        "neueste_epoche": iso(dt.datetime.fromtimestamp(neueste, dt.timezone.utc)) if neueste else None,
        "anzahl": len(saetze),
        "kern": len(kern["sats"]),
        "kategorien": dict(sorted(zaehler.items())),
        "gruppen_stand": gruppen_stand,
        "satcat_stand": satcat_stand,
        "helligkeit_stand": hell_stand,
        "meldungen": meldungen,
    }

    def schreibe(name, obj):
        pfad = os.path.join(args.aus, name)
        tmp = pfad + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, pfad)
        log(f"  {name}: {os.path.getsize(pfad) / 1024:.0f} KB")

    log("Schreiben …")
    schreibe("kern.json", kern)
    schreibe("alle.json", alle)
    schreibe("info.json", info_aus)
    schreibe("gruppen.json", gruppen_aus)
    schreibe("helligkeit.json", hell_aus)
    schreibe("stand.json", stand)
    log(json.dumps(stand, ensure_ascii=False, indent=1))
    if len(saetze) < 1000:
        log("Zu wenige Sätze – Fehler")
        sys.exit(3)


if __name__ == "__main__":
    main()

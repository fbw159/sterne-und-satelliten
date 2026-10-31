# Satelliten über mir

**Seite:** https://fbw159.github.io/sterne-und-satelliten/

Welche Satelliten fliegen gerade über mir – und welche davon kann ich sehen? Die Seite zeigt alle aktiven Satelliten (gut 16.000) auf einem drehbaren 3D-Globus, hebt die ISS hervor und markiert, welche Satelliten jetzt von der Sonne angestrahlt und bei dir mit bloßem Auge zu sehen sind. Gemacht fürs Handy, funktioniert auch am PC.

## Was die Seite kann

- **Globus** mit Tag- und Nachtseite (echter Sonnenstand), Stadtlichtern, Sternenhimmel und allen Satelliten. Drehen mit einem Finger, zoomen mit zwei.
- **Dein Standort** wird per GPS bestimmt und bleibt auf dem Gerät. Ohne Freigabe: Berlin als Ersatz, Ort auf dem Globus wählbar.
- **ISS** mit eigenem Zeichen, Bahn, Bodenspur, angedockten Raumschiffen und allen Überflügen der nächsten 5 Tage.
- **Sichtbarkeit:** gelb = jetzt mit bloßem Auge zu sehen (über dem Horizont, angestrahlt, bei dir dunkel genug, hell genug), hell = angestrahlt, blass = im Erdschatten.
- **Antippen** zeigt einen Steckbrief: Richtung, Höhe am Himmel, Entfernung, geschätzte Helligkeit, Flughöhe, Tempo, nächste Überflüge, Herkunft, Start, Bahn und Wissenswertes.
- **Heute Nacht:** alle sichtbaren Überflüge heller Satelliten in den nächsten 24 Stunden.
- **Himmelskarte:** dein Himmel von unten gesehen, mit Sternen, Mond und Bahn des gewählten Satelliten.
- **Zeigen:** Das Handy führt dich mit Lagesensoren und Kompass zum Satelliten (Pfeil, Fadenkreuz, auf Wunsch mit Kamerabild). Missweisung nach WMM2025 wird berücksichtigt, Abgleich mit dem Mond möglich.

## Wie es funktioniert

- Die Positionen werden im Browser laufend aus den Bahndaten berechnet (SGP4 mit satellite.js, in einem Web Worker). Zwischen den Rechenschritten wird die Bewegung im Grafikprozessor fortgeschrieben – deshalb bewegen sich die Satelliten flüssig in Echtzeit.
- Frische Bahndaten holt sich die Seite selbst direkt bei CelesTrak: Raumstationen und helle Satelliten, sobald ihre Daten älter als 6 Stunden sind (höchstens alle 2 Stunden), alle übrigen einmal am Tag (im Browser zwischengespeichert). Der Ordner `data/` im Repository ist der Startstand; er wird mit `tools/daten_bauen.py` erneuert.
- Rechnungen geprüft gegen Skyfield: Richtung und Höhe auf etwa 0,003°, Überflugzeiten auf etwa 2 Sekunden, Sonnenlicht ja/nein ohne Abweichung.
- Die Helligkeit ist eine Schätzung (Standardhelligkeit, Entfernung, Phasenwinkel, Dunst nahe am Horizont).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `css/app.css` | Seite und Aussehen |
| `js/main.js` | Ablauf, Listen, Standort, Einstellungen |
| `js/globus.js` | 3D-Globus (three.js) |
| `js/rechner.js` | Rechen-Worker: Bahnen, Sichtbarkeit, Überflüge |
| `js/astro.js` | Sonne, Mond, Koordinaten, Erdschatten, Helligkeit |
| `js/himmel.js`, `js/zeigen.js` | Himmelskarte und Zeige-Modus |
| `js/steckbrief.js`, `js/texte.js` | Steckbrief und Texte |
| `js/magvar.js` | Missweisung (World Magnetic Model 2025) |
| `data/` | Startstand der Bahndaten, Katalog, Helligkeiten, Sterne |
| `tools/daten_bauen.py` | holt und bereitet die Bahndaten für `data/` auf (CelesTrak, SATCAT, Helligkeiten) |
| `lib/` | three.js, satellite.js und die Lizenzen (`lib/LIZENZEN.md`) |

## Quellen

Bahndaten und Satellitenkatalog: [CelesTrak](https://celestrak.org) (T. S. Kelso). Helligkeiten: Mike McCants (qs.mag). Erdbilder: NASA Blue Marble und City Lights. Land/Wasser: Natural Earth. Sterne: Yale Bright Star Catalog. Missweisung: World Magnetic Model 2025 (NOAA/BGS). Software: three.js, satellite.js. Einzelheiten in `lib/LIZENZEN.md`.

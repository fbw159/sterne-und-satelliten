# Satelliten über mir

**Seite:** https://fbw159.github.io/sterne-und-satelliten/

Welche Satelliten fliegen gerade über mir – und welche davon kann ich sehen? Die Seite zeigt alle aktiven Satelliten (gut 16.000) auf einem drehbaren 3D-Globus, hebt die ISS hervor und markiert, welche Satelliten jetzt von der Sonne angestrahlt und bei dir mit bloßem Auge zu sehen sind. Mit **Himmel live** hältst du das Handy hoch und siehst Sterne, Sternbilder, Planeten, Mond und Satelliten genau in der Richtung, in die es zeigt. Gemacht fürs Handy, funktioniert auch am PC.

## Was die Seite kann

- **Globus** mit Tag- und Nachtseite (echter Sonnenstand), scharfen Erdbildern, Stadtlichtern, Mondlicht auf der Nachtseite, Atmosphäre am Rand, Küsten und Landesgrenzen, Sternenhimmel und allen Satelliten. Beim Start fliegt die Kamera aus dem All zu deinem Ort.
- **Bedienung wie bei einer Karte:** ein Finger verschiebt (mit Schwung), zwei Finger zoomen, drehen (Finger im Kreis) und neigen (beide Finger nebeneinander hoch- oder runterschieben). Die Kamera folgt den Fingern weich nach; solange man zieht, stellt die Seite andere Rechenarbeit zurück, und auf langsamen Geräten senkt sie die Auflösung – damit nichts ruckelt. So sieht man die Satelliten über dem eigenen Ort von der Seite. Der Würfel-Knopf fliegt direkt in diese Seitenansicht, die Kompassnadel richtet alles wieder nach Norden aus. Am PC: ziehen, rechte Maustaste (oder Strg) + ziehen, Mausrad.
- **Weniger Gewimmel – oder Überblick:** Normal sind Satelliten über deinem Horizont groß und kräftig, alle anderen dezent; Starlink und die übrigen Internet-Schwärme treten zurück, am Erdrand verblassen sie. Der Schalter „Überblick“ zeigt dagegen alle Satelliten groß in der Farbe ihrer Art, mit einer Farbleiste zum Aus- und Einblenden einzelner Arten.
- **Dein Standort** wird per GPS bestimmt und bleibt auf dem Gerät. Ohne Freigabe: Berlin als Ersatz, Ort auf dem Globus wählbar.
- **ISS** mit eigenem Zeichen, Bahn, Bodenspur, angedockten Raumschiffen, „fliegt gerade über …“ und allen Überflügen der nächsten 5 Tage.
- **Sichtbarkeit:** gelb = jetzt mit bloßem Auge zu sehen (über dem Horizont, angestrahlt, bei dir dunkel genug, hell genug), hell = angestrahlt, blass = im Erdschatten.
- **Antippen** öffnet eine Infobox: was es ist (Satellit, Raumstation, Raketenstufe …), wofür er da ist, wer ihn betreibt, seit wann er im All ist und von wo er gestartet ist – dazu Richtung, Höhe am Himmel, Entfernung, geschätzte Helligkeit, Flughöhe, Tempo, über welchem Land oder Meer er gerade fliegt, nächste Überflüge, Wissenswertes und Bahndaten. Die Box lässt sich kleinklappen; auch Sterne, Planeten, Mond und Sternbilder der Himmelskarte bekommen eine Infobox.
- **Heute Nacht:** alle sichtbaren Überflüge heller Satelliten in den nächsten 24 Stunden.
- **Himmelskarte:** dein Himmel wie eine Karte, die vor dir auf dem Boden liegt (Norden oben, Osten rechts), mit Sternen, Sternbildern, Planeten, Mond und Bahn des gewählten Satelliten; Satelliten, Sternbilder und Planeten einzeln ein- und ausschaltbar. Mit dem Kompass-Knopf dreht sich die Karte so, dass ihre Richtungen zur Wirklichkeit passen, wenn das Handy flach liegt. Darunter Mond und Planeten mit Auf- und Untergang.
- **Himmel live** (Knopf auf dem Startbildschirm): Das Handy zeigt mit Lagesensoren und Kompass den Himmel in Blickrichtung – Sterne bis 6 mag, Sternbilder mit deutschen Namen, Planeten, Mond (mit richtiger Phase) und Satelliten. Sternbild-Linien enden kurz vor den Sternen, die Sterne der Figuren sind etwas kräftiger; das Sternbild, auf das das Handy zeigt (oder das Ziel), wird hervorgehoben und groß beschriftet, und oben steht, wohin man schaut. Was jetzt zu sehen ist, wird hervorgehoben und steht in der Leiste „Jetzt zu sehen“; sichtbare Satelliten zeigen ihre Flugrichtung. Antippen = „Was ist das?“ (Entfernung, Helligkeit, Farbe, wann das Licht losflog …). „Hinführen“ führt mit Pfeil und Fadenkreuz zum Ziel. Die **Suche** (Lupe) findet Sternbilder, Planeten, Mond, helle Sterne und die ISS – auf Deutsch oder Latein, auch Beinamen wie „Großer Wagen“ oder „Plejaden“ – und führt direkt hin. Knöpfe unter dem Suchfeld zeigen nur Sternbilder, nur Sterne, nur Planeten & Mond oder nur Satelliten (die Wahl bleibt gespeichert); ohne Suchbegriff lässt sich die Liste durchblättern, was gerade über dem Horizont steht, zuerst. Satelliten, Sternbilder und Planeten lassen sich einzeln ein- und ausschalten. Dazu Rotlicht für dunkle Nächte (Knopf auch oben in der Kopfzeile, gilt für die ganze Seite), Kamerabild und Kompass-Abgleich mit einem hellen Stern, Planeten oder dem Mond. Missweisung nach WMM2025 wird berücksichtigt. Am PC: mit der Maus ziehen und zoomen; „Hinführen“ dreht den Blick dort selbst zum Ziel.

## Wie es funktioniert

- Die Positionen werden im Browser laufend aus den Bahndaten berechnet (SGP4 mit satellite.js, in einem Web Worker). Zwischen den Rechenschritten wird die Bewegung im Grafikprozessor fortgeschrieben – deshalb bewegen sich die Satelliten flüssig in Echtzeit.
- Frische Bahndaten holt sich die Seite selbst direkt bei CelesTrak: Raumstationen und helle Satelliten, sobald ihre Daten älter als 6 Stunden sind (höchstens alle 2 Stunden), alle übrigen einmal am Tag bzw. sobald ihre Bahndaten im Mittel älter als 3 Tage sind (im Browser zwischengespeichert). Der Ordner `data/` im Repository ist der Startstand; er wird mit `tools/daten_bauen.py` erneuert.
- Planeten und Mond berechnet Astronomy Engine, Sterne und Sternbild-Linien werden mit Präzession und Sternzeit auf deinen Himmel umgerechnet.
- Rechnungen geprüft gegen Skyfield (JPL DE421): Satelliten in Richtung und Höhe auf etwa 0,003°, Überflugzeiten auf etwa 2 Sekunden, Sonnenlicht ja/nein ohne Abweichung; Planeten, Mond und Sterne auf besser als eine halbe Bogenminute.
- Die Helligkeit von Satelliten ist eine Schätzung (Standardhelligkeit, Entfernung, Phasenwinkel, Dunst nahe am Horizont).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `css/app.css` | Seite und Aussehen |
| `js/main.js` | Ablauf, Listen, Standort, Einstellungen |
| `js/globus.js` | 3D-Globus (three.js) |
| `js/steuerung.js` | Kamerasteuerung des Globus: verschieben, zoomen, drehen, neigen |
| `js/rechner.js` | Rechen-Worker: Bahnen, Sichtbarkeit, Überflüge |
| `js/astro.js` | Sonne, Mond, Koordinaten, Erdschatten, Helligkeit |
| `js/zeigen.js` | Himmel live (Lagesensoren, Kompass, Hinführen) |
| `js/himmel.js` | Himmelskarte |
| `js/himmelsdaten.js` | Sterne, Sternbilder, Planeten (Astronomy Engine) |
| `js/wasistdas.js` | Texte für „Was ist das?“ |
| `js/etiketten.js` | Beschriftungen ohne Überlappung |
| `js/orte.js` | „Gerade über …“: Land, See oder Meer |
| `js/steckbrief.js`, `js/texte.js` | Infobox der Satelliten und Texte (Art, Zweck, Betreiber) |
| `js/suche.js` | Suche in „Himmel live“ |
| `js/magvar.js` | Missweisung (World Magnetic Model 2025) |
| `data/` | Startstand der Bahndaten, Katalog, Helligkeiten, Sterne, Sternbilder, Küsten und Grenzen, Länder- und Meeresnamen |
| `tools/daten_bauen.py` | holt und bereitet die Bahndaten für `data/` auf (CelesTrak, SATCAT, Helligkeiten) |
| `tools/himmel_bauen.py` | baut `data/sterne.json` und `data/sternbilder.json` |
| `tools/erde_bauen.py` | baut `data/grenzen.json` und `data/orte.json` aus Natural Earth |
| `lib/` | three.js, satellite.js, Astronomy Engine und die Lizenzen (`lib/LIZENZEN.md`) |

## Quellen

Bahndaten und Satellitenkatalog: [CelesTrak](https://celestrak.org) (T. S. Kelso). Helligkeiten: Mike McCants (qs.mag). Erdbilder: NASA Blue Marble und City Lights. Küsten, Grenzen, Land/Wasser, Länder- und Meeresnamen: Natural Earth. Sterne: Yale Bright Star Catalog. Sternbilder: d3-celestial (Olaf Frohn) nach den IAU-Sternkarten. Planeten: Astronomy Engine (Don Cross). Missweisung: World Magnetic Model 2025 (NOAA/BGS). Software: three.js, satellite.js. Einzelheiten in `lib/LIZENZEN.md`.

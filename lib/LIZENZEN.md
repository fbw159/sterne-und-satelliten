# Fremde Bestandteile und Lizenzen

Diese Seite nutzt folgende Bibliotheken, Daten und Bilder. Herzlichen Dank an alle Urheber.

| Bestandteil | Datei(en) | Herkunft | Lizenz |
|---|---|---|---|
| three.js 0.186.1 (mit OrbitControls) | `lib/three.min.js` | https://threejs.org – zu einer Datei gebündelt und verkleinert | MIT |
| satellite.js 7.1.0 (SGP4/SDP4) | `lib/satellite.min.js` | https://github.com/shashwatak/satellite-js – benötigte Teile gebündelt | MIT |
| World Magnetic Model 2025 (Koeffizienten) | `js/magvar.js` | NOAA NCEI / British Geological Survey; Rechenweg aus dem npm-Paket „magvar“ 2.2.0 von Darren Yeates | Modell: gemeinfrei (US-Regierung); Code: MIT |
| Yale Bright Star Catalog 5 | `data/sterne.json` | Hoffleit & Warren, Yale; JSON-Fassung von Bretton Wade (github.com/brettonw/YaleBrightStarCatalog) | MIT (JSON-Fassung) |
| Erde am Tag (Blue Marble) | `img/erde-tag-2k.jpg`, `img/erde-tag-4k.jpg` | NASA Visible Earth, Blue Marble (über das npm-Paket three-globe) | gemeinfrei (NASA) |
| Erde bei Nacht (City Lights) | `img/erde-nacht.jpg` | NASA Earth Observatory / NASA GSFC (über das npm-Paket three-globe), daraus nur die Lichter herausgerechnet | gemeinfrei (NASA) |
| Land-/Wassermaske | `img/erde-wasser.jpg` | aus Natural Earth 1:50m (über das npm-Paket world-atlas 2.0.2) gerastert | Natural Earth: gemeinfrei; world-atlas: ISC |
| Bahndaten (GP/OMM) und Satellitenkatalog | `data/kern.json`, `data/alle.json`, `data/info.json` | CelesTrak (T. S. Kelso), https://celestrak.org – bei Ausfall Spiegel auf GitHub | frei nutzbar laut CelesTrak |
| Standardhelligkeiten | `data/helligkeit.json` | Mike McCants, qs.mag (über github.com/barolfe/satellite-tracker) | frei verbreitete Beobachtungsdaten |
| Kurztexte aus der Wikipedia | werden im Browser geladen | de.wikipedia.org | CC BY-SA 4.0 |

---

## three.js

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---

## satellite.js

MIT License

Copyright (C) 2013 Shashwat Kandadai, UCSC Jack Baskin School of Engineering

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## magvar (Rechenweg für die Missweisung)

MIT License

Copyright (c) 2025 Darren Yeates

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Yale Bright Star Catalog (JSON-Fassung)

MIT License

Copyright (c) 2016 Bretton Wade

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## world-atlas

Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

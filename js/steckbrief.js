// Steckbrief eines Satelliten: Kopf, Live-Werte, Überflüge, Wissenswertes, Bahn, Verweise
import * as A from "./astro.js";
import { KAT } from "./globus.js";
import { LAND, STARTPLATZ, ART, BETRIEB, KAT_TEXT, bekannt, anzeigeName } from "./texte.js";
import { esc, zahl, km, grad, mag, uhr, tag, dauer, datum, relativ, alterText, helligkeitWort } from "./ui.js";

const LICHT_C = 299792.458; // km/s

export function zustandText(st, d, sonneEl) {
  if (!d) return { text: "Keine Bahndaten", ja: false };
  if (st & 8) return { text: "Jetzt mit bloßem Auge zu sehen! Schau nach " + A.richtung(d.az) + ", " + Math.round(d.el) + "° hoch.", ja: true };
  if (!(st & 2)) return { text: "Gerade unter deinem Horizont – von dir aus nicht zu sehen.", ja: false };
  if (!(st & 4)) return { text: "Über dir, aber im Erdschatten – unsichtbar.", ja: false };
  if (sonneEl != null && sonneEl > -3) return { text: "Über dir und angestrahlt, aber der Himmel ist zu hell.", ja: false };
  if (d.el < 10) return { text: "Angestrahlt, aber sehr tief am Horizont.", ja: false };
  return { text: "Über dir und angestrahlt, aber zu schwach fürs bloße Auge (Fernglas).", ja: false };
}

export function passArtText(p) {
  switch (p.art) {
    case 1: {
      const a = uhr(p.sichtbar.start), b = uhr(p.sichtbar.ende);
      const wann = a === b ? `um ${a} Uhr` : `${a}–${b} Uhr`;
      const wo = A.richtung(p.sichtbar.azStart) === A.richtung(p.sichtbar.azEnde) ? `im ${A.richtung(p.sichtbar.azStart)}` : `von ${A.richtung(p.sichtbar.azStart)} nach ${A.richtung(p.sichtbar.azEnde)}`;
      return { text: `sichtbar ${wann}, ${wo}`, ja: true };
    }
    case 2: return { text: "angestrahlt, aber zu schwach fürs bloße Auge", ja: false };
    case 3: return { text: "am Taghimmel – nicht zu sehen", ja: false };
    case 4: return { text: "angestrahlt, aber der Himmel ist noch zu hell", ja: false };
    default: return { text: "im Erdschatten – nicht zu sehen", ja: false };
  }
}

export function passHtml(p, name = null, mitTag = true) {
  const a = passArtText(p);
  const m = p.art === 1 && p.hellste != null ? `<span class="mag">${mag(p.hellste)}</span>` : "";
  const min = Math.max(1, Math.round(p.dauer / 60));
  return `<div class="pass-zeit"><span>${mitTag ? tag(p.start) + " " : ""}${uhr(p.start)}–${uhr(p.ende)}${name ? " · " + esc(name) : ""}</span>${m}</div>
    <div class="pass-weg">↗ ${A.richtung(p.azStart)} · höchster Punkt ${Math.round(p.maxEl)}° in ${A.richtung(p.azMax)} um ${uhr(p.maxT)} · ↘ ${A.richtung(p.azEnde)} · ${min} min</div>
    <div class="pass-art${a.ja ? " ja" : ""}">${a.ja ? "★ " : ""}${esc(a.text)}</div>`;
}

function landText(code) {
  if (!code) return "–";
  return LAND[code] || code;
}

function wikiUrl(begriff) {
  return `https://de.wikipedia.org/w/index.php?search=${encodeURIComponent(begriff)}&go=Artikel`;
}

export function steckbriefHtml(c) {
  const s = c.sat;
  const id = s[0], name = s[1], cospar = s[2], epoche = s[3] * 1000, n = s[4], e = s[5], incl = s[6], kat = s[14], flags = s[15];
  const b = bekannt(id, name);
  const h = A.bahnHoehen(n, e);
  const katInfo = KAT[kat] || KAT.sonst;
  const titel = anzeigeName(name);
  const info = c.info;
  const art = A.bahnArt(n, e, incl, h.hp, h.ha);

  let html = `<div class="sb-kopf">
    <button class="rund" data-aktion="zurueck" aria-label="Zurück"><svg><use href="#i-zurueck"/></svg></button>
    <div class="sb-titel"><h2>${esc(titel)}${id === 25544 ? '<span class="etikett e-iss">ISS</span>' : ""}</h2>
    <p class="sb-unter"><i class="punkt" style="background:${katInfo.farbe}"></i>${esc(kat === "iss" ? "Raumstation" : katInfo.name)} · Nr. ${id}${cospar ? " · " + esc(cospar) : ""}</p></div>
  </div>
  <div class="zustand" data-wert="zustand"><svg><use href="#i-auge"/></svg><span>…</span></div>
  <div class="raster">
    <div><small>Richtung</small><span data-wert="richtung">–</span></div>
    <div><small>Höhe am Himmel</small><span data-wert="el">–</span></div>
    <div><small>Entfernung zu dir</small><span data-wert="r">–</span></div>
    <div><small>Helligkeit</small><span data-wert="mag">–</span></div>
    <div><small>Flughöhe</small><span data-wert="hoehe">–</span></div>
    <div><small>Tempo</small><span data-wert="tempo">–</span></div>
    <div><small>Gerade über</small><span data-wert="ueber">–</span></div>
    <div><small>Sonnenlicht</small><span data-wert="licht">–</span></div>
  </div>
  <div class="knopf-reihe">
    <button class="knopf-gross haupt" data-aktion="zeigen"><svg><use href="#i-handy"/></svg>Zeigen</button>
    <button class="knopf-gross" data-aktion="folgen" aria-pressed="false"><svg><use href="#i-folgen"/></svg>Folgen</button>
    <button class="knopf-gross" data-aktion="himmel"><svg><use href="#i-bahn"/></svg>Am Himmel</button>
  </div>`;

  if (id === 25544 || id === 48274) html += `<div data-wert="angedockt"></div>`;

  html += `<h3 class="abschnitt">Nächste Überflüge bei dir</h3><ol class="pass-liste" data-wert="ueberfluege"><li class="leer">wird berechnet …</li></ol>`;

  // Wissenswertes
  const fakten = [];
  const P = h.periode;
  if (art === "geostationär") {
    fakten.push("Er umkreist die Erde genau einmal pro Tag – so schnell, wie sie sich dreht. Deshalb scheint er von der Erde aus still am Himmel zu stehen.");
  } else if (P < 225) {
    fakten.push(`Eine Erdumrundung dauert ${zahl(P)} Minuten – das sind ${zahl(1440 / P, 1)} Runden am Tag. So erlebt er jeden Tag etwa ${Math.round(1440 / P)} Sonnenaufgänge.`);
  } else {
    fakten.push(`Eine Erdumrundung dauert ${P < 1440 ? zahl(P / 60, 1) + " Stunden" : zahl(P / 1440, 1) + " Tage"}.`);
  }
  fakten.push('<span data-wert="fakt-tempo"></span>');
  fakten.push('<span data-wert="fakt-licht"></span>');
  if (info && info[3]) {
    const start = Date.parse(info[3] + "T12:00:00Z");
    const jahre = (c.jetzt - start) / (365.25 * 86400000);
    if (jahre > 0.05) {
      const runden = (c.jetzt - start) / 60000 / P;
      const strecke = runden * 2 * Math.PI * (A.RE + (h.hp + h.ha) / 2);
      let t = `Seit dem Start vor ${jahre < 1 ? Math.round(jahre * 12) + " Monaten" : zahl(jahre, jahre < 10 ? 1 : 0) + " Jahren"} hat er die Erde etwa ${zahl(Math.round(runden / (runden > 1000 ? 100 : 1)) * (runden > 1000 ? 100 : 1))}-mal umrundet`;
      if (strecke > 2e8) t += ` und rund ${zahl(strecke / 1e9, 1)} Milliarden km zurückgelegt – ${zahl(strecke / 149.6e6)}-mal so weit wie von der Erde zur Sonne.`;
      else if (strecke > 1e6) t += ` und rund ${zahl(strecke / 1e6)} Millionen km zurückgelegt.`;
      else t += ".";
      fakten.push(t + " (grob geschätzt)");
    }
  }
  const teile = [];
  const kt = KAT_TEXT[kat];
  if (b && b.text) teile.push(b.text);
  if (kt && kat !== "iss" && kat !== "station" && !(b && b.text === kt)) {
    if (kat === "starlink") teile.unshift(kt); else teile.push(kt);
  }
  html += `<h3 class="abschnitt">Wissenswert</h3><div class="texte">${teile.map((t) => `<p>${esc(t)}</p>`).join("")}<ul class="fakten">${fakten.map((f) => `<li>${f}</li>`).join("")}</ul></div>`;
  html += `<div class="wiki" data-wert="wiki" hidden></div>`;

  // Steckbrief
  html += `<h3 class="abschnitt">Steckbrief</h3><table class="tabelle">`;
  if (info) {
    html += `<tr><td>Art</td><td>${esc(kat === "iss" || (kat === "station" && info[0] === "PAY") ? "Raumstation / Raumschiff" : ART[info[0]] || info[0] || "–")}</td></tr>`;
    html += `<tr><td>Land / Betreiber</td><td>${esc(landText(info[2]))}</td></tr>`;
    if (info[3]) html += `<tr><td>Start</td><td>${esc(datum(Date.parse(info[3] + "T12:00:00Z")))}</td></tr>`;
    if (info[4]) html += `<tr><td>Startplatz</td><td>${esc(STARTPLATZ[info[4]] || info[4])}</td></tr>`;
    html += `<tr><td>Zustand</td><td>${esc(BETRIEB[info[1]] || "unbekannt")}</td></tr>`;
    if (info[5]) html += `<tr><td>Radar-Querschnitt</td><td>${zahl(info[5], info[5] < 1 ? 2 : 1)} m²</td></tr>`;
  } else {
    html += `<tr><td colspan="2" class="leer" data-wert="info-laedt">Katalogangaben werden geladen …</td></tr>`;
  }
  const helligkeitQuelle = flags & 4 ? "beobachtet, nach M. McCants" : "geschätzt";
  html += `<tr><td>Grundhelligkeit</td><td>${s[16] != null ? zahl(s[16], 1) + " mag" : "–"} <small>(in 1000 km Entfernung, ${helligkeitQuelle})</small></td></tr></table>`;

  // Bahn
  html += `<h3 class="abschnitt">Umlaufbahn</h3><table class="tabelle">
    <tr><td>Bahnform</td><td>${esc(art)}</td></tr>
    <tr><td>Umlaufzeit</td><td>${P < 120 ? zahl(P, 1) + " min" : P < 2880 ? zahl(P / 60, 2) + " Std." : zahl(P / 1440, 2) + " Tage"}</td></tr>
    <tr><td>Höhe</td><td>${Math.abs(h.ha - h.hp) < 25 ? "etwa " + km((h.ha + h.hp) / 2) : km(h.hp) + " bis " + km(h.ha)}</td></tr>
    <tr><td>Bahnneigung</td><td>${grad(incl, 1)}${incl < 90 ? ` – überfliegt Orte bis ${grad(incl)} nördlicher und südlicher Breite` : incl < 180 ? " – rückläufige Bahn, überfliegt fast alle Orte" : ""}</td></tr>
    <tr><td>Exzentrizität</td><td>${zahl(e, 4)}${e < 0.01 ? " (fast kreisrund)" : ""}</td></tr>
    <tr><td>Bahndaten vom</td><td>${datum(epoche)}, ${uhr(epoche)} Uhr (vor ${alterText(epoche, c.jetzt)})</td></tr>
  </table>`;

  const wiki = b && b.wiki ? b.wiki : null;
  const suche = (b && b.suche) || name;
  html += `<div class="verweise">
    ${wiki ? `<a href="${wikiUrl(wiki)}" target="_blank" rel="noopener">Wikipedia</a>` : `<a href="${wikiUrl(suche)}" target="_blank" rel="noopener">Wikipedia-Suche</a>`}
    <a href="https://www.n2yo.com/satellite/?s=${id}" target="_blank" rel="noopener">N2YO</a>
    <a href="https://www.heavens-above.com/satinfo.aspx?satid=${id}" target="_blank" rel="noopener">Heavens-Above</a>
    <a href="https://celestrak.org/satcat/table-satcat.php?CATNR=${id}" target="_blank" rel="noopener">CelesTrak</a>
  </div>`;
  return html;
}

/** Live-Werte im geöffneten Steckbrief setzen */
export function steckbriefAktualisieren(el, c) {
  const d = c.detail, st = c.st;
  const setze = (k, v) => { const x = el.querySelector(`[data-wert="${k}"]`); if (x && x.innerHTML !== v) x.innerHTML = v; };
  const z = zustandText(st, d, c.sonneEl);
  const zEl = el.querySelector('[data-wert="zustand"]');
  if (zEl) { zEl.classList.toggle("ja", z.ja); zEl.querySelector("span").textContent = z.text; }
  if (!d) return;
  if (d.az != null) {
    setze("richtung", `${A.richtung(d.az)} (${Math.round(d.az)}°)`);
    setze("el", d.el >= 0 ? grad(d.el) : `unter dem Horizont`);
    setze("r", km(d.r));
    const m = d.el > 0 && d.mag != null ? `${mag(d.mag)} <small>${helligkeitWort(d.mag)}</small>` : d.licht < 0.5 ? "unsichtbar" : "–";
    setze("mag", m);
    const rr = d.rr;
    const bewegung = Math.abs(rr) < 0.05 ? "Sein Abstand zu dir bleibt fast gleich." : `Gerade ${rr < 0 ? "kommt er dir näher" : "entfernt er sich"} mit ${zahl(Math.abs(rr), 1)} km pro Sekunde.`;
    setze("fakt-licht", `Licht braucht von ihm bis zu dir ${zahl(d.r / LICHT_C * 1000, 1)} Millisekunden. ${bewegung}`);
  }
  setze("hoehe", km(d.hoehe));
  const kmh = d.tempo * 3600;
  setze("tempo", `${zahl(Math.round(kmh / 10) * 10)} km/h`);
  setze("ueber", `${zahl(Math.abs(d.lat), 1)}° ${d.lat >= 0 ? "N" : "S"}, ${zahl(Math.abs(d.lon), 1)}° ${d.lon >= 0 ? "O" : "W"}`);
  setze("licht", d.licht >= 0.99 ? "angestrahlt" : d.licht <= 0.01 ? "im Erdschatten" : "im Halbschatten");
  setze("fakt-tempo", `Er fliegt ${zahl(d.tempo, 2)} km pro Sekunde. Für die gut 600 km von Hamburg nach München bräuchte er nur ${zahl(612 / d.tempo)} Sekunden.`);
}

/** Kurzfassung aus der deutschen Wikipedia (nur für bekannte Objekte) */
export async function wikiLaden(el, begriff) {
  const ziel = el.querySelector('[data-wert="wiki"]');
  if (!ziel || !begriff) return;
  try {
    const r = await fetch(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(begriff.replace(/ /g, "_"))}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.extract || j.type === "disambiguation") return;
    const txt = j.extract.length > 420 ? j.extract.slice(0, 400).replace(/\s\S*$/, "") + " …" : j.extract;
    const bild = j.thumbnail && j.thumbnail.source ? `<img src="${esc(j.thumbnail.source)}" alt="" loading="lazy">` : "";
    ziel.innerHTML = `${bild}<p>${esc(txt)}<br><small>Aus der Wikipedia: <a href="${esc(j.content_urls?.desktop?.page || wikiUrl(begriff))}" target="_blank" rel="noopener">${esc(j.title)}</a> (CC BY-SA)</small></p>`;
    ziel.hidden = false;
  } catch { /* offline o. ä. */ }
}

export { relativ };

// Satelliten über mir – Hauptprogramm
import { Globus, KAT } from "./globus.js";
import * as A from "./astro.js";
import { $, $$, esc, zahl, km, mag, uhr, tag, datum, melde, altesVergessen, helligkeitWort } from "./ui.js";
import { steckbriefHtml, steckbriefAktualisieren, wikiLaden, passHtml, zustandText } from "./steckbrief.js";
import { bekannt, anzeigeName, betreiber, artWort, fuerwort } from "./texte.js";
import { Himmel } from "./himmel.js";
import { Zeigen } from "./zeigen.js";
import { missweisung } from "./magvar.js";
import { HimmelDaten, astronomieLaden } from "./himmelsdaten.js";
import { infoHtml } from "./wasistdas.js";
import { orteLaden, ortName } from "./orte.js";

const ISS = 25544;
const ERSATZ_ORT = { lat: 52.5163, lon: 13.3777, name: "Berlin" };
const PC = window.matchMedia("(min-width: 900px)");

// ---------------------------------------------------------------- Einstellungen
// Gelten nur, solange die Seite offen ist – beim nächsten Öffnen wieder alles wie hier (nichts wird gespeichert).
altesVergessen();
const STANDARD = {
  filter: Object.fromEntries(Object.keys(KAT).map((k) => [k, true])),
  himmel: 4.5, ab10: false, linien: true, namen: true, liste: "hell", uebersicht: false,
};
const E = { ...STANDARD, filter: { ...STANDARD.filter } };

// ---------------------------------------------------------------- Zustand
let sats = [];             // Datensätze (kern + alle), Index = Position im Worker
const idx = new Map();     // NORAD-Nummer -> Index
let issIdx = -1;
let info = null;           // Katalogangaben (lazy)
let infoLaedt = null;
let stand = null;          // Datenstand
let tick = null;
let auswahl = -1;
let ort = null;
let B = null;              // Beobachter für Rechnungen im Hauptprogramm
let reiter = "oben";
let issPaesse = null;
let nachtListe = null;
let auswahlBahnHimmel = null;
let letzteListe = 0;
let zeigeBis = 150;

// ---------------------------------------------------------------- Worker
const takter = new Worker(new URL("./rechner.js", import.meta.url), { type: "module" });
const vorher = new Worker(new URL("./rechner.js", import.meta.url), { type: "module" });
let anfrageNr = 0;
const offen = new Map();
function frage(w, msg, transfer = []) {
  return new Promise((res) => {
    const a = ++anfrageNr;
    offen.set(a, res);
    w.postMessage(Object.assign({}, msg, { anfrage: a }), transfer);
  });
}
function antwort(m) {
  if (m.anfrage && offen.has(m.anfrage)) { offen.get(m.anfrage)(m); offen.delete(m.anfrage); return true; }
  return false;
}
vorher.onmessage = (e) => {
  const m = e.data;
  if (m.typ === "fehler") console.warn("Vorhersage-Fehler", m.wo, m.text);
  antwort(m);
};
takter.onmessage = (e) => {
  const m = e.data;
  if (m.typ === "fehler") { console.warn("Rechen-Fehler", m.wo, m.text); taktLaeuft = false; antwort(m); return; }
  if (antwort(m)) return;
  if (m.typ === "takt") taktFertig(m);
  else if (m.typ === "bahn") globus.setzeBahn(m);
};

// ---------------------------------------------------------------- Globus
function globusErsatz() {
  // ohne WebGL: alles außer dem Globus funktioniert weiter
  const leer = () => {};
  const o0 = { folgen: false, ring: { visible: true }, bahnIdx: -1, satPosition: () => null, bedient: false, ansicht: null };
  o0.setzeBahnZiel = (i) => { o0.bahnIdx = i; };
  return new Proxy(o0, {
    get: (o, k) => (k in o ? o[k] : leer),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}
let globus;
try {
  globus = new Globus($("#szene"), globusOptionen());
} catch (e) {
  console.error(e);
  globus = globusErsatz();
  setTimeout(() => { bilderDa = true; startFertig(); melde("Dein Browser kann den 3D-Globus nicht anzeigen (WebGL fehlt). Listen, Himmelskarte und Himmel live funktionieren trotzdem.", 12); blattHoehe("gross"); }, 0);
}
function globusOptionen() { return {
  onWahl: (i) => { if (i < 0 && boxArt === "objekt") objektZu(); waehle(i); },
  onBereit: () => { bilderDa = true; startFertig(); },
  onFehler: (t) => melde(t, 8),
  onOrtTippen: (p) => {
    if (!p) { melde("Bitte direkt auf die Erde tippen."); return; }
    ortSetzen(p.lat, p.lon, "gewählt");
    melde("Standort übernommen.");
  },
  onBedienung: () => {},
  onBild: () => globusKnoepfe(),
}; }
globus.zeigeLinien = E.linien;
globus.zeigeNamen = E.namen;
globus.setzeFilter(E.filter);
globus.setzeUebersicht(E.uebersicht);
let bilderDa = false, datenDa = false, gestartet = false, angeflogen = false;

// ---------------------------------------------------------------- Blatt (unten) bzw. Leiste (rechts)
const blatt = $("#blatt");
const box = $("#infobox");
let boxArt = null; // "sat" | "objekt" | null
document.body.dataset.blatt = blatt.dataset.hoehe;
function blattHoehe(h) {
  if (PC.matches) return;
  blatt.dataset.hoehe = h;
  document.body.dataset.blatt = h;
  boxLage();
  setTimeout(() => { versatzAnpassen(); boxLage(); }, 340);
  if (h !== "klein" && reiter === "oben" && !$("#seite-oben").hidden) listeZeichnen(true);
}
/** Globus in die Mitte der freien Fläche schieben (zwischen Infobox, Blatt bzw. Leiste) */
function versatzAnpassen() {
  const W = window.innerWidth, H = window.innerHeight;
  const offen = !box.hidden;
  if (PC.matches) {
    const links = offen ? box.getBoundingClientRect().right + 8 : 0;
    globus.setzeVersatz(blatt.offsetWidth - links, 0);
    return;
  }
  const oben = offen && box.dataset.lage === "oben" ? box.getBoundingClientRect().bottom + 6 : 0;
  const unten = Math.max(oben + 100, Math.min(blatt.getBoundingClientRect().top, blattObenZiel()));
  // Globus nur ein Stück verschieben, damit er nicht zu klein wird
  globus.setzeVersatz(0, Math.max(-H * 0.5, Math.min(H * 0.5, H - oben - unten)));
  void W;
}
PC.addEventListener("change", () => { blatt.style.transform = ""; boxLage(); versatzAnpassen(); });
window.addEventListener("resize", () => setTimeout(() => { boxLage(); versatzAnpassen(); }, 50));
(function blattZiehen() {
  const kopf = $("#blatt-kopf");
  let z = null;
  kopf.addEventListener("pointerdown", (e) => {
    if (PC.matches) return;
    z = { y: e.clientY, t: performance.now(), top: blatt.getBoundingClientRect().top, id: e.pointerId, bewegt: false, ziel: e.target };
  });
  kopf.addEventListener("pointermove", (e) => {
    if (!z || e.pointerId !== z.id) return;
    const dy = e.clientY - z.y;
    if (!z.bewegt && Math.abs(dy) < 6) return;
    if (!z.bewegt) { z.bewegt = true; blatt.classList.add("zieht"); try { kopf.setPointerCapture(e.pointerId); } catch { /* egal */ } }
    const top = Math.max(60, Math.min(window.innerHeight - 90, z.top + dy));
    blatt.style.transform = `translateY(${top - (window.innerHeight - blatt.offsetHeight)}px)`;
  });
  const ende = (e) => {
    if (!z || e.pointerId !== z.id) return;
    const war = z; z = null;
    blatt.classList.remove("zieht");
    if (!war.bewegt) {
      if (war.ziel.closest("button")) return;
      blattHoehe(blatt.dataset.hoehe === "klein" ? "halb" : "klein");
      return;
    }
    const top = blatt.getBoundingClientRect().top;
    const v = (e.clientY - war.y) / Math.max(1, performance.now() - war.t); // px/ms
    blatt.style.transform = "";
    const H = window.innerHeight;
    const anteil = (H - top) / H;
    let h;
    if (v > 0.6) h = blatt.dataset.hoehe === "gross" ? "halb" : "klein";
    else if (v < -0.6) h = blatt.dataset.hoehe === "klein" ? "halb" : "gross";
    else h = anteil < 0.3 ? "klein" : anteil < 0.7 ? "halb" : "gross";
    blattHoehe(h);
  };
  kopf.addEventListener("pointerup", ende);
  kopf.addEventListener("pointercancel", ende);
})();

// ---------------------------------------------------------------- Reiter
function zeigeReiter(r, auch = true) {
  reiter = r;
  for (const b of $$(".reiter button")) b.setAttribute("aria-selected", String(b.dataset.reiter === r));
  for (const s of $$(".seite")) s.hidden = s.id !== "seite-" + r;
  if (r !== "himmel") { if (boxArt === "objekt") objektZu(); karteKompassAus(); }
  // die Himmelskarte braucht Platz: ganz hochziehen
  if (auch && r === "himmel" && blatt.dataset.hoehe !== "gross") blattHoehe("gross");
  else if (auch && blatt.dataset.hoehe === "klein") blattHoehe("halb");
  $("#blatt-inhalt").scrollTop = 0;
  boxLage();
  if (r === "oben") listeZeichnen(true);
  if (r === "iss") issZeichnen();
  if (r === "nacht") nachtZeichnen();
  if (r === "himmel") requestAnimationFrame(() => himmelZeichnen());
}
for (const b of $$(".reiter button")) b.addEventListener("click", () => zeigeReiter(b.dataset.reiter));
for (const b of $$("button[data-filter]")) b.addEventListener("click", () => {
  E.liste = b.dataset.filter; zeigeBis = 150;
  for (const x of $$("button[data-filter]")) x.setAttribute("aria-pressed", String(x === b));
  listeZeichnen(true);
});
for (const x of $$("button[data-filter]")) x.setAttribute("aria-pressed", String(x.dataset.filter === E.liste));

// ---------------------------------------------------------------- Standort
function ortSetzen(lat, lon, quelle, genau = null) {
  ort = { lat, lon, quelle, genau, zeit: Date.now() };
  B = A.beobachter(lat, lon, 0);
  takter.postMessage({ typ: "ort", lat, lon, h: 0 });
  vorher.postMessage({ typ: "ort", lat, lon, h: 0 });
  globus.setzeBeobachter(lat, lon);
  ortText();
  issPaesse = null; nachtListe = null;
  if (datenDa) { vorhersagenStarten(); taktAnfordern(); }
  if (gestartet) {
    if (!angeflogen) { angeflogen = true; globus.anflug(); }
    else globus.zuMir();
  }
}
function ortText() {
  if (!ort) return;
  const q = { gps: "", gewählt: " (gewählt)", ersatz: ` (Ersatz: ${ERSATZ_ORT.name})` }[ort.quelle] || "";
  $("#ort-text").textContent = `📍 ${zahl(Math.abs(ort.lat), 2)}° ${ort.lat >= 0 ? "N" : "S"}, ${zahl(Math.abs(ort.lon), 2)}° ${ort.lon >= 0 ? "O" : "W"}${q}`;
  $("#ort-lat").value = ort.lat.toFixed(4);
  $("#ort-lon").value = ort.lon.toFixed(4);
  $("#ort-info").textContent = ort.quelle === "gps"
    ? `Bestimmt per GPS/WLAN${ort.genau ? ", auf etwa " + zahl(Math.max(1, Math.round(ort.genau))) + " m genau" : ""}. Der Standort wird nicht gespeichert und nirgendwohin geschickt.`
    : ort.quelle === "ersatz" ? "Dein Standort ist nicht freigegeben – bis dahin wird Berlin angenommen."
    : "Selbst gewählt – gilt, bis du die Seite schließt. Der Standort wird nicht gespeichert.";
}
function gpsHolen(laut = false) {
  if (!navigator.geolocation) { if (!ort) ortSetzen(ERSATZ_ORT.lat, ERSATZ_ORT.lon, "ersatz"); return; }
  if (laut) melde("Standort wird bestimmt …", 4);
  // hat jemand inzwischen selbst einen Ort gewählt, gilt der – außer bei ausdrücklichem „Standort neu bestimmen“
  const gewaehltGilt = () => !laut && ort && ort.quelle === "gewählt";
  navigator.geolocation.getCurrentPosition(
    (p) => {
      if (gewaehltGilt()) return;
      const neu = !ort || ort.quelle !== "gps" || Math.hypot(p.coords.latitude - ort.lat, p.coords.longitude - ort.lon) > 0.005;
      if (neu) ortSetzen(p.coords.latitude, p.coords.longitude, "gps", p.coords.accuracy);
      if (laut) melde("Standort aktualisiert.", 3);
    },
    (err) => {
      if (gewaehltGilt()) return;
      if (!ort) ortSetzen(ERSATZ_ORT.lat, ERSATZ_ORT.lon, "ersatz");
      const grund = err.code === 1 ? "Standort nicht freigegeben" : "Standort nicht verfügbar";
      melde(`${grund} – ${ort.quelle === "ersatz" ? "es wird Berlin angenommen" : "der zuletzt bekannte Ort wird genutzt"}. Du kannst den Ort in den Einstellungen wählen.`, 9,
        { text: "Einstellungen", aktion: () => $("#einstellungen").showModal() });
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 },
  );
}

// ---------------------------------------------------------------- Daten laden
async function holeJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function katalogSetzen() {
  idx.clear();
  sats.forEach((s, i) => idx.set(s[0], i));
  issIdx = idx.has(ISS) ? idx.get(ISS) : -1;
  globus.setzeKatalog(sats.map((s) => s[14]), sats.map((s) => anzeigeName(s[1])), issIdx);
  if (auswahl < 0) globus.setzeBahnZiel(issIdx);
  legendeZeichnen();
}

async function datenLaden() {
  try {
    $("#lade-text").textContent = "Lade Bahndaten …";
    const kern = await holeJson("data/kern.json");
    stand = { erzeugt: Date.parse(kern.stand) };
    sats = kern.sats.slice();
    takter.postMessage({ typ: "daten", sats: kern.sats });
    vorher.postMessage({ typ: "daten", sats: kern.sats });
    katalogSetzen();
    datenDa = true;
    startFertig();
    if (ort) vorhersagenStarten();
    taktAnfordern();
    await alleLaden();
    standPruefen();
    holeJson("data/stand.json").then((s) => { stand = Object.assign(stand || {}, s, { erzeugt: Date.parse(s.erzeugt) }); datenInfo(); }).catch(() => {});
    himmelDaten.laden().then(() => globus.sterne(himmelDaten.sterne, Date.now())).catch(() => {});
  } catch (e) {
    console.error(e);
    $("#lade-text").textContent = "Bahndaten konnten nicht geladen werden. Bitte später neu laden.";
    melde("Bahndaten konnten nicht geladen werden: " + e.message, 0);
  }
}

let alleGeladen = false;
async function alleLaden() {
  if (alleGeladen) return;
  alleGeladen = true;
  try {
    const alle = await holeJson("data/alle.json");
    sats = sats.concat(alle.sats);
    await frage(takter, { typ: "daten", sats: alle.sats });
    katalogSetzen();
    if (auswahl >= 0) globus.setzeAuswahl(auswahl);
    tick = null;
    taktAnfordern(true);
    datenInfo();
  } catch (e) {
    alleGeladen = false;
    melde("Die vollständige Satellitenliste ließ sich nicht laden.", 6);
  }
}

/** Läuft die Seite lange, alle 2 Stunden nach neueren Bahndaten schauen */
async function datenAuffrischen() {
  if (!datenDa || document.hidden) return;
  try {
    const kern = await holeJson("data/kern.json");
    const neu = Date.parse(kern.stand);
    if (!stand || !(neu > stand.erzeugt)) return;
    const listen = [kern.sats];
    if (alleGeladen) listen.push((await holeJson("data/alle.json")).sats);
    const ersetzt = [];
    for (const liste of listen) for (const x of liste) {
      const i = idx.get(x[0]);
      if (i != null) { sats[i] = x; ersetzt.push(x); }
    }
    if (ersetzt.length) {
      await frage(takter, { typ: "daten", sats: ersetzt });
      vorher.postMessage({ typ: "daten", sats: ersetzt.filter((x) => (x[15] & 3) || x[0] === ISS) });
    }
    stand.erzeugt = neu;
    datenInfo();
    vorhersagenStarten();
  } catch { /* nächstes Mal */ }
}
setInterval(datenAuffrischen, 2 * 3600000);

function infoLaden() {
  if (info) return Promise.resolve(info);
  if (!infoLaedt) infoLaedt = holeJson("data/info.json").then((j) => (info = j.sats)).catch(() => { infoLaedt = null; return null; });
  return infoLaedt;
}

/* CelesTrak erlaubt Abrufe direkt aus dem Browser (CORS, geprüft am 31.10.2026).
   Sind die veröffentlichten Daten alt, holt die Seite selbst frische Bahndaten:
   ab 6 Stunden Raumstationen und helle Satelliten (klein, höchstens alle 2 Stunden),
   ab 24 Stunden auch alle aktiven Satelliten (groß, höchstens alle 2 Stunden). */
const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=csv&GROUP=";
async function holeText(url, sek) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), sek * 1000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.text();
  } finally { clearTimeout(t); }
}
function csvSpalten(z) {
  const out = [];
  let cur = "", q = false;
  for (let k = 0; k < z.length; k++) {
    const c = z[k];
    if (q) { if (c === '"') { if (z[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function csvLesen(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim());
  if (zeilen.length < 2 || !zeilen[0].startsWith("OBJECT_NAME")) throw new Error("keine Bahndaten");
  const kopf = csvSpalten(zeilen[0]);
  return zeilen.slice(1).map((z) => { const w = csvSpalten(z); const o = {}; kopf.forEach((k, j) => (o[k] = w[j])); return o; });
}
/** frische Bahnelemente für schon bekannte Satelliten übernehmen (Einordnung und Helligkeit bleiben).
    liste: kurze Sätze [id, epoche, n, e, i, raan, argp, m, bstar, ndot, nddot, umlauf] */
function bahnUebernehmen(liste) {
  const neu = [];
  for (const x of liste) {
    const i = idx.get(x[0]);
    if (i == null || !(x[1] > sats[i][3])) continue;
    if (!(x[2] > 0.05 && x[2] < 20 && x[3] >= 0 && x[3] < 1 && Number.isFinite(x[8]))) continue;
    const s = sats[i].slice();
    for (let k = 1; k <= 11; k++) s[k + 2] = x[k];
    sats[i] = s;
    neu.push(s);
  }
  return neu;
}
function kurzSaetze(objekte) {
  const out = [];
  for (const x of objekte) {
    if (!x.EPOCH || !x.NORAD_CAT_ID) continue;
    const ep = Date.parse(x.EPOCH.endsWith("Z") ? x.EPOCH : x.EPOCH + "Z") / 1000;
    out.push([+x.NORAD_CAT_ID, ep, +x.MEAN_MOTION, +x.ECCENTRICITY, +x.INCLINATION, +x.RA_OF_ASC_NODE,
      +x.ARG_OF_PERICENTER, +x.MEAN_ANOMALY, +x.BSTAR, +x.MEAN_MOTION_DOT, +x.MEAN_MOTION_DDOT, +x.REV_AT_EPOCH || 0]);
  }
  return out;
}

/** Zwischenspeicher im Browser (IndexedDB) – nur für öffentliche Bahndaten von CelesTrak, nichts über dich und
    keine Einstellungen. Grund: CelesTrak gibt dieselben Daten nur einmal je Aktualisierung (alle 2 Stunden) heraus,
    sonst kommt Fehler 403, und nach vielen Fehlern wird die IP-Adresse gesperrt; dazu ist die Liste aller aktiven
    Satelliten ca. 3 MB groß. Schlüssel: „hell“ (Raumstationen und helle Satelliten), „aktiv“ (alle aktiven),
    „versuch“ (Zeit des letzten Abrufversuchs aller aktiven). */
const ablage = {
  db: null,
  async oeffnen() {
    if (!this.db) this.db = await new Promise((res, rej) => {
      const r = indexedDB.open("satelliten-ueber-mir", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("daten");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async lies(k) {
    try {
      const db = await this.oeffnen();
      return await new Promise((res) => { const q = db.transaction("daten").objectStore("daten").get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); });
    } catch { return null; }
  },
  async schreib(k, v) {
    try {
      const db = await this.oeffnen();
      await new Promise((res) => { const t = db.transaction("daten", "readwrite"); t.objectStore("daten").put(v, k); t.oncomplete = res; t.onerror = res; t.onabort = res; });
    } catch { /* kein Speicher – egal */ }
  },
};

/** mittleres Alter der Bahndaten aller Satelliten (Median der Epochen) */
function mittlereEpoche() {
  if (!sats.length) return Date.now();
  const e = sats.map((s) => s[3]).sort((a, b) => a - b);
  return e[e.length >> 1] * 1000;
}

function neuesteEpoche() {
  let m = 0;
  for (const s of sats) if ((s[15] & 3) || s[0] === ISS) m = Math.max(m, s[3]);
  return m * 1000;
}

/* Die Seite holt sich frische Bahndaten selbst direkt bei CelesTrak:
   - Raumstationen und helle Satelliten, wenn ihre Bahndaten älter als 6 Stunden sind (höchstens alle 2 Stunden, klein),
   - alle aktiven Satelliten, wenn der Datenstand der Seite älter als einen Tag ist oder die Bahndaten
     im Mittel älter als 3 Tage sind (höchstens einmal am Tag, im Browser zwischengespeichert, ca. 3 MB). */
let auffrischenLaeuft = false;
async function standPruefen() {
  if (!stand || !stand.erzeugt || auffrischenLaeuft) return;
  auffrischenLaeuft = true;
  const jetzt = Date.now();
  try {
    // 1) Raumstationen und helle Satelliten
    if (jetzt - neuesteEpoche() > 6 * 3600000) {
      try {
        let liste, zeit = jetzt;
        const gemerkt = await ablage.lies("hell");
        if (gemerkt && gemerkt.daten && jetzt - gemerkt.zeit < 2 * 3600000) { liste = gemerkt.daten; zeit = gemerkt.zeit; }
        else {
          const [a, b] = await Promise.all([holeText(CELESTRAK + "stations", 15), holeText(CELESTRAK + "visual", 15)]);
          liste = kurzSaetze(csvLesen(a).concat(csvLesen(b)));
          await ablage.schreib("hell", { zeit: jetzt, daten: liste });
        }
        const neu = bahnUebernehmen(liste);
        if (neu.length) {
          takter.postMessage({ typ: "daten", sats: neu });
          vorher.postMessage({ typ: "daten", sats: neu });
          issPaesse = null; nachtListe = null;
          vorhersagenStarten();
        }
        stand.browser = zeit;
      } catch { /* kein Zugriff */ }
    }
    // 2) alle aktiven Satelliten – wenn der Datenstand der Seite älter als ein Tag ist
    //    oder die Bahndaten im Mittel älter als 3 Tage sind (dann wären Positionen am Himmel zu ungenau)
    if (alleGeladen && (jetzt - stand.erzeugt > 24 * 3600000 || jetzt - mittlereEpoche() > 3 * 86400000)) {
      let k = await ablage.lies("aktiv");
      if (!k || jetzt - k.zeit > 24 * 3600000) {
        if (jetzt - ((await ablage.lies("versuch")) || 0) > 3600000) {
          await ablage.schreib("versuch", jetzt);
          try {
            const liste = kurzSaetze(csvLesen(await holeText(CELESTRAK + "active", 120)));
            if (liste.length > 5000) { k = { zeit: jetzt, daten: liste }; await ablage.schreib("aktiv", k); }
          } catch { /* kein Zugriff */ }
        }
      }
      if (k && k.daten) {
        const neu = bahnUebernehmen(k.daten);
        if (neu.length) await frage(takter, { typ: "daten", sats: neu });
        stand.browserAlle = k.zeit;
      }
    }
  } finally {
    auffrischenLaeuft = false;
    datenInfo();
  }
  const alter = (Date.now() - neuesteEpoche()) / 3600000;
  if (alter > 72) melde(`Die Bahndaten sind ${Math.round(alter / 24)} Tage alt – Positionen können ungenau sein.`, 8);
}
setInterval(() => { if (datenDa && !document.hidden) standPruefen(); }, 30 * 60000);

function datenInfo() {
  const n = sats.length;
  let t = `${zahl(n)} Objekte geladen.`;
  const ep = neuesteEpoche();
  if (ep) t += ` Neueste Bahndaten (Raumstationen, helle Satelliten) vom ${datum(ep)}, ${uhr(ep)} Uhr.`;
  if (stand && stand.browser) t += ` Zuletzt um ${uhr(stand.browser)} Uhr direkt bei CelesTrak nachgesehen.`;
  if (stand && stand.erzeugt) t += ` Datenstand der Seite: ${datum(stand.erzeugt)}${stand.browserAlle ? `, alle übrigen Satelliten aktualisiert am ${datum(stand.browserAlle)} um ${uhr(stand.browserAlle)} Uhr` : ""}.`;
  $("#daten-info").textContent = t;
}

// ---------------------------------------------------------------- Takt
let taktLaeuft = false, taktTimer = 0, taktIntervall = 1000;
function taktAnfordern(sofort = false) {
  if (sofort) { clearTimeout(taktTimer); taktLaeuft = false; }
  if (taktLaeuft || document.hidden || !ort || !sats.length) return;
  taktLaeuft = true;
  takter.postMessage({ typ: "takt", t: Date.now() + 100 });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { taktAnfordern(true); if (datenDa) standPruefen(); } });

function taktFertig(m) {
  taktLaeuft = false;
  if (m.pos.length !== 3 * sats.length) { taktAnfordern(); return; }
  tick = m;
  globus.setzeTakt(m);
  taktIntervall = Math.max(1000, Math.min(5000, m.dauer * 4));
  clearTimeout(taktTimer);
  taktTimer = setTimeout(() => taktAnfordern(), Math.max(50, taktIntervall - m.dauer));
  nachTakt();
}

let zuletztBahn = 0;
function nachTakt() {
  const jetzt = Date.now();
  kurzZeile();
  issChip();
  if (auswahl >= 0) steckbriefLive();
  // während der Globus gezogen wird, die Listen nicht neu aufbauen (das kostet Bilder)
  if (jetzt - letzteListe > 2000 && !globus.bedient) {
    letzteListe = jetzt;
    if (!$("#seite-oben").hidden && (PC.matches || blatt.dataset.hoehe !== "klein")) listeZeichnen();
    if (!$("#seite-iss").hidden) issZeichnen();
  }
  if (!$("#seite-himmel").hidden && !globus.bedient) himmelZeichnen();
  if (boxArt === "objekt" && jetzt - objektZeit > 2000) objektInfo();
  // Bahnlinie regelmäßig neu
  const bz = auswahl >= 0 ? auswahl : issIdx;
  if (bz >= 0 && (jetzt - zuletztBahn > 60000 || globus.bahnIdx !== bz || !globus.ring.visible)) {
    if (globus.bahnIdx !== bz) globus.setzeBahnZiel(bz);
    zuletztBahn = jetzt;
    takter.postMessage({ typ: "bahn", i: bz, t: jetzt });
    const d = bz === auswahl ? m_detail() : null;
    const hoehe = d ? d.hoehe : A.bahnHoehen(sats[bz][4], sats[bz][5]).hp;
    globus.kreisNeu(hoehe);
  }
}
const m_detail = () => (tick && tick.auswahl === auswahl ? tick.detail : null);

function zaehleOben() {
  let oben = 0, sichtbar = 0;
  if (!tick) return { oben, sichtbar };
  const o = tick.oben;
  for (let k = 0; k < o.length; k += 7) {
    const i = o[k];
    const s = tick.st[i];
    if (s & 64) continue;
    if (E.filter[sats[i][14]] === false) continue;
    if (E.ab10 && o[k + 2] < 10) continue;
    oben++;
    if (s & 8) sichtbar++;
  }
  return { oben, sichtbar };
}

function kurzZeile() {
  if (!tick) return;
  const { oben, sichtbar } = zaehleOben();
  const sonne = tick.sonne && tick.sonne.el != null ? tick.sonne.el : null;
  let himmel = "";
  if (sonne != null) himmel = sonne > -0.8 ? "Tag" : sonne > -6 ? "Dämmerung" : sonne > -12 ? "Dämmerung (dunkel)" : "Nacht";
  $("#kurz").innerHTML = `${zahl(oben)} Satelliten über dir · ${sichtbar ? `<b>${sichtbar} jetzt sichtbar</b>` : "keiner gerade sichtbar"} · ${himmel}`;
}

// ---------------------------------------------------------------- ISS
/** Punkt auf der Erde unter einem Satelliten (aus der fortgeschriebenen Position) */
function unterpunkt(i) {
  const v = i >= 0 ? globus.satPosition(i) : null;
  if (!v) return null;
  return A.ecefZuGeo(v.x * A.RE, -v.z * A.RE, v.y * A.RE);
}

function issSicht() {
  if (!tick || issIdx < 0) return null;
  const st = tick.st[issIdx];
  let r = null;
  const o = tick.oben;
  for (let k = 0; k < o.length; k += 7) if (o[k] === issIdx) { r = { az: o[k + 1], el: o[k + 2], r: o[k + 3], mag: o[k + 4] }; break; }
  return { st, r };
}
function naechsterSichtbar() {
  if (!issPaesse) return null;
  const jetzt = Date.now();
  return issPaesse.find((p) => p.art === 1 && p.sichtbar.ende > jetzt) || null;
}
function issChip() {
  const chip = $("#iss-chip");
  const s = issSicht();
  if (!s || E.filter.iss === false) { chip.hidden = true; return; }
  chip.hidden = false;
  let t;
  if (s.st & 8) t = `ISS jetzt sichtbar! ${A.richtung(s.r.az)}, ${Math.round(s.r.el)}° hoch`;
  else if (s.st & 2) t = `ISS über dir (${A.richtung(s.r.az)}, ${Math.round(s.r.el)}°) – ${(s.st & 4) ? "aber nicht zu sehen" : "im Erdschatten"}`;
  else {
    const p = naechsterSichtbar();
    t = p ? `ISS: nächster sichtbarer Überflug ${tag(p.sichtbar.start)} ${uhr(p.sichtbar.start)} Uhr` : issPaesse ? "ISS: in den nächsten 5 Tagen nicht mit bloßem Auge zu sehen" : "ISS";
  }
  $("#iss-chip-text").textContent = t;
}
$("#iss-chip").addEventListener("click", () => { if (issIdx >= 0) waehle(issIdx); });

function vorhersagenStarten() {
  if (!ort || issIdx < 0) return;
  frage(vorher, { typ: "ueberfluege", id: ISS, von: Date.now() - 15 * 60000, tage: 5 }).then((m) => {
    issPaesse = (m.liste || []).filter((p) => p.ende > Date.now());
    issChip();
    if (!$("#seite-iss").hidden) issZeichnen(true);
  });
  const ids = sats.filter((s) => (s[15] & 3) || s[0] === ISS).map((s) => s[0]);
  frage(vorher, { typ: "nacht", von: Date.now() - 10 * 60000, stunden: 24, ids }).then((m) => {
    nachtListe = (m.liste || []).filter((p) => p.ende > Date.now());
    if (!$("#seite-nacht").hidden) nachtZeichnen();
  });
}
setInterval(() => { if (datenDa && ort && !document.hidden) vorhersagenStarten(); }, 30 * 60000);

let issHtmlZeit = 0;
function issZeichnen(neu = false) {
  const el = $("#iss-inhalt");
  if (issIdx < 0) { el.innerHTML = '<p class="leer">Die ISS ist nicht in den Daten.</p>'; return; }
  const s = issSicht();
  const z = s ? zustandText(s.st, s.r, tick && tick.sonne.el) : { text: "wird berechnet …", ja: false };
  let html = `<div class="zustand${z.ja ? " ja" : ""}"><svg><use href="#i-auge"/></svg><span>${esc(z.text)}</span></div>`;
  const u = unterpunkt(issIdx), wo = u && ortName(u.lat, u.lon);
  if (wo) html += `<p class="hinweis-klein">Die ISS fliegt gerade über ${esc(wo)}.</p>`;
  if (s && s.r) html += `<p class="hinweis-klein">Gerade ${km(s.r.r)} von dir entfernt, ${Math.round(s.r.el)}° über dem Horizont in Richtung ${A.richtung(s.r.az)}.</p>`;
  const angedockt = tick && tick.angedockt ? tick.angedockt.iss.map((i) => anzeigeName(sats[i][1])) : [];
  if (angedockt.length) html += `<p class="hinweis-klein">Mit der ISS verbunden: ${esc(angedockt.join(", "))}.</p>`;
  html += `<div class="knopf-reihe"><button class="knopf-gross haupt" data-iss="steckbrief"><svg viewBox="0 0 40 24" style="width:30px"><use href="#i-iss"/></svg>Alles über die ISS</button></div>`;
  html += `<h3 class="abschnitt">Überflüge in den nächsten 5 Tagen</h3>`;
  if (!issPaesse) html += '<p class="leer">wird berechnet …</p>';
  else if (!issPaesse.length) {
    // Bahnneigung + Sichtweite kleiner als die eigene Breite: dann kommt die ISS hier nie über den Horizont
    const si = sats[issIdx], h = A.bahnHoehen(si[4], si[5]);
    const reicht = si[6] + Math.acos(A.RE / (A.RE + h.ha)) * A.DEG;
    html += ort && reicht < Math.abs(ort.lat)
      ? `<p class="leer">Von hier aus kommt die ISS nie über den Horizont: Sie fliegt nur bis ${zahl(si[6], 1)}° nördlicher und südlicher Breite.</p>`
      : '<p class="leer">Keine Überflüge gefunden.</p>';
  }
  else {
    const sichtbare = issPaesse.filter((p) => p.art === 1).length;
    html += `<p class="hinweis-klein">${sichtbare ? `${sichtbare} davon mit bloßem Auge sichtbar (★).` : "Keiner davon ist mit bloßem Auge sichtbar – die ISS ist dann im Erdschatten oder es ist zu hell."}</p><ol class="pass-liste">`;
    let letzterTag = "";
    for (const p of issPaesse) {
      const t = tag(p.start);
      if (t !== letzterTag) { html += `<li class="tag-kopf">${esc(t)}</li>`; letzterTag = t; }
      html += `<li data-pass="${p.start}">${passHtml(p, null, false)}</li>`;
    }
    html += "</ol>";
  }
  if (neu || Date.now() - issHtmlZeit > 1500) { el.innerHTML = html; issHtmlZeit = Date.now(); }
}
$("#iss-inhalt").addEventListener("click", (e) => {
  if (e.target.closest('[data-iss="steckbrief"]')) waehle(issIdx);
  else if (e.target.closest("[data-pass]")) { waehle(issIdx); }
});

// ---------------------------------------------------------------- Heute Nacht
function nachtZeichnen() {
  const el = $("#nacht-liste");
  if (!nachtListe) { el.innerHTML = '<li class="leer">wird berechnet …</li>'; return; }
  const jetzt = Date.now();
  const liste = nachtListe.filter((p) => p.ende > jetzt && E.filter[sats[idx.get(p.id)]?.[14]] !== false);
  if (!liste.length) { el.innerHTML = '<li class="leer">In den nächsten 24 Stunden ist kein heller Satellit gut zu sehen. Das liegt meist an der Jahreszeit: Im Hochsommer und Winter gibt es Tage ohne gute Überflüge.</li>'; return; }
  let html = "", letzterTag = "";
  for (const p of liste) {
    const t = tag(p.sichtbar.start);
    if (t !== letzterTag) { html += `<li class="tag-kopf">${esc(t)}</li>`; letzterTag = t; }
    const i = idx.get(p.id);
    html += `<li data-id="${p.id}">${passHtml(p, anzeigeName(sats[i][1]), false)}</li>`;
  }
  el.innerHTML = html;
}
$("#nacht-liste").addEventListener("click", (e) => {
  const li = e.target.closest("[data-id]");
  if (li) waehle(idx.get(Number(li.dataset.id)));
});

// ---------------------------------------------------------------- Liste „Über dir“
// Während ein Finger auf der Liste liegt, nicht neu zeichnen – sonst geht das Antippen verloren
let listeBeruehrt = 0;
$("#oben-liste").addEventListener("pointerdown", () => { listeBeruehrt = Date.now(); });
for (const t of ["pointerup", "pointercancel"]) $("#oben-liste").addEventListener(t, () => { setTimeout(() => { listeBeruehrt = 0; }, 350); });
function listeZeichnen(neu = false) {
  const el = $("#oben-liste");
  if (!tick) { el.innerHTML = '<li class="leer">wird berechnet …</li>'; return; }
  if (!neu && listeBeruehrt && Date.now() - listeBeruehrt < 3000) return;
  const o = tick.oben;
  const zeilen = [];
  for (let k = 0; k < o.length; k += 7) {
    const i = o[k], st = tick.st[i], s = sats[i];
    if (st & 64) continue;
    if (E.filter[s[14]] === false) continue;
    if (E.ab10 && o[k + 2] < 10) continue;
    if (E.liste === "sichtbar" && !(st & 8)) continue;
    if (E.liste === "hell" && !((s[15] & 3) || (st & 8) || i === issIdx || (s[16] != null && s[16] <= 4))) continue;
    zeilen.push({ i, az: o[k + 1], el: o[k + 2], r: o[k + 3], mag: o[k + 4], licht: o[k + 6], st });
  }
  zeilen.sort((a, b) => (b.i === issIdx) - (a.i === issIdx) || ((b.st & 8) - (a.st & 8)) || (E.liste === "sichtbar" ? a.mag - b.mag : b.el - a.el));
  const hinweis = $("#oben-hinweis");
  if (E.liste === "sichtbar") hinweis.textContent = zeilen.length ? "Diese Satelliten kannst du gerade mit bloßem Auge sehen:" : (tick.sonne.el > -3 ? "Bei Tageslicht sieht man keine Satelliten. Am besten klappt es kurz nach Sonnenuntergang und vor Sonnenaufgang." : "Gerade ist keiner hell genug und angestrahlt. Schau unter „Heute Nacht“, wann es klappt.");
  else if (E.liste === "hell") hinweis.textContent = "Raumstationen und helle Satelliten über deinem Horizont, nach Höhe sortiert.";
  else hinweis.textContent = `Alle ${zahl(zeilen.length)} Satelliten über deinem Horizont, nach Höhe sortiert.`;
  const html = zeilen.slice(0, zeigeBis).map((z) => {
    const s = sats[z.i];
    const p = z.st & 8 ? "p-sichtbar" : z.licht >= 0.5 ? "p-licht" : "p-schatten";
    const kat = s[14] === "iss" ? "Raumstation" : (KAT[s[14]] || KAT.sonst).name;
    const zust = z.st & 8 ? `${mag(z.mag)}, ${helligkeitWort(z.mag)}` : z.licht >= 0.5 ? "angestrahlt" : "im Erdschatten";
    return `<li data-i="${z.i}" class="${z.i === auswahl ? "gewaehlt" : ""}"><i class="punkt ${p}"></i>
      <span class="name">${esc(anzeigeName(s[1]))}${z.i === issIdx ? '<span class="etikett e-iss">ISS</span>' : ""}${z.st & 8 ? '<span class="etikett e-sichtbar">sichtbar</span>' : ""}</span>
      <span class="wert"><b>${Math.round(z.el)}°</b>${A.richtung(z.az)}</span>
      <span class="unter">${esc(kat)} · ${km(z.r)} · ${zust}</span></li>`;
  }).join("");
  const mehr = zeilen.length > zeigeBis ? `<li><button class="mehr" data-mehr>… ${zahl(zeilen.length - zeigeBis)} weitere zeigen</button></li>` : "";
  const leer = !zeilen.length && E.liste !== "sichtbar" ? '<li class="leer">Gerade keine.</li>' : "";
  const neuHtml = html + mehr + leer;
  if (neu || el._html !== neuHtml) { el.innerHTML = neuHtml; el._html = neuHtml; }
}
$("#oben-liste").addEventListener("click", (e) => {
  if (e.target.closest("[data-mehr]")) { zeigeBis += 300; listeZeichnen(true); return; }
  const li = e.target.closest("[data-i]");
  if (li) waehle(Number(li.dataset.i));
});

// ---------------------------------------------------------------- Himmel
const himmelDaten = new HimmelDaten();
let himmelObjekt = null; // Stern, Planet, Mond, Sonne oder Sternbild in der Infobox
const himmel = new Himmel($("#himmel-karte"), {
  himmel: himmelDaten,
  einst: () => zeigen.einst,
  onWahl: (i) => waehle(i),
  onObjekt: (o) => objektZeigen(o),
});
function himmelZeichnen() {
  if (!tick) return;
  if (!himmelDaten.bereit) { himmelDaten.laden().then(() => himmelZeichnen()).catch(() => {}); }
  if (!himmelDaten.planeten.length) astronomieLaden().then((x) => { if (x && ort) { himmelDaten.planetenAktualisieren(ort.lat, ort.lon, Date.now()); himmelZeichnen(); planetenListe(); } });
  const jetzt = Date.now();
  if (ort) {
    himmelDaten.aktualisieren(ort.lat, ort.lon, jetzt);
    himmelDaten.planetenAktualisieren(ort.lat, ort.lon, jetzt);
  }
  // Satelliten: Raumstationen, helle und gerade sichtbare (ausgeschaltet: nur der gewählte)
  const mitSats = zeigen.einst.satelliten !== false;
  const o = tick.oben, liste = [];
  for (let k = 0; k < o.length; k += 7) {
    const i = o[k], st = tick.st[i], s = sats[i];
    if (st & 64 || E.filter[s[14]] === false) continue;
    const hell = (s[15] & 3) || (st & 8) || i === issIdx || (s[16] != null && s[16] <= 4);
    if (i !== auswahl && !(mitSats && hell)) continue;
    liste.push({ i, az: o[k + 1], el: o[k + 2], mag: o[k + 4], sichtbar: !!(st & 8), licht: !!(st & 4), iss: i === issIdx, name: anzeigeName(s[1]) });
  }
  let aus = null;
  if (auswahl >= 0) {
    const r = zielRichtung();
    if (r) aus = { az: r.az, el: r.el, name: anzeigeName(sats[auswahl][1]) };
  }
  const obj = himmelObjekt ? zeigen.objektRichtung(himmelObjekt) : null;
  himmel.drehung = karteKompass.an ? karteKompass.kurs : 0;
  himmel.zeichne({ sats: liste, sonne: tick.sonne, mond: tick.mond, bahn: auswahlBahnHimmel && auswahlBahnHimmel.i === auswahl ? auswahlBahnHimmel.daten : null, auswahl: aus, objekt: obj ? { az: obj.az, el: obj.el } : null });
  if (jetzt - planetenZeit > 20000) planetenListe();
}

/** Stern, Planet, Mond, Sonne oder Sternbild in der Infobox zeigen */
function objektZeigen(o) {
  if (auswahl >= 0) waehle(-1);
  himmelObjekt = o;
  box.classList.remove("eingeklappt");
  objektInfo();
  if (!himmelObjekt) return;
  boxOeffnen("objekt");
  himmelZeichnen();
}
let objektZeit = 0;
function objektInfo() {
  const el = $("#objektinfo");
  if (!himmelObjekt) return;
  objektZeit = Date.now();
  const d = zeigen.infoDaten(himmelObjekt);
  if (!d) { objektZu(); return; }
  const html = infoHtml(d, { hinText: "Mit dem Handy zeigen", klappen: true });
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}
function objektZu() {
  himmelObjekt = null;
  if (boxArt === "objekt") boxZu();
  if (!$("#seite-himmel").hidden) himmelZeichnen();
}
$("#objektinfo").addEventListener("click", (e) => {
  const b = e.target.closest("[data-info]");
  if (!b) return;
  if (b.dataset.info === "zu") objektZu();
  else if (b.dataset.info === "hin" && himmelObjekt) himmelLiveOeffnen(himmelObjekt);
});

/** Liste „Mond und Planeten“ unter der Himmelskarte */
let planetenZeit = 0;
function planetenListe() {
  const el = $("#planeten-liste");
  if (!ort || !himmelDaten.planeten.length) return;
  planetenZeit = Date.now();
  const jetzt = Date.now();
  const sonneEl = tick && tick.sonne ? tick.sonne.el : -90;
  const zeilen = [];
  const m = himmelDaten.mondDetails(ort.lat, ort.lon, jetzt);
  const eintrag = (id, name, farbe, az, el2, mag, extra) => {
    const au = himmelDaten.aufUnter(id, ort.lat, ort.lon, jetzt);
    let wann = "";
    if (el2 >= 0) wann = au && au.unter ? `geht ${tag(au.unter)} um ${uhr(au.unter)} Uhr unter` : "geht heute nicht unter";
    else wann = au && au.auf ? `geht ${tag(au.auf)} um ${uhr(au.auf)} Uhr auf` : "geht heute nicht auf";
    const wo = el2 >= 0 ? `jetzt ${Math.round(el2)}° hoch im ${A.richtungLang(az)}` : "unter dem Horizont";
    return `<li data-objekt="${id}" class="${el2 >= 0 ? "oben-ja" : "oben-nein"}"><i class="punkt" style="background:${farbe}"></i><span class="name">${esc(name)}</span><span class="wert">${zahl(mag, 1)} mag</span><span class="unter">${esc(wo)} · ${esc(wann)}${extra ? " · " + esc(extra) : ""}</span></li>`;
  };
  if (m) zeilen.push(eintrag("Moon", "Mond", "#e9eefa", m.az, m.el, m.mag, `${zahl(m.anteil * 100)} % beleuchtet`));
  const nah = (p) => { const s = tick && tick.sonne; if (!s) return false; const a = Math.acos(Math.max(-1, Math.min(1, Math.sin(p.el * A.RAD) * Math.sin(s.el * A.RAD) + Math.cos(p.el * A.RAD) * Math.cos(s.el * A.RAD) * Math.cos((p.az - s.az) * A.RAD)))) * A.DEG; return a < 12; };
  for (const p of himmelDaten.planeten) {
    const extra = nah(p) ? "zu nah an der Sonne" : p.mag > 6 ? "nur mit Fernglas oder Teleskop" : (p.el > 5 && sonneEl < -6 && p.mag < 4) ? "gut zu sehen" : "";
    zeilen.push(eintrag(p.id, p.name, p.farbe, p.az, p.el, p.mag, extra));
  }
  el.innerHTML = zeilen.join("");
}
$("#planeten-liste").addEventListener("click", (e) => {
  const li = e.target.closest("[data-objekt]");
  if (!li) return;
  objektZeigen(li.dataset.objekt === "Moon" ? { art: "mond" } : { art: "planet", id: li.dataset.objekt });
});
for (const b of $$("[data-himmel]")) b.addEventListener("click", () => {
  const k = b.dataset.himmel;
  zeigen.einst[k] = !zeigen.einst[k];
  zeigen.einstellungenGeaendert();
  himmelSchalter();
  himmelZeichnen();
});
function himmelSchalter() { for (const b of $$("[data-himmel]")) b.setAttribute("aria-pressed", String(!!zeigen.einst[b.dataset.himmel])); }
$("#himmel-live").addEventListener("click", () => himmelLiveOeffnen(null));

/* Himmelskarte mit dem Kompass drehen: Liegt das Handy flach, zeigt die Karte die Richtungen so,
   wie sie draußen wirklich liegen (Oberkante des Handys = Blickrichtung). */
const karteKompass = { an: false, kurs: 0, roh: null, bild: 0, zeit: 0, dekl: 0 };
function karteKompassEreignis(e) {
  let k = null;
  if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) k = e.webkitCompassHeading;
  else if ((e.type === "deviceorientationabsolute" || e.absolute === true) && e.alpha != null) k = 360 - e.alpha;
  if (k == null) return;
  k = k + karteKompass.dekl + (zeigen.korrektur || 0);
  karteKompass.zeit = Date.now();
  if (karteKompass.roh == null) karteKompass.roh = k;
  else karteKompass.roh += 0.25 * (((k - karteKompass.roh + 540) % 360) - 180);
  const neu = ((karteKompass.roh % 360) + 360) % 360;
  if (Math.abs(((neu - karteKompass.kurs + 540) % 360) - 180) < 0.4) return;
  karteKompass.kurs = neu;
  if (!karteKompass.bild) karteKompass.bild = requestAnimationFrame(() => {
    karteKompass.bild = 0;
    if (!$("#seite-himmel").hidden) { himmel.drehung = karteKompass.kurs; himmel.zeichne(); }
  });
}
function karteKompassAus() {
  if (!karteKompass.an) return;
  karteKompass.an = false;
  window.removeEventListener("deviceorientationabsolute", karteKompassEreignis, true);
  window.removeEventListener("deviceorientation", karteKompassEreignis, true);
  $("#himmel-kompass").setAttribute("aria-pressed", "false");
  himmel.drehung = 0;
  himmelZeichnen();
}
$("#himmel-kompass").addEventListener("click", () => {
  if (karteKompass.an) { karteKompassAus(); return; }
  zeigen.erlaubnis().then((ok) => {
    if (!ok) {
      melde(window.DeviceOrientationEvent ? "Ohne Zugriff auf den Kompass kann sich die Karte nicht mitdrehen." : "Dieses Gerät hat keinen Kompass – die Karte bleibt mit Norden oben.", 6);
      return;
    }
    karteKompass.an = true; karteKompass.roh = null; karteKompass.zeit = 0;
    karteKompass.dekl = ort ? missweisung(ort.lat, ort.lon, 0, new Date()) : 0;
    window.addEventListener("deviceorientationabsolute", karteKompassEreignis, true);
    window.addEventListener("deviceorientation", karteKompassEreignis, true);
    $("#himmel-kompass").setAttribute("aria-pressed", "true");
    melde("Leg das Handy flach hin – die Karte dreht sich so, dass ihre Richtungen zur Wirklichkeit passen.", 5);
    setTimeout(() => {
      if (karteKompass.an && !karteKompass.zeit) { karteKompassAus(); melde("Kein Kompass gefunden. Leg das Handy so hin, dass seine Oberkante nach Norden zeigt.", 7); }
    }, 2500);
  });
});

// ---------------------------------------------------------------- Infobox
/* Die Infobox schwebt über allem: auf dem Handy oben über dem Globus (Blatt klein oder halb)
   bzw. unten über dem Blatt (Blatt ganz oben), am PC links neben der Leiste. */
function sonde(hoehe) {
  const d = document.createElement("div");
  d.style.cssText = `position:fixed;left:-20px;top:0;width:1px;visibility:hidden;pointer-events:none;height:${hoehe}`;
  document.body.appendChild(d);
  return d;
}
const SONDE = { klein: sonde("var(--blatt-klein)"), halb: sonde("var(--blatt-halb)"), gross: sonde("var(--blatt-gross)"), unten: sonde("var(--sicher-unten)"), oben: sonde("var(--sicher-oben)") };
/** Oberkante des Blatts, wenn es seine Zielhöhe erreicht hat */
function blattObenZiel() { return window.innerHeight - SONDE[blatt.dataset.hoehe || "klein"].offsetHeight; }

function boxOeffnen(art) {
  const neu = box.hidden || boxArt !== art;
  boxArt = art;
  $("#steckbrief").hidden = art !== "sat";
  $("#objektinfo").hidden = art !== "objekt";
  box.hidden = false;
  if (neu) box.scrollTop = 0;
  boxLage();
}
function boxZu() {
  if (box.hidden) return;
  box.hidden = true;
  boxArt = null;
  box.classList.remove("eingeklappt");
  document.body.classList.remove("box-oben");
  versatzAnpassen();
}
function boxLage() {
  if (box.hidden) return;
  const H = window.innerHeight;
  if (PC.matches) { box.dataset.lage = "seite"; box.style.maxHeight = ""; }
  else if (blatt.dataset.hoehe === "gross") {
    // Blatt ganz oben: Box unten über das Blatt legen – in der Himmelskarte nur unter die Karte
    box.dataset.lage = "unten";
    let max = H * 0.46;
    if (!$("#seite-himmel").hidden) {
      const frei = H - $("#himmel-karte").getBoundingClientRect().bottom - 14 - SONDE.unten.offsetHeight;
      if (frei > 190) max = Math.min(frei, H * 0.5);
    }
    box.style.maxHeight = Math.round(max) + "px";
  } else {
    box.dataset.lage = "oben";
    const oben = SONDE.oben.offsetHeight + 58;
    box.style.maxHeight = Math.round(Math.max(150, Math.min(blattObenZiel() - oben - 10, H * 0.56))) + "px";
  }
  document.body.classList.toggle("box-oben", box.dataset.lage === "oben");
  versatzAnpassen();
}
new ResizeObserver(() => { if (!box.hidden) versatzAnpassen(); }).observe(box);
box.addEventListener("click", (e) => {
  if (!e.target.closest("[data-klappen]")) return;
  box.classList.toggle("eingeklappt");
  box.scrollTop = 0;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || box.hidden || zeigen.offen || document.querySelector("dialog[open]")) return;
  if (boxArt === "sat") waehle(-1); else objektZu();
});

// ---------------------------------------------------------------- Auswahl und Steckbrief
function waehle(i, oeffnen = true) {
  if (i == null || i < 0 || i >= sats.length) {
    if (auswahl >= 0) {
      auswahl = -1;
      globus.setzeAuswahl(-1);
      takter.postMessage({ typ: "auswahl", i: -1 });
      globus.setzeBahnZiel(issIdx);
      zuletztBahn = 0;
      if (!$("#seite-oben").hidden) listeZeichnen(true);
      if (!$("#seite-himmel").hidden) himmelZeichnen();
    }
    if (boxArt === "sat") boxZu();
    return;
  }
  if (himmelObjekt) { himmelObjekt = null; }
  const neu = i !== auswahl;
  auswahl = i;
  globus.setzeAuswahl(i);
  globus.setzeBahnZiel(i);
  zuletztBahn = 0;
  auswahlBahnHimmel = null;
  takter.postMessage({ typ: "auswahl", i });
  if (oeffnen) { if (neu) box.classList.remove("eingeklappt"); steckbriefOeffnen(i); }
  if (!$("#seite-oben").hidden) listeZeichnen(true);
  taktAnfordern(true);
}

function steckbriefOeffnen(i) {
  const s = sats[i];
  orteLaden();
  const el = $("#steckbrief");
  const b = bekannt(s[0], s[1]);
  const zeichnen = (erstesMal) => {
    const offenD = el.querySelector("details") && el.querySelector("details").open;
    el.innerHTML = steckbriefHtml({ sat: s, info: info ? info[String(s[0])] : null, jetzt: Date.now() });
    if (offenD && !erstesMal) el.querySelector("details").open = true;
    el.dataset.id = s[0];
    steckbriefLive();
    if (erstesMal) {
      paesseFuer(i);
      if (b && b.wiki) wikiLaden(el, b.wiki).then(() => { const w = el.querySelector('[data-wert="wiki"]'); if (w && !w.hidden) wikiCache = { id: s[0], html: w.innerHTML }; });
    } else {
      if (paesseCache && paesseCache.id === s[0]) el.querySelector('[data-wert="ueberfluege"]').innerHTML = paesseCache.html;
      else paesseFuer(i);
      const w = el.querySelector('[data-wert="wiki"]');
      if (wikiCache && wikiCache.id === s[0] && w) { w.innerHTML = wikiCache.html; w.hidden = false; }
      else if (b && b.wiki) wikiLaden(el, b.wiki);
    }
  };
  paesseCache = null; wikiCache = null;
  if (boxArt === "sat" && el.dataset.id !== String(s[0])) box.scrollTop = 0;
  zeichnen(true);
  boxOeffnen("sat");
  if (!info) infoLaden().then(() => { if (auswahl === i) zeichnen(false); });
  // Himmelsbahn für Himmelskarte und Zeige-Modus
  frage(vorher, { typ: "himmelsbahn", id: s[0], sat: s, von: Date.now() - 60000, bis: Date.now() + 15 * 60000, schritt: 10000 }).then((m) => {
    if (auswahl === i && m.daten) auswahlBahnHimmel = { i, daten: m.daten, von: m.von };
  });
}

let paesseCache = null, wikiCache = null;
function paesseFuer(i) {
  const s = sats[i];
  frage(vorher, { typ: "ueberfluege", id: s[0], sat: s, von: Date.now() - 10 * 60000, tage: 3 }).then((m) => {
    if (auswahl !== i) return;
    const kat = info && info[String(s[0])];
    const fw = fuerwort(artWort(s[1], s[14], kat ? kat[0] : null));
    let html;
    if (m.hoch) {
      html = `<li class="leer">${m.immerOben ? `${fw.Er} steht für dich dauerhaft über dem Horizont: in Richtung ${A.richtung(m.az)}, ${Math.round(m.el)}° hoch, und geht weder auf noch unter.` : `${fw.Er} bleibt für dich dauerhaft unter dem Horizont.`}</li>`;
    } else if (m.fehler) {
      html = `<li class="leer">Überflüge ließen sich nicht berechnen.</li>`;
    } else {
      const liste = (m.liste || []).filter((p) => p.ende > Date.now()).slice(0, 8);
      if (liste.length) html = liste.map((p) => `<li>${passHtml(p)}</li>`).join("");
      else {
        // kommt er überhaupt je über den Horizont? (Bahnneigung + Sichtweite < Breite)
        const h = A.bahnHoehen(s[4], s[5]);
        const weite = Math.acos(A.RE / (A.RE + h.ha)) * A.DEG;
        const incl = s[6] > 90 ? 180 - s[6] : s[6];
        html = ort && incl + weite < Math.abs(ort.lat)
          ? `<li class="leer">${fw.Seine} Bahn ist nur ${zahl(s[6], 1)}° gegen den Äquator geneigt. ${fw.Er} fliegt deshalb nie weit genug nach ${ort.lat > 0 ? "Norden" : "Süden"} und kommt bei dir nie über den Horizont.</li>`
          : `<li class="leer">In den nächsten 3 Tagen kommt ${fw.er} nicht über deinen Horizont.</li>`;
      }
    }
    paesseCache = { id: s[0], html };
    const ziel = $('#steckbrief [data-wert="ueberfluege"]');
    if (ziel && $("#steckbrief").dataset.id === String(s[0])) ziel.innerHTML = html;
  });
}

function steckbriefLive() {
  const el = $("#steckbrief");
  if (auswahl < 0 || boxArt !== "sat" || !tick) return;
  const d = tick.auswahl === auswahl ? tick.detail : null;
  steckbriefAktualisieren(el, { detail: d, st: tick.st[auswahl], sonneEl: tick.sonne.el });
  const folgen = el.querySelector('[data-aktion="folgen"]');
  if (folgen) folgen.setAttribute("aria-pressed", String(globus.folgen));
  const ad = el.querySelector('[data-wert="angedockt"]');
  if (ad && tick.angedockt) {
    const liste = (sats[auswahl][0] === ISS ? tick.angedockt.iss : tick.angedockt.css).map((i) => anzeigeName(sats[i][1]));
    const t = liste.length ? `<p class="hinweis-klein">Verbunden mit der Station: ${esc(liste.join(", "))}.</p>` : "";
    if (ad.innerHTML !== t) ad.innerHTML = t;
  }
}

$("#steckbrief").addEventListener("click", (e) => {
  const b = e.target.closest("[data-aktion]");
  if (!b) return;
  const a = b.dataset.aktion;
  if (a === "zu") waehle(-1);
  else if (a === "folgen") {
    if (globus.folgen) globus.folgen = false;
    else {
      globus.starteFolgen();
      // auf dem Handy Platz für den Globus: Blatt klein, Infobox zusammengeklappt
      if (!PC.matches) { if (blatt.dataset.hoehe !== "klein") blattHoehe("klein"); box.classList.add("eingeklappt"); }
    }
    b.setAttribute("aria-pressed", String(globus.folgen));
  } else if (a === "himmel") {
    zeigeReiter("himmel");
  } else if (a === "zeigen") zeigenStarten();
});

// ---------------------------------------------------------------- Himmel live (Lagesensoren)
/** Richtung eines Satelliten jetzt – jedes Bild neu aus der fortgeschriebenen Position */
const _v = { x: 0, y: 0, z: 0 };
function satRichtungJetzt(i, plusSek = 0) {
  if (i < 0 || !B || !tick) return null;
  const v = globus.satPosition(i, undefined, plusSek);
  const st = tick.st[i];
  const d = tick.auswahl === i ? tick.detail : null;
  if (!v) {
    if (d && d.az != null) return { az: d.az, el: d.el, licht: d.licht, mag: d.mag, sichtbar: !!(st & 8) };
    const o = tick.oben;
    for (let k = 0; k < o.length; k += 7) if (o[k] === i) return { az: o[k + 1], el: o[k + 2], licht: o[k + 6], mag: o[k + 4], sichtbar: !!(st & 8), r: o[k + 3] };
    return null;
  }
  // Szene -> erdfest [km]
  _v.x = v.x * A.RE; _v.y = -v.z * A.RE; _v.z = v.y * A.RE;
  const b = A.blick(B, _v.x, _v.y, _v.z);
  return { az: b.az, el: b.el, r: b.r, licht: d ? d.licht : (st & 4 ? 1 : 0), mag: d ? d.mag : null, sichtbar: !!(st & 8) };
}
const zielRichtung = () => satRichtungJetzt(auswahl);

/** angestrahlte Satelliten über dem Horizont für „Himmel live“ (alle 200 ms neu) */
let himmelSats = { zeit: 0, liste: [] };
function satListeHimmel() {
  const jetzt = performance.now();
  if (jetzt - himmelSats.zeit < 200) return himmelSats.liste;
  const out = [];
  if (tick && B) {
    const o = tick.oben;
    for (let k = 0; k < o.length; k += 7) {
      const i = o[k], st = tick.st[i];
      if (st & 64) continue;
      // sichtbare immer, sonst nur angestrahlte, die wenigstens im Fernglas zu sehen wären
      if (!(st & 8) && i !== issIdx && !((st & 4) && o[k + 4] < 7.5)) continue;
      if (E.filter[sats[i][14]] === false) continue;
      const r = satRichtungJetzt(i);
      if (!r) continue;
      const x = { i, az: r.az, el: r.el, sichtbar: !!(st & 8), licht: !!(st & 4), iss: i === issIdx, mag: o[k + 4], name: anzeigeName(sats[i][1]) };
      if (x.sichtbar || x.iss) { const r2 = satRichtungJetzt(i, 10); if (r2) { x.az2 = r2.az; x.el2 = r2.el; } }
      out.push(x);
    }
  }
  himmelSats = { zeit: jetzt, liste: out };
  return out;
}

const zeigen = new Zeigen({
  himmel: himmelDaten,
  beobachter: () => ort,
  missweisung: (lat, lon) => missweisung(lat, lon, 0, new Date()),
  sonne: () => (tick ? tick.sonne : null),
  mond: () => (tick ? tick.mond : null),
  satelliten: () => satListeHimmel(),
  sichtGrenze: () => E.himmel,
  satRichtung: (i) => satRichtungJetzt(i),
  satName: (i) => (sats[i] ? (i === issIdx ? "ISS" : anzeigeName(sats[i][1])) : "Satellit"),
  satDaten: (i) => {
    const r = satRichtungJetzt(i) || {};
    const s = sats[i];
    const st = tick ? tick.st[i] : 0;
    let mag = r.mag;
    if (mag == null && tick) { const o = tick.oben; for (let k = 0; k < o.length; k += 7) if (o[k] === i) { mag = o[k + 4]; break; } }
    const kat = info ? info[String(s[0])] : null;
    const bt = betreiber(s[1], s[14], kat);
    return {
      name: i === issIdx ? "ISS (Internationale Raumstation)" : anzeigeName(s[1]), kat: s[14] === "iss" ? "Raumstation" : (KAT[s[14]] || KAT.sonst).name,
      was: artWort(s[1], s[14], kat ? kat[0] : null), zweck: bt.zweck, firma: bt.firma,
      az: r.az, el: r.el, r: r.r, mag: mag != null && mag < 50 ? mag : null, sichtbar: !!(st & 8), licht: !!(st & 4), iss: i === issIdx,
    };
  },
  issIdx: () => issIdx,
  satBahn: (i) => frage(vorher, { typ: "himmelsbahn", id: sats[i][0], sat: sats[i], von: Date.now() - 60000, bis: Date.now() + 15 * 60000, schritt: 5000 }),
  onSteckbrief: (i) => waehle(i),
  onRot: (an) => { $("#opt-rot").checked = an; $("#knopf-rot").setAttribute("aria-pressed", String(an)); },
  onEinst: () => { himmelSchalter(); if (!$("#seite-himmel").hidden) himmelZeichnen(); },
  melde: (t) => melde(t, 5),
  onAuf: () => { globus.pause(true); infoLaden(); },
  onZu: () => { globus.pause(false); if (!$("#seite-himmel").hidden) himmelZeichnen(); },
});
himmelSchalter();

/** „Himmel live“ öffnen – im Klick aufrufen, sonst fragt iOS nicht nach den Lagesensoren */
function himmelLiveOeffnen(ziel) {
  const erlaubt = zeigen.erlaubnis();
  erlaubt.then((ok) => {
    if (!ok) melde("Ohne Zugriff auf die Lagesensoren kann das Handy nicht zeigen. Du kannst dich trotzdem durch Ziehen umsehen.", 7);
    zeigen.oeffnen(ziel);
  });
}
$("#knopf-himmel").addEventListener("click", () => himmelLiveOeffnen(null));

function zeigenStarten() {
  if (auswahl < 0) return;
  himmelLiveOeffnen({ art: "sat", i: auswahl });
}

// ---------------------------------------------------------------- Globus: Seitenansicht, Norden, Überblick
$("#knopf-3d").addEventListener("click", () => {
  if (globus.ansicht && globus.ansicht.neigung > 25) globus.zuMir();
  else { globus.seitenansicht(); if (!PC.matches && blatt.dataset.hoehe === "gross") blattHoehe("halb"); }
});
$("#knopf-norden").addEventListener("click", () => globus.nordenAusrichten());
let knopfStand = "";
/** Kompassnadel und Würfel-Knopf passend zur Ansicht (jedes Bild, aber nur bei Änderung) */
function globusKnoepfe() {
  const a = globus.ansicht;
  if (!a || typeof a !== "object") return;
  const gedreht = Math.abs(a.kurs) > 1.5 || a.neigung > 1.5;
  const stand = `${gedreht}|${Math.round(a.kurs)}|${a.neigung > 25}`;
  if (stand === knopfStand) return;
  knopfStand = stand;
  const n = $("#knopf-norden");
  n.hidden = !gedreht;
  n.querySelector("svg").style.transform = `rotate(${-a.kurs}deg)`;
  $("#knopf-3d").setAttribute("aria-pressed", String(a.neigung > 25));
  $("#knopf-3d").title = a.neigung > 25 ? "Zurück zur Ansicht von oben" : "Von der Seite ansehen";
}

function uebersichtSetzen(an) {
  E.uebersicht = an;
  globus.setzeUebersicht(an);
  $("#knopf-ueberblick").setAttribute("aria-pressed", String(an));
  legendeZeichnen();
}
$("#knopf-ueberblick").addEventListener("click", () => {
  uebersichtSetzen(!E.uebersicht);
  if (E.uebersicht) melde("Überblick: alle Satelliten groß, in der Farbe ihrer Art. Tippe in der Farbleiste eine Art an, um sie aus- oder einzublenden.", 6);
});
$("#knopf-ueberblick").setAttribute("aria-pressed", String(E.uebersicht));
/** Farbübersicht der Arten im Überblick – antippen blendet aus und ein */
function legendeZeichnen() {
  const el = $("#ueberblick-legende");
  el.hidden = !E.uebersicht;
  if (!E.uebersicht) return;
  const zaehl = {};
  for (const s of sats) zaehl[s[14]] = (zaehl[s[14]] || 0) + 1;
  el.innerHTML = Object.entries(KAT).filter(([k]) => zaehl[k]).map(([k, v]) =>
    `<button class="leg-chip" data-kat="${k}" aria-pressed="${E.filter[k] !== false}"><i class="punkt" style="background:${v.farbe}"></i><span>${esc(v.kurz)}</span><small>${zahl(zaehl[k])}</small></button>`).join("");
}
$("#ueberblick-legende").addEventListener("click", (e) => {
  const b = e.target.closest("[data-kat]");
  if (b) filterSetzen(b.dataset.kat, E.filter[b.dataset.kat] === false);
});
function filterSetzen(k, an) {
  E.filter[k] = an;
  globus.setzeFilter(E.filter);
  listeZeichnen(true); kurzZeile(); issChip(); legendeZeichnen();
  if (!$("#seite-himmel").hidden) himmelZeichnen();
}

// ---------------------------------------------------------------- Einstellungen
function einstellungenFuellen() {
  const zaehl = {};
  for (const s of sats) zaehl[s[14]] = (zaehl[s[14]] || 0) + 1;
  $("#kat-auswahl").innerHTML = Object.entries(KAT).map(([k, v]) =>
    `<label><input type="checkbox" data-kat="${k}" ${E.filter[k] !== false ? "checked" : ""}><i class="punkt" style="background:${v.farbe}"></i><span>${esc(v.name)}</span><small>${zahl(zaehl[k] || 0)}</small></label>`).join("");
  for (const r of $$('#himmel-wahl input')) r.checked = Number(r.value) === E.himmel;
  $("#opt-ab10").checked = E.ab10;
  $("#opt-linien").checked = E.linien;
  $("#opt-namen").checked = E.namen;
  $("#opt-rot").checked = zeigen.einst.rot;
  datenInfo();
  ortText();
}
$("#knopf-einstellungen").addEventListener("click", () => { einstellungenFuellen(); $("#einstellungen").showModal(); });
$("#knopf-hilfe").addEventListener("click", () => $("#hilfe").showModal());
$("#knopf-rot").addEventListener("click", () => zeigen.setzeRot(!zeigen.einst.rot));
$("#knopf-rot").setAttribute("aria-pressed", String(!!zeigen.einst.rot));
// Dialog schließen, wenn man daneben tippt
for (const d of $$("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
$("#knopf-ort").addEventListener("click", () => { globus.zuMir(); if (!ort || ort.quelle !== "gps" || Date.now() - ort.zeit > 10 * 60000) gpsHolen(true); });
$("#kat-auswahl").addEventListener("change", (e) => {
  const k = e.target.dataset.kat;
  if (k) filterSetzen(k, e.target.checked);
});
$("#himmel-wahl").addEventListener("change", (e) => {
  E.himmel = Number(e.target.value);
  takter.postMessage({ typ: "himmel", wert: E.himmel });
  vorher.postMessage({ typ: "himmel", wert: E.himmel });
  issPaesse = null; nachtListe = null; vorhersagenStarten(); taktAnfordern(true);
});
$("#opt-ab10").addEventListener("change", (e) => { E.ab10 = e.target.checked; listeZeichnen(true); kurzZeile(); });
$("#opt-linien").addEventListener("change", (e) => { E.linien = e.target.checked; globus.zeigeLinien = E.linien; });
$("#opt-namen").addEventListener("change", (e) => { E.namen = e.target.checked; globus.zeigeNamen = E.namen; });
$("#opt-rot").addEventListener("change", (e) => zeigen.setzeRot(e.target.checked));
$("#ort-gps").addEventListener("click", () => gpsHolen(true));
$("#ort-tippen").addEventListener("click", () => {
  $("#einstellungen").close();
  globus.ortWaehlen = true;
  melde("Tippe auf dem Globus auf deinen Ort.", 8);
});
$("#ort-setzen").addEventListener("click", () => {
  const lat = parseFloat($("#ort-lat").value.replace(",", ".")), lon = parseFloat($("#ort-lon").value.replace(",", "."));
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { melde("Bitte Breite (−90 bis 90) und Länge (−180 bis 180) eingeben."); return; }
  ortSetzen(lat, lon, "gewählt");
  $("#einstellungen").close();
});

// ---------------------------------------------------------------- Uhr
setInterval(() => { $("#uhr").textContent = uhr(Date.now(), true); }, 1000);
$("#uhr").textContent = uhr(Date.now(), true);

// ---------------------------------------------------------------- Start
function startFertig() {
  if (gestartet || !bilderDa || !datenDa) return;
  gestartet = true;
  $("#lade").classList.add("weg");
  setTimeout(() => $("#lade").remove(), 800);
  versatzAnpassen();
  if (ort) { angeflogen = true; globus.anflug(); }
  else globus.fernStart();
  if (PC.matches) zeigeReiter("oben", false);
  // danach in Ruhe: scharfe Erdbilder, Küsten und Grenzen
  setTimeout(() => globus.hochaufloesend(), 1200);
  holeJson("data/grenzen.json").then((d) => globus.grenzen(d)).catch(() => {});
  setTimeout(() => orteLaden(), 2500);
}

(function start() {
  takter.postMessage({ typ: "himmel", wert: E.himmel });
  vorher.postMessage({ typ: "himmel", wert: E.himmel });
  // Standort bei jedem Besuch neu bestimmen (nichts gespeichert)
  gpsHolen(false);
  // Wer die Standortfrage noch nicht beantwortet hat, sieht so lange Berlin
  setTimeout(() => { if (!ort) { ortSetzen(ERSATZ_ORT.lat, ERSATZ_ORT.lon, "ersatz"); melde("Bis dein Standort freigegeben ist, wird Berlin angenommen.", 6); } }, 8000);
  datenLaden();
  versatzAnpassen();
  // Nach spätestens 12 s die Ladeanzeige weg, auch wenn ein Bild fehlt
  setTimeout(() => { if (!gestartet && datenDa) { bilderDa = true; startFertig(); } }, 12000);
})();

// zum Testen von außen
window.__sus = { get tick() { return tick; }, get sats() { return sats; }, get auswahl() { return auswahl; }, waehle, globus, get ort() { return ort; }, get issPaesse() { return issPaesse; }, get nachtListe() { return nachtListe; }, zeigen, himmelDaten, himmelLiveOeffnen, ortName, unterpunkt, objektZeigen, uebersichtSetzen, get boxArt() { return boxArt; }, himmel, zeigeReiter, blattHoehe };

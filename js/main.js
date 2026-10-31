// Satelliten über mir – Hauptprogramm
import { Globus, KAT } from "./globus.js";
import * as A from "./astro.js";
import { $, $$, esc, zahl, km, grad, mag, uhr, tag, datum, relativ, alterText, melde, speicher, helligkeitWort } from "./ui.js";
import { steckbriefHtml, steckbriefAktualisieren, wikiLaden, passHtml, zustandText } from "./steckbrief.js";
import { bekannt, anzeigeName } from "./texte.js";
import { Himmel } from "./himmel.js";
import { Zeigen } from "./zeigen.js";
import { missweisung } from "./magvar.js";

const ISS = 25544;
const ERSATZ_ORT = { lat: 52.5163, lon: 13.3777, name: "Berlin" };
const PC = window.matchMedia("(min-width: 900px)");

// ---------------------------------------------------------------- Einstellungen
const STANDARD = {
  filter: Object.fromEntries(Object.keys(KAT).map((k) => [k, true])),
  himmel: 4.5, ab10: false, linien: true, namen: true, alle: true, liste: "hell",
};
const E = Object.assign({}, STANDARD, speicher.lies("sus.einstellungen", {}));
E.filter = Object.assign({}, STANDARD.filter, E.filter || {});
const sichern = () => speicher.schreib("sus.einstellungen", E);

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
let sterne = null, sternVektoren = null;
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
  const o0 = { folgen: false, ring: { visible: true }, bahnIdx: -1, satPosition: () => null };
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
  setTimeout(() => { bilderDa = true; startFertig(); melde("Dein Browser kann den 3D-Globus nicht anzeigen (WebGL fehlt). Listen, Himmelskarte und Zeigen funktionieren trotzdem.", 12); blattHoehe("gross"); }, 0);
}
function globusOptionen() { return {
  onWahl: (i) => waehle(i),
  onBereit: () => { bilderDa = true; startFertig(); },
  onFehler: (t) => melde(t, 8),
  onOrtTippen: (p) => {
    if (!p) { melde("Bitte direkt auf die Erde tippen."); return; }
    ortSetzen(p.lat, p.lon, "gewählt");
    melde("Standort übernommen.");
  },
  onBedienung: () => {},
}; }
globus.zeigeLinien = E.linien;
globus.zeigeNamen = E.namen;
globus.setzeFilter(E.filter);
let bilderDa = false, datenDa = false, gestartet = false;

// ---------------------------------------------------------------- Blatt (unten) bzw. Leiste (rechts)
const blatt = $("#blatt");
function blattHoehe(h) {
  if (PC.matches) return;
  blatt.dataset.hoehe = h;
  setTimeout(versatzAnpassen, 340);
  if (h !== "klein" && reiter === "oben" && !$("#seite-oben").hidden) listeZeichnen(true);
}
function versatzAnpassen() {
  if (PC.matches) { globus.setzeVersatz(blatt.offsetWidth, 0); return; }
  const sicht = Math.max(0, window.innerHeight - blatt.getBoundingClientRect().top);
  // Globus nur ein Stück nach oben schieben, damit er nicht zu klein wird
  globus.setzeVersatz(0, Math.min(sicht, window.innerHeight * 0.5));
}
PC.addEventListener("change", () => { blatt.style.transform = ""; versatzAnpassen(); });
window.addEventListener("resize", () => setTimeout(versatzAnpassen, 50));
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
  if (auch && blatt.dataset.hoehe === "klein") blattHoehe("halb");
  $("#blatt-inhalt").scrollTop = 0;
  if (r === "oben") listeZeichnen(true);
  if (r === "iss") issZeichnen();
  if (r === "nacht") nachtZeichnen();
  if (r === "himmel") requestAnimationFrame(() => himmelZeichnen());
}
for (const b of $$(".reiter button")) b.addEventListener("click", () => {
  if (auswahl >= 0 && b.dataset.reiter !== "himmel") waehle(-1, false);
  zeigeReiter(b.dataset.reiter);
});
for (const b of $$(".filter button")) b.addEventListener("click", () => {
  E.liste = b.dataset.filter; sichern(); zeigeBis = 150;
  for (const x of $$(".filter button")) x.setAttribute("aria-pressed", String(x === b));
  listeZeichnen(true);
});
for (const x of $$(".filter button")) x.setAttribute("aria-pressed", String(x.dataset.filter === E.liste));

// ---------------------------------------------------------------- Standort
function ortSetzen(lat, lon, quelle, genau = null) {
  ort = { lat, lon, quelle, genau, zeit: Date.now() };
  if (quelle !== "ersatz") speicher.schreib("sus.ort", ort);
  B = A.beobachter(lat, lon, 0);
  takter.postMessage({ typ: "ort", lat, lon, h: 0 });
  vorher.postMessage({ typ: "ort", lat, lon, h: 0 });
  globus.setzeBeobachter(lat, lon);
  ortText();
  issPaesse = null; nachtListe = null;
  if (datenDa) { vorhersagenStarten(); taktAnfordern(); }
  if (gestartet) globus.zuMir();
}
function ortText() {
  if (!ort) return;
  const q = { gps: "", gespeichert: " (zuletzt)", gewählt: " (gewählt)", ersatz: ` (Ersatz: ${ERSATZ_ORT.name})` }[ort.quelle] || "";
  $("#ort-text").textContent = `📍 ${zahl(Math.abs(ort.lat), 2)}° ${ort.lat >= 0 ? "N" : "S"}, ${zahl(Math.abs(ort.lon), 2)}° ${ort.lon >= 0 ? "O" : "W"}${q}`;
  $("#ort-lat").value = ort.lat.toFixed(4);
  $("#ort-lon").value = ort.lon.toFixed(4);
  $("#ort-info").textContent = ort.quelle === "gps"
    ? `Bestimmt per GPS/WLAN${ort.genau ? ", auf etwa " + zahl(Math.max(1, Math.round(ort.genau))) + " m genau" : ""}. Der Standort bleibt auf deinem Gerät.`
    : ort.quelle === "ersatz" ? "Dein Standort ist nicht freigegeben – bis dahin wird Berlin angenommen."
    : "Der Standort bleibt auf deinem Gerät.";
}
function gpsHolen(laut = false) {
  if (!navigator.geolocation) { if (!ort) ortSetzen(ERSATZ_ORT.lat, ERSATZ_ORT.lon, "ersatz"); return; }
  if (laut) melde("Standort wird bestimmt …", 4);
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const neu = !ort || ort.quelle !== "gps" || Math.hypot(p.coords.latitude - ort.lat, p.coords.longitude - ort.lon) > 0.005;
      if (neu) ortSetzen(p.coords.latitude, p.coords.longitude, "gps", p.coords.accuracy);
      if (laut) melde("Standort aktualisiert.", 3);
    },
    (err) => {
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
    if (E.alle) await alleLaden();
    standPruefen();
    holeJson("data/stand.json").then((s) => { stand = Object.assign(stand || {}, s, { erzeugt: Date.parse(s.erzeugt) }); datenInfo(); }).catch(() => {});
    holeJson("data/sterne.json").then((s) => { sterne = s.sterne; globus.sterne(sterne, Date.now()); sternVektoren = null; }).catch(() => {});
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

/** kleiner Zwischenspeicher im Browser (IndexedDB) für die großen Bahndaten */
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

function neuesteEpoche() {
  let m = 0;
  for (const s of sats) if ((s[15] & 3) || s[0] === ISS) m = Math.max(m, s[3]);
  return m * 1000;
}

/* Die Seite holt sich frische Bahndaten selbst direkt bei CelesTrak:
   - Raumstationen und helle Satelliten, wenn ihre Bahndaten älter als 6 Stunden sind (höchstens alle 2 Stunden, klein),
   - alle aktiven Satelliten, wenn der Datenstand der Seite älter als einen Tag ist (höchstens einmal am Tag,
     im Browser zwischengespeichert, ca. 3 MB). */
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
        const gemerkt = speicher.lies("sus.kern2", null);
        if (gemerkt && jetzt - gemerkt.zeit < 2 * 3600000) { liste = gemerkt.daten; zeit = gemerkt.zeit; }
        else {
          const [a, b] = await Promise.all([holeText(CELESTRAK + "stations", 15), holeText(CELESTRAK + "visual", 15)]);
          liste = kurzSaetze(csvLesen(a).concat(csvLesen(b)));
          speicher.schreib("sus.kern2", { zeit: jetzt, daten: liste });
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
    // 2) alle aktiven Satelliten
    if (alleGeladen && jetzt - stand.erzeugt > 24 * 3600000) {
      let k = await ablage.lies("aktiv");
      if (!k || jetzt - k.zeit > 24 * 3600000) {
        if (jetzt - (speicher.lies("sus.aktivVersuch", 0) || 0) > 3600000) {
          speicher.schreib("sus.aktivVersuch", jetzt);
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
  let t = `${zahl(n)} Objekte geladen${E.alle ? "" : " (nur helle Satelliten und Raumstationen)"}.`;
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
  if (jetzt - letzteListe > 2000) {
    letzteListe = jetzt;
    if (!$("#seite-oben").hidden && (PC.matches || blatt.dataset.hoehe !== "klein")) listeZeichnen();
    if (!$("#seite-iss").hidden) issZeichnen();
  }
  if (!$("#seite-himmel").hidden) himmelZeichnen();
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
  if (s && s.r) html += `<p class="hinweis-klein">Gerade ${km(s.r.r)} von dir entfernt, ${Math.round(s.r.el)}° über dem Horizont in Richtung ${A.richtung(s.r.az)}.</p>`;
  const angedockt = tick && tick.angedockt ? tick.angedockt.iss.map((i) => anzeigeName(sats[i][1])) : [];
  if (angedockt.length) html += `<p class="hinweis-klein">Mit der ISS verbunden: ${esc(angedockt.join(", "))}.</p>`;
  html += `<div class="knopf-reihe"><button class="knopf-gross haupt" data-iss="steckbrief"><svg viewBox="0 0 40 24" style="width:30px"><use href="#i-iss"/></svg>Alles über die ISS</button></div>`;
  html += `<h3 class="abschnitt">Überflüge in den nächsten 5 Tagen</h3>`;
  if (!issPaesse) html += '<p class="leer">wird berechnet …</p>';
  else if (!issPaesse.length) html += '<p class="leer">Keine Überflüge gefunden.</p>';
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
function listeZeichnen(neu = false) {
  const el = $("#oben-liste");
  if (!tick) { el.innerHTML = '<li class="leer">wird berechnet …</li>'; return; }
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
const himmel = new Himmel($("#himmel-karte"), { onWahl: (i) => waehle(i) });
function sternRichtungen() {
  if (!sterne || !B || !tick) return null;
  const jetzt = Date.now();
  if (sternVektoren && jetzt - sternVektoren.zeit < 2000 && sternVektoren.ort === B) return sternVektoren.liste;
  if (!sternVektoren || !sternVektoren.eci) {
    sternVektoren = { eci: sterne.map((s) => { const p = A.praezession(s[0], s[1], jetzt); return A.radecVektor(p.ra, p.dec); }) };
  }
  const g = A.gmst(jetzt);
  const liste = sterne.map((s, k) => { const b = A.blickEci(B, sternVektoren.eci[k], g); return { az: b.az, el: b.el, mag: s[2], name: s[4] }; });
  sternVektoren.liste = liste; sternVektoren.zeit = jetzt; sternVektoren.ort = B;
  return liste;
}
function himmelZeichnen() {
  if (!tick) return;
  const o = tick.oben, liste = [];
  for (let k = 0; k < o.length; k += 7) {
    const i = o[k], st = tick.st[i], s = sats[i];
    if (st & 64 || E.filter[s[14]] === false) continue;
    if (E.liste === "hell" && !((s[15] & 3) || (st & 8) || i === issIdx || (s[16] != null && s[16] <= 4)) && i !== auswahl) continue;
    if (E.liste === "sichtbar" && !(st & 8) && i !== issIdx && i !== auswahl) continue;
    liste.push({ i, az: o[k + 1], el: o[k + 2], mag: o[k + 4], sichtbar: !!(st & 8), licht: !!(st & 4), iss: i === issIdx, name: anzeigeName(s[1]) });
  }
  let aus = null;
  if (auswahl >= 0) {
    const r = zielRichtung();
    if (r) aus = { az: r.az, el: r.el, name: anzeigeName(sats[auswahl][1]) };
  }
  himmel.zeichne({ sats: liste, sonne: tick.sonne, mond: tick.mond, sterne: sternRichtungen(), bahn: auswahlBahnHimmel && auswahlBahnHimmel.i === auswahl ? auswahlBahnHimmel.daten : null, auswahl: aus });
}

// ---------------------------------------------------------------- Auswahl und Steckbrief
let vorReiter = "oben";
function waehle(i, oeffnen = true) {
  if (i == null || i < 0 || i >= sats.length) {
    if (auswahl >= 0) {
      auswahl = -1;
      globus.setzeAuswahl(-1);
      takter.postMessage({ typ: "auswahl", i: -1 });
      globus.setzeBahnZiel(issIdx);
      zuletztBahn = 0;
      if (!$("#seite-steckbrief").hidden) zeigeReiter(vorReiter, false);
    }
    return;
  }
  if (auswahl < 0 && $("#seite-steckbrief").hidden) vorReiter = reiter;
  auswahl = i;
  globus.setzeAuswahl(i);
  globus.setzeBahnZiel(i);
  zuletztBahn = 0;
  auswahlBahnHimmel = null;
  takter.postMessage({ typ: "auswahl", i });
  if (oeffnen) steckbriefOeffnen(i);
  taktAnfordern(true);
}

function steckbriefOeffnen(i) {
  const s = sats[i];
  for (const x of $$(".seite")) x.hidden = x.id !== "seite-steckbrief";
  for (const b of $$(".reiter button")) b.setAttribute("aria-selected", "false");
  if (blatt.dataset.hoehe === "klein") blattHoehe("halb");
  $("#blatt-inhalt").scrollTop = 0;
  const el = $("#steckbrief");
  const b = bekannt(s[0], s[1]);
  const zeichnen = (erstesMal) => {
    el.innerHTML = steckbriefHtml({ sat: s, info: info ? info[String(s[0])] : null, jetzt: Date.now() });
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
  zeichnen(true);
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
    let html;
    if (m.hoch) {
      html = `<li class="leer">${m.immerOben ? `Dieser Satellit steht für dich dauerhaft über dem Horizont: in Richtung ${A.richtung(m.az)}, ${Math.round(m.el)}° hoch. Er geht weder auf noch unter.` : "Dieser Satellit bleibt für dich dauerhaft unter dem Horizont."}</li>`;
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
          ? `<li class="leer">Seine Bahn ist nur ${zahl(s[6], 1)}° gegen den Äquator geneigt. Er fliegt deshalb nie weit genug nach ${ort.lat > 0 ? "Norden" : "Süden"} und kommt bei dir nie über den Horizont.</li>`
          : '<li class="leer">In den nächsten 3 Tagen kommt er nicht über deinen Horizont.</li>';
      }
    }
    paesseCache = { id: s[0], html };
    const ziel = $('#steckbrief [data-wert="ueberfluege"]');
    if (ziel && $("#steckbrief").dataset.id === String(s[0])) ziel.innerHTML = html;
  });
}

function steckbriefLive() {
  const el = $("#steckbrief");
  if (auswahl < 0 || $("#seite-steckbrief").hidden || !tick) return;
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
  if (a === "zurueck") waehle(-1);
  else if (a === "folgen") {
    if (globus.folgen) globus.folgen = false;
    else { globus.starteFolgen(); if (blatt.dataset.hoehe === "gross") blattHoehe("halb"); }
    b.setAttribute("aria-pressed", String(globus.folgen));
  } else if (a === "himmel") {
    const i = auswahl;
    zeigeReiter("himmel");
    auswahl = i;
  } else if (a === "zeigen") zeigenStarten();
});

// ---------------------------------------------------------------- Zeigen (Lagesensoren)
const zeigen = new Zeigen({
  beobachter: () => ort,
  missweisung: (lat, lon) => missweisung(lat, lon, 0, new Date()),
  sonne: () => (tick ? tick.sonne : null),
  mond: () => (tick ? tick.mond : null),
  sterne: () => sternRichtungen(),
  andere: () => {
    if (!tick) return [];
    const o = tick.oben, out = [];
    for (let k = 0; k < o.length && out.length < 300; k += 7) {
      const i = o[k], st = tick.st[i];
      if (i === auswahl || (st & 64) || !(st & 4)) continue;
      if (E.filter[sats[i][14]] === false) continue;
      out.push({ az: o[k + 1], el: o[k + 2], sichtbar: !!(st & 8) });
    }
    return out;
  },
  melde: (t) => melde(t, 5),
  onZu: () => {},
});

/** Richtung zum gewählten Satelliten – jedes Bild neu aus der fortgeschriebenen Position */
const _v = { x: 0, y: 0, z: 0 };
function zielRichtung() {
  if (auswahl < 0 || !B || !tick) return null;
  const v = globus.satPosition(auswahl);
  if (!v) {
    const d = tick.auswahl === auswahl ? tick.detail : null;
    return d && d.az != null ? { az: d.az, el: d.el, licht: d.licht, mag: d.mag, sichtbar: !!(tick.st[auswahl] & 8) } : null;
  }
  // Szene -> erdfest [km]
  _v.x = v.x * A.RE; _v.y = -v.z * A.RE; _v.z = v.y * A.RE;
  const b = A.blick(B, _v.x, _v.y, _v.z);
  const st = tick.st[auswahl];
  const d = tick.auswahl === auswahl ? tick.detail : null;
  return { az: b.az, el: b.el, licht: d ? d.licht : (st & 4 ? 1 : 0), mag: d ? d.mag : null, sichtbar: !!(st & 8) };
}

function zeigenStarten() {
  if (auswahl < 0) return;
  const i = auswahl;
  const erlaubt = zeigen.erlaubnis(); // gleich im Klick aufrufen (iOS)
  erlaubt.then((ok) => {
    if (!ok) melde("Ohne Zugriff auf die Lagesensoren kann das Handy nicht zeigen. Du kannst dich trotzdem durch Ziehen umsehen.", 7);
    zeigen.oeffnen({ name: anzeigeName(sats[i][1]), richtung: zielRichtung, bahn: null });
    frage(vorher, { typ: "himmelsbahn", id: sats[i][0], sat: sats[i], von: Date.now() - 60000, bis: Date.now() + 15 * 60000, schritt: 5000 }).then((m) => {
      if (m.daten) zeigen.setzeBahn(m.daten, m.von);
    });
  });
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
  $("#opt-alle").checked = E.alle;
  datenInfo();
  ortText();
}
$("#knopf-einstellungen").addEventListener("click", () => { einstellungenFuellen(); $("#einstellungen").showModal(); });
$("#knopf-hilfe").addEventListener("click", () => $("#hilfe").showModal());
// Dialog schließen, wenn man daneben tippt
for (const d of $$("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
$("#knopf-ort").addEventListener("click", () => { globus.zuMir(); if (!ort || ort.quelle !== "gps" || Date.now() - ort.zeit > 10 * 60000) gpsHolen(true); });
$("#kat-auswahl").addEventListener("change", (e) => {
  const k = e.target.dataset.kat;
  if (!k) return;
  E.filter[k] = e.target.checked; sichern();
  globus.setzeFilter(E.filter);
  listeZeichnen(true); kurzZeile(); issChip();
});
$("#himmel-wahl").addEventListener("change", (e) => {
  E.himmel = Number(e.target.value); sichern();
  takter.postMessage({ typ: "himmel", wert: E.himmel });
  vorher.postMessage({ typ: "himmel", wert: E.himmel });
  issPaesse = null; nachtListe = null; vorhersagenStarten(); taktAnfordern(true);
});
$("#opt-ab10").addEventListener("change", (e) => { E.ab10 = e.target.checked; sichern(); listeZeichnen(true); kurzZeile(); });
$("#opt-linien").addEventListener("change", (e) => { E.linien = e.target.checked; sichern(); globus.zeigeLinien = E.linien; });
$("#opt-namen").addEventListener("change", (e) => { E.namen = e.target.checked; sichern(); globus.zeigeNamen = E.namen; });
$("#opt-alle").addEventListener("change", (e) => {
  E.alle = e.target.checked; sichern();
  if (E.alle) alleLaden();
  else melde("Wird beim nächsten Öffnen der Seite wirksam.", 4);
});
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
  if (ort) globus.zuMir();
  if (PC.matches) zeigeReiter("oben", false);
}

(function start() {
  takter.postMessage({ typ: "himmel", wert: E.himmel });
  vorher.postMessage({ typ: "himmel", wert: E.himmel });
  const gemerkt = speicher.lies("sus.ort", null);
  if (gemerkt && Number.isFinite(gemerkt.lat) && Number.isFinite(gemerkt.lon)) {
    ortSetzen(gemerkt.lat, gemerkt.lon, gemerkt.quelle === "gewählt" ? "gewählt" : "gespeichert", gemerkt.genau);
    if (gemerkt.quelle !== "gewählt") gpsHolen(false);
  } else {
    gpsHolen(false);
    // Wer die Standortfrage noch nicht beantwortet hat, sieht so lange Berlin
    setTimeout(() => { if (!ort) { ortSetzen(ERSATZ_ORT.lat, ERSATZ_ORT.lon, "ersatz"); melde("Bis dein Standort freigegeben ist, wird Berlin angenommen.", 6); } }, 8000);
  }
  datenLaden();
  versatzAnpassen();
  // Nach spätestens 12 s die Ladeanzeige weg, auch wenn ein Bild fehlt
  setTimeout(() => { if (!gestartet && datenDa) { bilderDa = true; startFertig(); } }, 12000);
})();

// zum Testen von außen
window.__sus = { get tick() { return tick; }, get sats() { return sats; }, get auswahl() { return auswahl; }, waehle, globus, get ort() { return ort; }, get issPaesse() { return issPaesse; }, get nachtListe() { return nachtListe; }, zeigen };

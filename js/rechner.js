// Rechen-Worker: Bahnrechnung (SGP4), Sichtbarkeit, Überflüge.
// Läuft zweimal: einmal für den laufenden Takt aller Satelliten, einmal für Vorhersagen.
import { json2satrec, sgp4 } from "../lib/satellite.min.js";
import * as A from "./astro.js";

const OMEGA = 7.292115e-5; // Erddrehung [rad/s]
const sats = [];           // { sr, id, n, std, kat, flags }
const nachId = new Map();
let B = null;              // Beobachter
let himmel = 4.5;          // Grenzhelligkeit bei dunklem Himmel
let auswahl = -1;
const STATION_IDS = { iss: 25544, css: 48274 };

function ommAus(a) {
  return {
    OBJECT_NAME: a[1], NORAD_CAT_ID: a[0], OBJECT_ID: a[2],
    EPOCH: new Date(a[3] * 1000).toISOString(),
    MEAN_MOTION: a[4], ECCENTRICITY: a[5], INCLINATION: a[6], RA_OF_ASC_NODE: a[7],
    ARG_OF_PERICENTER: a[8], MEAN_ANOMALY: a[9], BSTAR: a[10], MEAN_MOTION_DOT: a[11],
    MEAN_MOTION_DDOT: a[12], REV_AT_EPOCH: a[13], ELEMENT_SET_NO: 999, EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: "U",
  };
}

function satAus(a) {
  let sr = null;
  try {
    sr = json2satrec(ommAus(a));
    if (sr.error) sr = null;
  } catch (e) {
    sr = null;
  }
  return { sr, id: a[0], n: a[4], std: a[16], kat: a[14], flags: a[15] };
}

/** Lage im inertialen System (TEME) [km, km/s] oder null */
function lage(s, ms) {
  if (!s.sr) return null;
  const r = sgp4(s.sr, (A.jd(ms) - s.sr.jdsatepoch) * 1440);
  if (!r || !r.position || !Number.isFinite(r.position.x)) return null;
  const p = r.position;
  const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
  if (r2 < A.RE * A.RE) return null; // verglüht
  // unsinnige Werte (z. B. sehr alte Bahndaten einer tief fliegenden Stufe): weiter als 2 Mio. km gibt es hier nicht
  if (r2 > 4e12) return null;
  return r;
}

/** alles, was man für einen Satelliten zu einem Zeitpunkt vom Beobachter aus wissen will */
function sicht(s, ms, mitDetails = false) {
  const r = lage(s, ms);
  if (!r) return null;
  const p = r.position, v = r.velocity;
  const g = A.gmst(ms);
  const e = A.eciZuEcef(p, g);
  const so = A.sonne(ms);
  const licht = A.lichtAnteil(p, so);
  const out = { p, v, licht };
  if (B) {
    const b = A.blick(B, e.x, e.y, e.z);
    out.az = b.az; out.el = b.el; out.r = b.r;
    const sb = A.blickEci(B, so, g);
    out.sonneEl = sb.el;
    if (licht > 0.02) {
      const beobEci = A.ecefZuEci(B.ecef, g);
      out.phase = A.phasenWinkel(p, so, beobEci);
      out.mag = A.helligkeit(s.std, b.r, out.phase, b.el, licht);
    } else out.mag = null;
    // Entfernungsänderung (+ = entfernt sich)
    const ve = A.eciZuEcef(v, g);
    const vx = ve.x + OMEGA * e.y, vy = ve.y - OMEGA * e.x, vz = ve.z;
    const dx = e.x - B.ecef.x, dy = e.y - B.ecef.y, dz = e.z - B.ecef.z;
    out.rr = (dx * vx + dy * vy + dz * vz) / b.r;
    const grenze = A.sichtGrenze(sb.el, himmel);
    out.grenze = grenze;
    out.sichtbar = licht >= 0.5 && b.el >= 10 && out.mag != null && out.mag <= grenze;
  }
  if (mitDetails) {
    const geo = A.ecefZuGeo(e.x, e.y, e.z);
    out.lat = geo.lat; out.lon = geo.lon; out.hoehe = geo.h;
    out.tempo = Math.hypot(v.x, v.y, v.z);
  }
  return out;
}

// ---------------------------------------------------------------- Takt
function takt(ms) {
  const t0 = performance.now();
  const N = sats.length;
  const pos = new Float32Array(3 * N), vel = new Float32Array(3 * N);
  const st = new Uint8Array(N);
  const g = A.gmst(ms), cg = Math.cos(g), sg = Math.sin(g);
  const so = A.sonne(ms);
  let sonneB = null, grenze = -99, beobEci = null;
  if (B) {
    sonneB = A.blickEci(B, so, g);
    grenze = A.sichtGrenze(sonneB.el, himmel);
    beobEci = A.ecefZuEci(B.ecef, g);
  }
  const oben = [];
  for (let i = 0; i < N; i++) {
    const s = sats[i];
    const r = lage(s, ms);
    if (!r) continue;
    const p = r.position, v = r.velocity;
    pos[3 * i] = p.x; pos[3 * i + 1] = p.y; pos[3 * i + 2] = p.z;
    vel[3 * i] = v.x; vel[3 * i + 1] = v.y; vel[3 * i + 2] = v.z;
    let f = 1;
    const licht = A.lichtAnteil(p, so);
    if (licht >= 0.5) f |= 4;
    if (licht > 0 && licht < 1) f |= 32;
    if (B) {
      const ex = cg * p.x + sg * p.y, ey = -sg * p.x + cg * p.y, ez = p.z;
      const dx = ex - B.ecef.x, dy = ey - B.ecef.y, dz = ez - B.ecef.z;
      const up = B.cla * B.clo * dx + B.cla * B.slo * dy + B.sla * dz;
      if (up > 0) {
        const b = A.blick(B, ex, ey, ez);
        f |= 2;
        if (b.el >= 10) f |= 16;
        let mag = null;
        if (licht > 0.02) mag = A.helligkeit(s.std, b.r, A.phasenWinkel(p, so, beobEci), b.el, licht);
        if (licht >= 0.5 && b.el >= 10 && mag != null && mag <= grenze) f |= 8;
        const ve = { x: cg * v.x + sg * v.y + OMEGA * ey, y: -sg * v.x + cg * v.y - OMEGA * ex, z: v.z };
        const rr = (dx * ve.x + dy * ve.y + dz * ve.z) / b.r;
        oben.push(i, b.az, b.el, b.r, mag == null ? 99 : mag, rr, licht);
      }
    }
    st[i] = f;
  }
  // angedockte Raumschiffe und Module (weniger als 5 km von ISS bzw. CSS entfernt)
  const angedockt = { iss: [], css: [] };
  for (const [name, id] of Object.entries(STATION_IDS)) {
    const k = nachId.get(id);
    if (k == null || !(st[k] & 1)) continue;
    const kx = pos[3 * k], ky = pos[3 * k + 1], kz = pos[3 * k + 2];
    for (let i = 0; i < N; i++) {
      if (i === k || !(st[i] & 1)) continue;
      const kat = sats[i].kat;
      if (kat !== "station" && kat !== "sonst") continue;
      const d = Math.hypot(pos[3 * i] - kx, pos[3 * i + 1] - ky, pos[3 * i + 2] - kz);
      if (d < 5) { st[i] |= 64; angedockt[name].push(i); }
    }
  }
  let detail = null;
  if (auswahl >= 0 && auswahl < N) detail = sicht(sats[auswahl], ms, true);
  let mondB = null;
  if (B) {
    const mo = A.mond(ms);
    const mb = A.blickEci(B, mo, g, false);
    mondB = { az: mb.az, el: mb.el, phase: A.mondPhase(ms) };
  }
  const obenArr = new Float32Array(oben);
  postMessage({
    typ: "takt", t: ms, g, pos, vel, st, oben: obenArr, angedockt, detail, auswahl,
    sonne: { x: so.x, y: so.y, z: so.z, el: sonneB ? sonneB.el : null, az: sonneB ? sonneB.az : null },
    mond: mondB, grenze, dauer: performance.now() - t0,
  }, [pos.buffer, vel.buffer, st.buffer, obenArr.buffer]);
}

// ---------------------------------------------------------------- Bahn
function bahn(i, ms) {
  const s = sats[i];
  if (!s || !s.sr) return;
  const P = 1440 / s.n; // Minuten
  const ringN = 240;
  const ring = new Float32Array(3 * (ringN + 1));
  for (let k = 0; k <= ringN; k++) {
    const r = lage(s, ms + (k / ringN) * P * 60000);
    if (!r) continue;
    ring[3 * k] = r.position.x; ring[3 * k + 1] = r.position.y; ring[3 * k + 2] = r.position.z;
  }
  // Bodenspur: ein Viertel Umlauf zurück, eineinviertel voraus
  const schritt = Math.max(20, (P * 60) / 400) * 1000;
  const spur = [];
  for (let t = ms - 0.25 * P * 60000; t <= ms + 1.25 * P * 60000; t += schritt) {
    const r = lage(s, t);
    if (!r) continue;
    const e = A.eciZuEcef(r.position, A.gmst(t));
    const geo = A.ecefZuGeo(e.x, e.y, e.z);
    spur.push(geo.lat, geo.lon, (t - ms) / 1000);
  }
  const spurArr = new Float32Array(spur);
  postMessage({ typ: "bahn", i, t: ms, ring, spur: spurArr }, [ring.buffer, spurArr.buffer]);
}

// ---------------------------------------------------------------- Überflüge
function hoehe(s, ms) {
  const r = lage(s, ms);
  if (!r) return -90;
  const e = A.eciZuEcef(r.position, A.gmst(ms));
  return A.blick(B, e.x, e.y, e.z).el;
}

function verfeinern(s, ta, tb) { // Nullstelle der Höhe zwischen ta und tb (auf 1 s)
  let ea = hoehe(s, ta);
  while (tb - ta > 1000) {
    const tm = (ta + tb) / 2, em = hoehe(s, tm);
    if ((em > 0) === (ea > 0)) { ta = tm; ea = em; } else tb = tm;
  }
  return (ta + tb) / 2;
}

function auswerten(s, start, ende) {
  const n = Math.min(240, Math.max(30, Math.round((ende - start) / 5000)));
  const dt = (ende - start) / n;
  let best = null, sichtbar = null, schwach = null, hellste = null, tag = false, schatten = true;
  for (let k = 0; k <= n; k++) {
    const t = start + k * dt;
    const x = sicht(s, t);
    if (!x) continue;
    if (!best || x.el > best.el) best = { t, el: x.el, az: x.az };
    if (x.licht >= 0.5) schatten = false;
    if (x.sonneEl > -0.833) tag = true;
    if (x.sichtbar) {
      if (!sichtbar) sichtbar = { start: t, azStart: x.az, elStart: x.el };
      sichtbar.ende = t; sichtbar.azEnde = x.az; sichtbar.elEnde = x.el;
      if (hellste == null || x.mag < hellste) hellste = x.mag;
    } else if (x.licht >= 0.5 && x.el >= 10 && x.sonneEl < -6) {
      if (!schwach) schwach = { start: t, azStart: x.az, elStart: x.el, hellste: x.mag };
      schwach.ende = t; schwach.azEnde = x.az; schwach.elEnde = x.el;
      if (x.mag != null && (schwach.hellste == null || x.mag < schwach.hellste)) schwach.hellste = x.mag;
    }
  }
  const a = sicht(s, start), z = sicht(s, ende);
  // Art: 1 = mit bloßem Auge sichtbar, 2 = angestrahlt, aber zu schwach,
  //      3 = am Taghimmel, 4 = angestrahlt, aber Himmel noch zu hell, 0 = im Erdschatten
  const art = sichtbar ? 1 : schwach ? 2 : tag ? 3 : schatten ? 0 : 4;
  return {
    start, ende, dauer: (ende - start) / 1000,
    maxT: best ? best.t : start, maxEl: best ? best.el : 0, azMax: best ? best.az : 0,
    azStart: a ? a.az : 0, azEnde: z ? z.az : 0,
    art, sichtbar, schwach: art === 2 ? schwach : null, hellste, schatten,
  };
}

function ueberfluege(s, von, bis, schritt) {
  const liste = [];
  let tA = von, eA = hoehe(s, von);
  let start = eA > 0 ? von : null;
  for (let t = von + schritt; t <= bis + schritt; t += schritt) {
    const e = hoehe(s, t);
    if (start == null && e > 0) start = verfeinern(s, tA, t);
    else if (start != null && e <= 0) {
      const ende = verfeinern(s, tA, t);
      const p = auswerten(s, start, ende);
      if (start === von) p.laeuft = true;
      if (p.maxEl > 0.5) liste.push(p);
      start = null;
    }
    tA = t; eA = e;
  }
  return liste;
}

function vorhersage(m) {
  const s = m.sat ? satAus(m.sat) : sats[nachId.get(m.id)];
  if (!s || !s.sr || !B) {
    postMessage({ typ: "ueberfluege", id: m.id, anfrage: m.anfrage, fehler: "keine Bahndaten" });
    return;
  }
  const P = 1440 / s.n;
  const von = m.von, bis = m.von + m.tage * 86400000;
  // geostationär o. ä.: kein Auf- und Untergang
  if (P > 600) {
    const x = sicht(s, von);
    postMessage({ typ: "ueberfluege", id: m.id, anfrage: m.anfrage, hoch: true, immerOben: x && x.el > 0, el: x ? x.el : null, az: x ? x.az : null, liste: [] });
    return;
  }
  const schritt = P < 110 ? 30000 : P < 200 ? 45000 : 120000;
  const liste = ueberfluege(s, von, bis, schritt);
  postMessage({ typ: "ueberfluege", id: m.id, anfrage: m.anfrage, liste });
}

// sichtbare Überflüge vieler heller Satelliten (nur in dunklen Zeiten)
function nacht(m) {
  const t0 = performance.now();
  const von = m.von, bis = m.von + m.stunden * 3600000;
  // dunkle Abschnitte bestimmen (Sonne unter -3°)
  const dunkel = [];
  let a = null;
  for (let t = von; t <= bis; t += 300000) {
    const g = A.gmst(t);
    const el = A.blickEci(B, A.sonne(t), g).el;
    if (el < -3 && a == null) a = t;
    if ((el >= -3 || t + 300000 > bis) && a != null) { dunkel.push([a, Math.min(t, bis)]); a = null; }
  }
  const ergebnis = [];
  const kandidaten = m.ids.map((id) => nachId.get(id)).filter((i) => i != null);
  for (const i of kandidaten) {
    const s = sats[i];
    if (!s.sr || 1440 / s.n > 225) continue; // nur niedrige Bahnen
    for (const [v, b] of dunkel) {
      for (const p of ueberfluege(s, v - 600000, b, 60000)) {
        if (p.art === 1 && p.ende >= von) ergebnis.push(Object.assign(p, { i, id: s.id }));
      }
    }
  }
  // doppelte (über Fenstergrenzen) entfernen
  ergebnis.sort((x, y) => x.start - y.start);
  const ohne = ergebnis.filter((p, k) => !ergebnis.slice(0, k).some((q) => q.id === p.id && Math.abs(q.start - p.start) < 60000));
  postMessage({ typ: "nacht", anfrage: m.anfrage, liste: ohne, dunkel, dauer: performance.now() - t0 });
}

function himmelsbahn(m) {
  const k = nachId.get(m.id);
  const s = m.sat ? satAus(m.sat) : sats[k];
  if (!s || !s.sr || !B) return;
  const out = [];
  for (let t = m.von; t <= m.bis; t += m.schritt) {
    const x = sicht(s, t);
    if (!x) continue;
    out.push((t - m.von) / 1000, x.az, x.el, x.licht);
  }
  const arr = new Float32Array(out);
  postMessage({ typ: "himmelsbahn", id: m.id, anfrage: m.anfrage, von: m.von, daten: arr }, [arr.buffer]);
}

onmessage = (ev) => {
  const m = ev.data;
  try {
    switch (m.typ) {
      case "daten": {
        for (const a of m.sats) {
          const s = satAus(a);
          const k = nachId.get(s.id);
          if (k != null) sats[k] = s; // Aktualisierung
          else { nachId.set(s.id, sats.length); sats.push(s); }
        }
        postMessage({ typ: "daten", anzahl: sats.length, ungueltig: sats.filter((s) => !s.sr).length, anfrage: m.anfrage });
        break;
      }
      case "ort": B = A.beobachter(m.lat, m.lon, m.h || 0); break;
      case "himmel": himmel = m.wert; break;
      case "auswahl": auswahl = m.i; break;
      case "takt": takt(m.t); break;
      case "bahn": bahn(m.i, m.t); break;
      case "ueberfluege": vorhersage(m); break;
      case "nacht": nacht(m); break;
      case "himmelsbahn": himmelsbahn(m); break;
      default: break;
    }
  } catch (e) {
    postMessage({ typ: "fehler", anfrage: m.anfrage, wo: m.typ, text: String(e && e.stack || e) });
  }
};

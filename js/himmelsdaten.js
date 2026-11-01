// Himmelsdaten für die Himmelskarte und „Himmel live“: Sterne bis 6 mag, Sternbilder, Planeten, Mond.
// Richtungen werden als Einheitsvektoren Ost–Nord–Oben (ENU) für den Beobachter berechnet.
import * as A from "./astro.js";

export const PLANETEN = [
  { id: "Mercury", name: "Merkur", farbe: "#e2c9b4" },
  { id: "Venus", name: "Venus", farbe: "#fff3cf" },
  { id: "Mars", name: "Mars", farbe: "#ff8a57" },
  { id: "Jupiter", name: "Jupiter", farbe: "#ffe0b0" },
  { id: "Saturn", name: "Saturn", farbe: "#f3dc98" },
  { id: "Uranus", name: "Uranus", farbe: "#a6e8f2" },
  { id: "Neptune", name: "Neptun", farbe: "#8fb0ff" },
];

let AE = null, aeLaedt = null;
/** astronomy-engine erst bei Bedarf laden (ca. 70 kB) */
export function astronomieLaden() {
  if (AE) return Promise.resolve(AE);
  if (!aeLaedt) aeLaedt = import("../lib/astronomy.min.js").then((m) => (AE = m)).catch((e) => { aeLaedt = null; console.warn("astronomy-engine", e); return null; });
  return aeLaedt;
}
export const ae = () => AE;

export class HimmelDaten {
  constructor() {
    this.bereit = false;
    this.sterne = [];       // Zeilen aus sterne.json
    this.sternbilder = [];  // aus sternbilder.json
    this.sbIndex = {};      // Kürzel -> Sternbild
    this.planeten = [];     // aktuelle Planeten (nach planetenAktualisieren)
    this._planZeit = 0;
    this._riseCache = new Map();
  }

  async laden() {
    if (this._laedt) return this._laedt;
    this._laedt = (async () => {
      const [s, b] = await Promise.all([
        fetch("data/sterne.json").then((r) => r.json()),
        fetch("data/sternbilder.json").then((r) => r.json()),
      ]);
      const jetzt = Date.now();
      this.sterne = s.sterne;
      const n = this.sterne.length;
      this.sEci = new Float32Array(3 * n);
      this.sENU = new Float32Array(3 * n);
      this.sMag = new Float32Array(n);
      this.sterne.forEach((z, k) => {
        const v = this._eci(z[0], z[1], jetzt);
        this.sEci[3 * k] = v.x; this.sEci[3 * k + 1] = v.y; this.sEci[3 * k + 2] = v.z;
        this.sMag[k] = z[2];
      });
      // Sternbilder: Linienpunkte, Strecken, Beschriftungen
      this.sternbilder = b.sternbilder;
      const punkte = [], strecken = [], streckeSb = [], lab = [], labSb = [];
      this.sternbilder.forEach((sb, j) => {
        this.sbIndex[sb.k] = sb;
        sb.j = j;
        for (const l of sb.linien) {
          const start = punkte.length / 2;
          for (let q = 0; q < l.length; q += 2) punkte.push(l[q], l[q + 1]);
          for (let q = 1; q < l.length / 2; q++) { strecken.push(start + q - 1, start + q); streckeSb.push(j); }
        }
        for (const p of sb.pos) { lab.push(p[0], p[1]); labSb.push(j); }
      });
      const np = punkte.length / 2;
      this.lEci = new Float32Array(3 * np);
      this.lENU = new Float32Array(3 * np);
      for (let k = 0; k < np; k++) {
        const v = this._eci(punkte[2 * k], punkte[2 * k + 1], jetzt);
        this.lEci[3 * k] = v.x; this.lEci[3 * k + 1] = v.y; this.lEci[3 * k + 2] = v.z;
      }
      this.strecken = Int32Array.from(strecken);
      this.streckeSb = Int16Array.from(streckeSb);
      const nl = lab.length / 2;
      this.labEci = new Float32Array(3 * nl);
      this.labENU = new Float32Array(3 * nl);
      this.labSb = Int16Array.from(labSb);
      for (let k = 0; k < nl; k++) {
        const v = this._eci(lab[2 * k], lab[2 * k + 1], jetzt);
        this.labEci[3 * k] = v.x; this.labEci[3 * k + 1] = v.y; this.labEci[3 * k + 2] = v.z;
      }
      // hellster Stern je Sternbild
      for (let k = 0; k < n; k++) {
        const z = this.sterne[k], sb = this.sbIndex[z[6]];
        if (sb && sb.hellster == null) sb.hellster = k;
      }
      // Sterne der Sternbild-Figuren merken (Linienpunkte liegen < 0,1° an Katalogsternen)
      this.figur = new Uint8Array(n);
      const baender = new Map(); // 1°-Streifen der Deklination -> Sterne
      for (let k = 0; k < n; k++) {
        const b = Math.floor(this.sterne[k][1]);
        if (!baender.has(b)) baender.set(b, []);
        baender.get(b).push(k);
      }
      for (let q = 0; q < punkte.length; q += 2) {
        const ra = punkte[q], dec = punkte[q + 1], c = Math.cos(dec * A.RAD);
        let best = -1, bd = 0.2 * 0.2;
        for (let b = Math.floor(dec) - 1; b <= Math.floor(dec) + 1; b++) {
          for (const k of baender.get(b) || []) {
            const z = this.sterne[k];
            let dra = Math.abs(z[0] - ra); if (dra > 180) dra = 360 - dra;
            const d = (dra * c) ** 2 + (z[1] - dec) ** 2;
            if (d < bd) { bd = d; best = k; }
          }
        }
        if (best >= 0) this.figur[best] = 1;
      }
      this.bereit = true;
    })();
    return this._laedt;
  }

  _eci(raDeg, decDeg, ms) {
    const p = A.praezession(raDeg, decDeg, ms);
    return A.radecVektor(p.ra, p.dec);
  }

  /** Matrix äquatorial (Datum) -> Ost/Nord/Oben für Ort und Zeit */
  matrix(lat, lon, ms) {
    const th = A.gmst(ms) + lon * A.RAD;
    const ct = Math.cos(th), st = Math.sin(th), sla = Math.sin(lat * A.RAD), cla = Math.cos(lat * A.RAD);
    return { ct, st, sla, cla, m: [-st, ct, 0, -sla * ct, -sla * st, cla, cla * ct, cla * st, sla] };
  }

  /** alle Richtungen neu (Sterne, Linien, Beschriftungen); billig genug für jedes Bild */
  aktualisieren(lat, lon, ms) {
    if (!this.bereit) return;
    const M = this.matrix(lat, lon, ms);
    this.M = M;
    const m = M.m;
    const dreh = (q, z) => {
      for (let k = 0; k < q.length; k += 3) {
        const x = q[k], y = q[k + 1], w = q[k + 2];
        z[k] = m[0] * x + m[1] * y;
        z[k + 1] = m[3] * x + m[4] * y + m[5] * w;
        z[k + 2] = m[6] * x + m[7] * y + m[8] * w;
      }
    };
    dreh(this.sEci, this.sENU);
    dreh(this.lEci, this.lENU);
    dreh(this.labEci, this.labENU);
  }

  /** Richtung (ENU) -> RA/Dec des Datums in Grad */
  enuZuRaDec(e, n, u) {
    const M = this.M;
    if (!M) return null;
    const p = -M.sla * n + M.cla * u, z = M.cla * n + M.sla * u;
    const x = M.ct * p - M.st * e, y = M.st * p + M.ct * e;
    let ra = Math.atan2(y, x) * A.DEG;
    if (ra < 0) ra += 360;
    return { ra, dec: Math.asin(Math.max(-1, Math.min(1, z))) * A.DEG };
  }

  /** Sternbild an einer Himmelsstelle (RA/Dec des Datums), nach den IAU-Grenzen */
  sternbildAn(raDeg, decDeg, ms = Date.now()) {
    if (!AE) return null;
    // zurück nach J2000 (Präzession rückwärts genügt hier)
    const j = A.praezession(raDeg, decDeg, 2 * 946728000000 - ms);
    try {
      const c = AE.Constellation(j.ra / 15, j.dec);
      return this.sbIndex[c.symbol] || null;
    } catch { return null; }
  }

  /** Planeten für Ort und Zeit (höchstens alle 2 s neu) */
  planetenAktualisieren(lat, lon, ms) {
    if (!AE) { astronomieLaden(); return this.planeten; }
    if (this.planeten.length && Math.abs(ms - this._planZeit) < 2000 && this._planOrt === `${lat},${lon}`) return this.planeten;
    const obs = new AE.Observer(lat, lon, 0);
    const d = new Date(ms);
    const liste = [];
    for (const p of PLANETEN) {
      try {
        const eq = AE.Equator(p.id, d, obs, true, true);
        const h = AE.Horizon(d, obs, eq.ra, eq.dec);
        const il = AE.Illumination(p.id, d);
        liste.push({ ...p, art: "planet", az: h.azimuth, el: h.altitude, ra: eq.ra * 15, dec: eq.dec, mag: il.mag, dist: eq.dist, anteil: il.phase_fraction, ring: il.ring_tilt });
      } catch (e) { /* weiter */ }
    }
    this.planeten = liste;
    this._planZeit = ms;
    this._planOrt = `${lat},${lon}`;
    return liste;
  }

  /** Mond genauer (für Infos): Entfernung, Phase, Sternbild */
  mondDetails(lat, lon, ms) {
    if (!AE) return null;
    const d = new Date(ms), obs = new AE.Observer(lat, lon, 0);
    const eq = AE.Equator("Moon", d, obs, true, true);
    const h = AE.Horizon(d, obs, eq.ra, eq.dec);
    const il = AE.Illumination("Moon", d);
    return { az: h.azimuth, el: h.altitude, ra: eq.ra * 15, dec: eq.dec, distKm: eq.dist * 149597870.7, anteil: il.phase_fraction, phase: AE.MoonPhase(d), mag: il.mag };
  }

  /** Auf- und Untergang (nächste 36 Stunden), zwischengespeichert */
  aufUnter(id, lat, lon, ms) {
    if (!AE) return null;
    const schl = `${id}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    const c = this._riseCache.get(schl);
    if (c && ms - c.zeit < 10 * 60000 && (!c.auf || c.auf > ms) && (!c.unter || c.unter > ms)) return c;
    const obs = new AE.Observer(lat, lon, 0), d = new Date(ms);
    let auf = null, unter = null;
    try { const t = AE.SearchRiseSet(id, obs, +1, d, 1.5); auf = t ? t.date.getTime() : null; } catch { /* nichts */ }
    try { const t = AE.SearchRiseSet(id, obs, -1, d, 1.5); unter = t ? t.date.getTime() : null; } catch { /* nichts */ }
    const r = { zeit: ms, auf, unter };
    this._riseCache.set(schl, r);
    return r;
  }

  /** Sternbild eines Planeten oder des Mondes (J2000-Koordinaten über astronomy-engine) */
  sternbildVon(id, lat, lon, ms) {
    if (!AE) return null;
    try {
      const eq = AE.Equator(id, new Date(ms), new AE.Observer(lat, lon, 0), false, true);
      const c = AE.Constellation(eq.ra, eq.dec);
      return this.sbIndex[c.symbol] || null;
    } catch { return null; }
  }
}

/** Richtung als ENU-Einheitsvektor aus Azimut/Höhe */
export function azElZuEnu(az, el) {
  const a = az * A.RAD, e = el * A.RAD;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}
export function enuZuAzEl(e, n, u) {
  let az = Math.atan2(e, n) * A.DEG;
  if (az < 0) az += 360;
  return { az, el: Math.asin(Math.max(-1, Math.min(1, u))) * A.DEG };
}

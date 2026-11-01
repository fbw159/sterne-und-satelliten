// Himmelskarte wie eine Karte, die vor dir auf dem Boden liegt: Mitte = Zenit, Rand = Horizont,
// Norden oben, Osten rechts. Mit Kompass dreht sich die Karte so, dass ihre Richtungen zur Wirklichkeit passen.
import * as A from "./astro.js";
import { enuZuAzEl } from "./himmelsdaten.js";
import { Etiketten } from "./etiketten.js";

export class Himmel {
  constructor(canvas, opt = {}) {
    this.c = canvas;
    this.opt = opt; // { himmel: HimmelDaten, einst: () => ({satelliten, sternbilder, planeten}), onWahl(i), onObjekt(o) }
    this.punkte = [];
    this.daten = null;
    this.drehung = 0; // Himmelsrichtung (Grad), die oben auf der Karte liegt
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 24 * 24;
      for (const p of this.punkte) {
        const d = ((p.x - x) ** 2 + (p.y - y) ** 2) / (p.gewicht || 1);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && best.i != null) { if (this.opt.onWahl) this.opt.onWahl(best.i); return; }
      if (best && best.o) { if (this.opt.onObjekt) this.opt.onObjekt(best.o); return; }
      // sonst: welches Sternbild liegt dort?
      const HD = this.opt.himmel;
      const rr = Math.hypot(x - this.cx, y - this.cy);
      if (HD && HD.bereit && rr <= this.R) {
        const el = 90 - rr / this.R * 90;
        const az = ((Math.atan2(x - this.cx, -(y - this.cy)) * A.DEG + this.drehung) % 360 + 360) % 360;
        const ae = Math.sin(az * A.RAD) * Math.cos(el * A.RAD), an = Math.cos(az * A.RAD) * Math.cos(el * A.RAD), au = Math.sin(el * A.RAD);
        const rd = HD.enuZuRaDec(ae, an, au);
        const sb = rd && HD.sternbildAn(rd.ra, rd.dec);
        if (sb && this.opt.onObjekt) this.opt.onObjekt({ art: "sternbild", k: sb.k });
      }
    });
  }

  xy(az, el) {
    const r = this.R * (90 - el) / 90;
    const a = (az - this.drehung) * A.RAD;
    return { x: this.cx + r * Math.sin(a), y: this.cy - r * Math.cos(a) };
  }
  xyEnu(e, n, u) {
    const el = Math.asin(Math.max(-1, Math.min(1, u))) * A.DEG;
    const r = this.R * (90 - el) / 90;
    const h = Math.hypot(e, n) || 1e-9;
    const c = this._cos, sn = this._sin;
    return { x: this.cx + r * (e * c - n * sn) / h, y: this.cy - r * (n * c + e * sn) / h };
  }

  zeichne(d) {
    this.daten = d || this.daten;
    d = this.daten;
    const c = this.c;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * pr) || c.height !== Math.round(h * pr)) { c.width = Math.round(w * pr); c.height = Math.round(h * pr); }
    const g = c.getContext("2d");
    g.setTransform(pr, 0, 0, pr, 0, 0);
    g.clearRect(0, 0, w, h);
    this.cx = w / 2; this.cy = h / 2; this.R = Math.min(w, h) / 2 - 22;
    this._cos = Math.cos(this.drehung * A.RAD); this._sin = Math.sin(this.drehung * A.RAD);
    const { cx, cy, R } = this;
    const sonneEl = d && d.sonne ? d.sonne.el : -90;
    const HD = this.opt.himmel;
    const einst = this.opt.einst ? this.opt.einst() : { sternbilder: true, planeten: true };
    // Hintergrund je nach Sonnenstand (am Tag gedämpftes Blau, damit die Schrift lesbar bleibt)
    const hell = Math.max(0, Math.min(1, (sonneEl + 12) / 14));
    const dunkel = Math.max(0, Math.min(1, (-sonneEl - 2) / 12));
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, mix("#050a18", "#1d4378", hell));
    grad.addColorStop(1, mix("#0e1a33", "#3f6ea6", hell));
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();
    // Raster
    g.strokeStyle = "rgba(180,200,255,0.18)"; g.lineWidth = 1;
    for (const el of [30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - el) / 90, 0, 2 * Math.PI); g.stroke(); }
    for (let az = 0; az < 360; az += 45) {
      const p = this.xy(az, 0);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(p.x, p.y); g.stroke();
    }
    this.punkte = [];
    const et = new Etiketten(g, w, h, [], { kontur: "rgba(2,6,16,0.82)" });
    if (d && HD && HD.bereit) {
      // Sternbild-Linien
      if (einst.sternbilder) {
        const L = HD.lENU, S = HD.strecken;
        g.strokeStyle = `rgba(130,165,255,${0.16 + 0.3 * dunkel})`; g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k < S.length; k += 2) {
          const a = 3 * S[k], b = 3 * S[k + 1];
          let ae = L[a], an = L[a + 1], au = L[a + 2], be = L[b], bn = L[b + 1], bu = L[b + 2];
          if (au < 0 && bu < 0) continue;
          if (au < 0 || bu < 0) {
            const t = au / (au - bu);
            const ne = ae + (be - ae) * t, nn = an + (bn - an) * t;
            if (au < 0) { ae = ne; an = nn; au = 0; } else { be = ne; bn = nn; bu = 0; }
          }
          const pa = this.xyEnu(ae, an, au), pb = this.xyEnu(be, bn, bu);
          g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
        }
        g.stroke();
      }
      // Sterne
      const grenze = sonneEl < -12 ? 5.3 : Math.max(1.5, Math.min(5.3, A.sichtGrenze(sonneEl, 6) + 0.8));
      if (sonneEl < -3) {
        const E = HD.sENU, Z = HD.sterne;
        for (let k = 0; k < Z.length; k++) {
          const m = Z[k][2];
          if (m > grenze) break;
          const u = E[3 * k + 2];
          if (u < 0) continue;
          const p = this.xyEnu(E[3 * k], E[3 * k + 1], u);
          const rr = Math.max(0.55, 2.5 - 0.42 * m);
          g.fillStyle = `rgba(255,255,255,${Math.max(0.22, Math.min(1, 1.1 - m * 0.16)) * (0.4 + 0.6 * dunkel)})`;
          g.beginPath(); g.arc(p.x, p.y, rr, 0, 2 * Math.PI); g.fill();
          if (Z[k][4] && m < 1.3) et.dazu(Z[k][4], p.x, p.y, rr + 1, "rgba(210,220,240,0.62)", "10px system-ui, sans-serif", 3 - m);
          if (m < 3.5 || Z[k][4]) this.punkte.push({ x: p.x, y: p.y, o: { art: "stern", k }, gewicht: m < 2 ? 1.2 : 0.8 });
        }
      }
      // Sternbild-Namen
      if (einst.sternbilder) {
        const E = HD.labENU;
        const f = `rgba(150,182,255,${0.3 + 0.3 * dunkel})`;
        for (let k = 0; k < HD.labSb.length; k++) {
          const sb = HD.sternbilder[HD.labSb[k]];
          if (sb.rang > 1 && R < 200) continue;
          if (sb.rang > 2) continue;
          if (E[3 * k + 2] < 0.08) continue;
          const p = this.xyEnu(E[3 * k], E[3 * k + 1], E[3 * k + 2]);
          et.dazu(sb.de.toUpperCase(), p.x, p.y, null, f, "600 9.5px system-ui, sans-serif", 0.5);
        }
      }
    }
    // Rand und Himmelsrichtungen
    g.strokeStyle = "rgba(200,215,255,0.6)"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
    g.fillStyle = "#c9d4ec"; g.font = "600 13px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [t, az] of [["N", 0], ["O", 90], ["S", 180], ["W", 270]]) {
      const p = this.xy(az, -9.5);
      g.fillStyle = t === "N" ? "#ff8a7a" : "#c9d4ec";
      g.fillText(t, p.x, p.y);
      et.sperre(p.x, p.y, 8);
    }
    g.font = "11px system-ui, sans-serif"; g.fillStyle = "rgba(200,212,236,0.7)";
    for (const [t, az] of [["NO", 45], ["SO", 135], ["SW", 225], ["NW", 315]]) { const p = this.xy(az, -8); g.fillText(t, p.x, p.y); et.sperre(p.x, p.y, 10); }
    g.fillText("30°", cx + 3, cy - R * 60 / 90 + 8);
    g.fillText("60°", cx + 3, cy - R * 30 / 90 + 8);
    if (!d) return;
    // Planeten
    if (HD && einst.planeten) {
      for (const p of HD.planeten) {
        if (p.el < 0) continue;
        const q = this.xy(p.az, p.el);
        const r = Math.max(2.4, Math.min(5.5, 4 - 0.7 * p.mag));
        g.save(); g.shadowColor = p.farbe; g.shadowBlur = 6;
        g.fillStyle = p.farbe; g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.fill();
        g.restore();
        et.sperre(q.x, q.y, r + 1);
        et.dazu(p.name, q.x, q.y, r + 1, p.farbe, "700 11px system-ui, sans-serif", 8 - p.mag * 0.1, true);
        this.punkte.push({ x: q.x, y: q.y, o: { art: "planet", id: p.id }, gewicht: 2 });
      }
    }
    // Sonne und Mond
    if (d.sonne && d.sonne.el > -1) {
      const p = this.xy(d.sonne.az, Math.max(0, d.sonne.el));
      g.fillStyle = "#ffd54a"; g.beginPath(); g.arc(p.x, p.y, 9, 0, 2 * Math.PI); g.fill();
      et.sperre(p.x, p.y, 10);
      et.dazu("Sonne", p.x, p.y, 10, "#ffe9a6", "11px system-ui, sans-serif", 9, true);
      this.punkte.push({ x: p.x, y: p.y, o: { art: "sonne" }, gewicht: 2 });
    }
    if (d.mond && d.mond.el > -1) {
      const p = this.xy(d.mond.az, Math.max(0, d.mond.el));
      let winkel = 0;
      if (d.sonne) {
        const s = this.xy(d.sonne.az, Math.max(-60, d.sonne.el));
        winkel = Math.atan2(s.y - p.y, s.x - p.x);
      }
      mondZeichnen(g, p.x, p.y, 8, d.mond.phase, winkel);
      et.sperre(p.x, p.y, 9);
      et.dazu("Mond", p.x, p.y, 9, "#e9eefa", "11px system-ui, sans-serif", 9, true);
      this.punkte.push({ x: p.x, y: p.y, o: { art: "mond" }, gewicht: 2.5 });
    }
    // Bahn des gewählten Satelliten (nächste Minuten)
    if (d.bahn && d.bahn.length) {
      g.lineWidth = 2;
      let alt = null;
      for (let k = 0; k < d.bahn.length; k += 4) {
        const sek = d.bahn[k], az = d.bahn[k + 1], el = d.bahn[k + 2], licht = d.bahn[k + 3];
        if (el < 0) { alt = null; continue; }
        const p = this.xy(az, el);
        if (alt) {
          g.strokeStyle = licht >= 0.5 ? "rgba(255,224,102,0.85)" : "rgba(150,165,200,0.6)";
          g.setLineDash(licht >= 0.5 ? [] : [4, 4]);
          g.beginPath(); g.moveTo(alt.x, alt.y); g.lineTo(p.x, p.y); g.stroke();
        }
        if (sek > 0 && Math.round(sek) % 60 === 0) {
          g.setLineDash([]);
          g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 2, 0, 2 * Math.PI); g.fill();
          if (Math.round(sek) % 120 === 0) { g.fillStyle = "rgba(230,236,250,0.8)"; g.font = "10px system-ui"; g.textAlign = "center"; g.fillText(`+${Math.round(sek / 60)}`, p.x + 10, p.y - 6); }
        }
        alt = p;
      }
      g.setLineDash([]);
    }
    // Satelliten (Namen nur für wenige, damit es lesbar bleibt)
    const liste = d.sats || [];
    const benannt = new Set(liste.filter((s) => s.sichtbar && !s.iss).sort((a, b) => (a.mag ?? 9) - (b.mag ?? 9)).slice(0, 4).map((s) => s.i));
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const s of liste) {
      const p = this.xy(s.az, s.el);
      this.punkte.push({ x: p.x, y: p.y, i: s.i, gewicht: s.iss ? 3 : s.sichtbar ? 2 : 1 });
      if (s.iss) {
        g.save(); g.translate(p.x, p.y);
        g.fillStyle = "#ffb340"; g.shadowColor = "#ffb340"; g.shadowBlur = 8;
        g.fillRect(-3, -3, 6, 6); g.fillRect(-13, -1, 26, 2); g.fillRect(-14, -6, 7, 12); g.fillRect(7, -6, 7, 12);
        g.restore();
        et.sperre(p.x, p.y, 12);
        et.dazu("ISS", p.x, p.y, 14, "#ffd28a", "700 12px system-ui, sans-serif", 10, true);
        continue;
      }
      let r = 2.2, f = "rgba(110,125,160,0.85)";
      if (s.sichtbar) { r = 4.5; f = "#ffe066"; }
      else if (s.licht) { r = 2.6; f = "rgba(225,232,255,0.95)"; }
      if (s.sichtbar) { g.shadowColor = "#ffe066"; g.shadowBlur = 10; }
      g.fillStyle = f; g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI); g.fill();
      g.shadowBlur = 0;
      if (s.sichtbar && s.name && benannt.has(s.i)) et.dazu(s.name, p.x, p.y, 5, "rgba(255,236,160,0.92)", "10.5px system-ui, sans-serif", 6);
    }
    // Auswahl (Satellit oder Objekt der Info-Karte)
    for (const a of [d.auswahl, d.objekt]) {
      if (!a) continue;
      const p = this.xy(a.az, Math.max(-2, a.el));
      g.strokeStyle = "#fff"; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, 11, 0, 2 * Math.PI); g.stroke();
      if (a.name) et.dazu(a.name, p.x, p.y, 12, "#fff", "600 12px system-ui, sans-serif", 11, true);
    }
    et.zeichne();
  }
}

/** Mond mit Phase; winkel = Richtung der hellen Seite auf dem Bildschirm (rad), rot = Rotlicht */
export function mondZeichnen(g, x, y, r, phase, winkel = 0, rot = false) {
  g.save();
  g.translate(x, y);
  g.rotate(winkel);
  g.fillStyle = rot ? "rgba(60,8,4,0.9)" : "rgba(60,66,82,0.9)";
  g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = rot ? "#ff6a50" : "#f1f0e6";
  g.beginPath();
  g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  const k = (1 - 2 * phase) * r;
  g.ellipse(0, 0, Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  g.fill();
  g.restore();
}

export { enuZuAzEl };

function mix(a, b, t) {
  const p = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

// Himmelskarte: der Himmel von unten gesehen (Mitte = Zenit, Rand = Horizont, Norden oben, Osten links)
import * as A from "./astro.js";

export class Himmel {
  constructor(canvas, opt = {}) {
    this.c = canvas;
    this.opt = opt;
    this.punkte = [];
    this.daten = null;
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 26 * 26;
      for (const p of this.punkte) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best && this.opt.onWahl) this.opt.onWahl(best.i);
    });
  }

  xy(az, el) {
    const r = this.R * (90 - el) / 90;
    const a = az * A.RAD;
    return { x: this.cx - r * Math.sin(a), y: this.cy - r * Math.cos(a) };
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
    const { cx, cy, R } = this;
    const sonneEl = d && d.sonne ? d.sonne.el : -90;
    // Hintergrund je nach Sonnenstand
    const hell = Math.max(0, Math.min(1, (sonneEl + 12) / 14));
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, mix("#050a18", "#3d6fb0", hell));
    grad.addColorStop(1, mix("#0e1a33", "#8fb6e0", hell));
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();
    // Raster
    g.strokeStyle = "rgba(180,200,255,0.22)"; g.lineWidth = 1;
    for (const el of [30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - el) / 90, 0, 2 * Math.PI); g.stroke(); }
    for (let az = 0; az < 360; az += 45) {
      const p = this.xy(az, 0);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(p.x, p.y); g.stroke();
    }
    g.strokeStyle = "rgba(200,215,255,0.6)"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
    g.fillStyle = "#c9d4ec"; g.font = "600 13px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [t, az] of [["N", 0], ["O", 90], ["S", 180], ["W", 270]]) {
      const p = this.xy(az, -9.5);
      g.fillText(t, p.x, p.y);
    }
    g.font = "11px system-ui, sans-serif"; g.fillStyle = "rgba(200,212,236,0.7)";
    for (const [t, az] of [["NO", 45], ["SO", 135], ["SW", 225], ["NW", 315]]) { const p = this.xy(az, -8); g.fillText(t, p.x, p.y); }
    g.fillText("30°", cx + 3, cy - R * 60 / 90 + 8);
    g.fillText("60°", cx + 3, cy - R * 30 / 90 + 8);
    this.punkte = [];
    if (!d) return;
    // Sterne
    if (d.sterne && sonneEl < -4) {
      for (const s of d.sterne) {
        if (s.el < 0) continue;
        const p = this.xy(s.az, s.el);
        const rr = Math.max(0.6, 2.6 - 0.45 * s.mag);
        g.fillStyle = `rgba(255,255,255,${Math.max(0.25, Math.min(1, 1.1 - s.mag * 0.17))})`;
        g.beginPath(); g.arc(p.x, p.y, rr, 0, 2 * Math.PI); g.fill();
        if (s.name && s.mag < 1.3) { g.fillStyle = "rgba(210,220,240,0.6)"; g.font = "10px system-ui"; g.fillText(s.name, p.x, p.y + 9); }
      }
    }
    // Sonne und Mond
    if (d.sonne && d.sonne.el > -1) {
      const p = this.xy(d.sonne.az, Math.max(0, d.sonne.el));
      g.fillStyle = "#ffd54a"; g.beginPath(); g.arc(p.x, p.y, 9, 0, 2 * Math.PI); g.fill();
      g.fillStyle = "#ffe9a6"; g.font = "11px system-ui"; g.fillText("Sonne", p.x, p.y + 17);
    }
    if (d.mond && d.mond.el > -1) {
      const p = this.xy(d.mond.az, Math.max(0, d.mond.el));
      mondZeichnen(g, p.x, p.y, 8, d.mond.phase);
      g.fillStyle = "#e9eefa"; g.font = "11px system-ui"; g.fillText("Mond", p.x, p.y + 16);
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
          if (Math.round(sek) % 120 === 0) { g.fillStyle = "rgba(230,236,250,0.8)"; g.font = "10px system-ui"; g.fillText(`+${Math.round(sek / 60)}`, p.x + 10, p.y - 6); }
        }
        alt = p;
      }
      g.setLineDash([]);
    }
    // Satelliten (Namen nur für wenige, damit es lesbar bleibt)
    const liste = d.sats || [];
    const benannt = new Set(liste.filter((s) => s.sichtbar && !s.iss).sort((a, b) => (a.mag ?? 9) - (b.mag ?? 9)).slice(0, 4).map((s) => s.i));
    for (const s of liste) {
      const p = this.xy(s.az, s.el);
      this.punkte.push({ x: p.x, y: p.y, i: s.i });
      if (s.iss) {
        g.save(); g.translate(p.x, p.y);
        g.fillStyle = "#ffb340"; g.shadowColor = "#ffb340"; g.shadowBlur = 8;
        g.fillRect(-3, -3, 6, 6); g.fillRect(-13, -1, 26, 2); g.fillRect(-14, -6, 7, 12); g.fillRect(7, -6, 7, 12);
        g.restore();
        g.fillStyle = "#ffd28a"; g.font = "700 12px system-ui"; g.fillText("ISS", p.x, p.y - 14);
        continue;
      }
      let r = 2.2, f = "rgba(110,125,160,0.85)";
      if (s.sichtbar) { r = 4.5; f = "#ffe066"; }
      else if (s.licht) { r = 2.6; f = "rgba(225,232,255,0.95)"; }
      if (s.sichtbar) { g.shadowColor = "#ffe066"; g.shadowBlur = 10; }
      g.fillStyle = f; g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI); g.fill();
      g.shadowBlur = 0;
      if (s.sichtbar && s.name && benannt.has(s.i)) { g.fillStyle = "rgba(255,236,160,0.9)"; g.font = "10.5px system-ui"; g.textAlign = "left"; g.fillText(s.name, p.x + 7, p.y - 6); g.textAlign = "center"; }
    }
    // Auswahl
    if (d.auswahl) {
      const p = this.xy(d.auswahl.az, Math.max(-2, d.auswahl.el));
      g.strokeStyle = "#fff"; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, 11, 0, 2 * Math.PI); g.stroke();
      g.fillStyle = "#fff"; g.font = "600 12px system-ui"; g.textAlign = "left";
      g.fillText(d.auswahl.name, p.x + 14, p.y + 12);
      g.textAlign = "center";
    }
  }
}

export function mondZeichnen(g, x, y, r, phase) {
  // phase = beleuchteter Anteil 0..1 (einfache Darstellung ohne Ausrichtung)
  g.save();
  g.fillStyle = "rgba(60,66,82,0.9)";
  g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = "#f1f0e6";
  g.beginPath();
  g.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
  const k = (1 - 2 * phase) * r;
  g.ellipse(x, y, Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  g.fill();
  g.restore();
}

function mix(a, b, t) {
  const p = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

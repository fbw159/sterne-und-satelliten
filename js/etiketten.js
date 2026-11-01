// Beschriftungen ohne Überlappung: rechts, links, unten oder oben vom Objekt – sonst weglassen
export class Etiketten {
  /** opt.kontur: dunkler Rand um die Schrift (lesbar auf hellem Himmel oder Kamerabild) */
  constructor(g, breite, hoehe, sperren = [], opt = {}) {
    this.g = g;
    this.W = breite;
    this.H = hoehe;
    this.boxen = sperren.slice();
    this.liste = [];
    this.kontur = opt.kontur || null;
  }

  /** Fläche freihalten (z. B. Planetenscheibe) */
  sperre(x, y, r) { this.boxen.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r }); }

  /** vormerken; gezeichnet wird in zeichne() nach Wichtigkeit */
  dazu(text, x, y, r, farbe, schrift, wichtig = 0, immer = false, links = false) {
    if (text) this.liste.push({ text, x, y, r, farbe, schrift, wichtig, immer, links });
  }

  _frei(b) {
    if (b.x < 2 || b.y < 2 || b.x + b.w > this.W - 2 || b.y + b.h > this.H - 2) return false;
    for (const a of this.boxen) if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    return true;
  }

  zeichne() {
    const g = this.g;
    this.liste.sort((a, b) => b.wichtig - a.wichtig);
    g.textAlign = "left";
    g.textBaseline = "middle";
    for (const e of this.liste) {
      g.font = e.schrift;
      const w = g.measureText(e.text).width, h = parseFloat(e.schrift.match(/(\d+(\.\d+)?)px/)[1]) + 2;
      const r = e.r;
      // r = null: mittig auf die Stelle (z. B. Sternbild-Namen)
      const kand = r == null ? [[e.x - w / 2, e.y - h / 2]]
        : [[e.x + r + 4, e.y - h / 2], [e.x - r - 4 - w, e.y - h / 2], [e.x - w / 2, e.y + r + 2], [e.x - w / 2, e.y - r - 2 - h]];
      if (e.links && kand.length > 1) kand.unshift(kand.splice(1, 1)[0]);
      let gesetzt = null;
      for (const [bx, by] of kand) {
        const b = { x: bx, y: by, w, h };
        if (this._frei(b)) { gesetzt = b; break; }
      }
      if (!gesetzt && e.immer) {
        const [bx, by] = kand[0];
        gesetzt = { x: Math.min(Math.max(2, bx), this.W - w - 2), y: by, w, h };
      }
      if (!gesetzt) continue;
      this.boxen.push(gesetzt);
      if (this.kontur) {
        g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = this.kontur;
        g.strokeText(e.text, gesetzt.x, gesetzt.y + h / 2);
      }
      g.fillStyle = e.farbe;
      g.fillText(e.text, gesetzt.x, gesetzt.y + h / 2);
    }
  }
}

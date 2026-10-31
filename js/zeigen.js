// Zeige-Modus: Mit den Lagesensoren des Handys zum Satelliten führen (Pfeil, Fadenkreuz, Kamerabild)
import * as THREE from "../lib/three.min.js";
import * as A from "./astro.js";
import { mondZeichnen } from "./himmel.js";
import { speicher, zahl } from "./ui.js";

const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const SICHTWINKEL = 62;  // Bildwinkel entlang der langen Bildschirmseite in Grad (ohne Kamera)
const KAMERAWINKEL = 68; // typische Hauptkamera eines Handys entlang der langen Seite

export class Zeigen {
  constructor(opt) {
    this.opt = opt;
    this.el = document.getElementById("zeigen");
    this.c = document.getElementById("zeigen-karte");
    this.video = document.getElementById("zeigen-video");
    this.q = new THREE.Quaternion();
    this.qRoh = new THREE.Quaternion();
    this.hatDaten = false;
    this.absolut = false;
    this.iosVersatz = null;
    this.deklination = 0;
    this.korrektur = speicher.lies("sus.kompassKorrektur", 0) || 0;
    this.offen = false;
    this.imZiel = false;
    this.zuletztVibriert = 0;
    this.blick = { az: 180, el: 30 }; // für die Maus (ohne Sensoren)
    this._ereignis = this._ereignis.bind(this);
    this._bild = this._bild.bind(this);
    document.getElementById("zeigen-zu").onclick = () => this.schliessen();
    document.getElementById("zeigen-kamera").onclick = () => this.kamera(!this.stream);
    document.getElementById("zeigen-mond").onclick = () => this.mondAbgleich();
    document.getElementById("zeigen-links").onclick = () => this.korrigiere(-2);
    document.getElementById("zeigen-rechts").onclick = () => this.korrigiere(2);
    this._ziehen();
  }

  /** Muss direkt im Klick aufgerufen werden (iOS fragt nur dann nach Erlaubnis) */
  erlaubnis() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function") {
      return D.requestPermission().then((r) => r === "granted").catch(() => false);
    }
    return Promise.resolve(!!D);
  }

  oeffnen(ziel) {
    this.ziel = ziel; // { name, richtung(): {az, el, licht, mag, sichtbar}, bahn: Float32Array|null }
    this.el.hidden = false;
    this.offen = true;
    this.hatDaten = false;
    this.iosVersatz = null;
    this.imZiel = false;
    document.getElementById("zeigen-name").textContent = ziel.name;
    const b = this.opt.beobachter();
    this.deklination = b ? this.opt.missweisung(b.lat, b.lon) : 0;
    this._korrekturText();
    const ereignis = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    this.ereignisName = ereignis;
    window.addEventListener(ereignis, this._ereignis, true);
    if (ereignis === "deviceorientationabsolute") window.addEventListener("deviceorientation", this._ereignis, true);
    this.wartet = setTimeout(() => { if (!this.hatDaten) this._ohneSensoren(); }, 1600);
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => (this.wach = w)).catch(() => {});
    requestAnimationFrame(this._bild);
  }

  schliessen() {
    this.offen = false;
    this.el.hidden = true;
    window.removeEventListener("deviceorientationabsolute", this._ereignis, true);
    window.removeEventListener("deviceorientation", this._ereignis, true);
    clearTimeout(this.wartet);
    this.kamera(false);
    if (this.wach) { this.wach.release().catch(() => {}); this.wach = null; }
    if (this.opt.onZu) this.opt.onZu();
  }

  setzeBahn(bahn, von) { if (this.ziel) { this.ziel.bahn = bahn; this.ziel.bahnVon = von; } }

  async kamera(an) {
    const knopf = document.getElementById("zeigen-kamera");
    if (!an) {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.video.classList.remove("an");
      this.video.srcObject = null;
      knopf.style.borderColor = "";
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.video.classList.add("an");
      knopf.style.borderColor = "#8fd0ff";
    } catch (e) {
      this.opt.melde("Die Kamera ließ sich nicht starten. Erlaubnis im Browser prüfen.");
    }
  }

  korrigiere(grad) {
    this.korrektur = wrap180(this.korrektur + grad);
    speicher.schreib("sus.kompassKorrektur", this.korrektur);
    this._korrekturText();
  }

  _korrekturText() {
    document.getElementById("zeigen-korrektur").textContent = `${this.korrektur > 0 ? "+" : ""}${Math.round(this.korrektur)}°`;
  }

  /** Mond steht im Fadenkreuz -> Kompassfehler daraus bestimmen */
  mondAbgleich() {
    const m = this.opt.mond();
    if (!m || m.el < 2) { this.opt.melde("Der Mond steht gerade nicht über dem Horizont."); return; }
    const f = this._vorne();
    if (!f) { this.opt.melde("Ohne Lagesensoren geht der Abgleich nicht."); return; }
    const hF = Math.atan2(f.x, f.y) * A.DEG;
    const elF = Math.asin(Math.max(-1, Math.min(1, f.z))) * A.DEG;
    if (Math.abs(elF - m.el) > 12) { this.opt.melde("Halte den Mond genau in die Mitte des Kreises und tippe dann noch einmal."); return; }
    this.korrigiere(wrap180(m.az - hF));
    this.opt.melde(`Kompass abgeglichen: Korrektur jetzt ${Math.round(this.korrektur)}°.`);
  }

  _ereignis(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    // Bei Chrome kommen beide Ereignisse: das relative ignorieren, wenn absolute Daten fließen
    if (e.type === "deviceorientation" && this.ereignisName === "deviceorientationabsolute" && this.absolutDa) return;
    if (e.type === "deviceorientationabsolute") this.absolutDa = true;
    let alpha = e.alpha;
    const beta = e.beta, gamma = e.gamma;
    let absolut = e.type === "deviceorientationabsolute" || e.absolute === true;
    if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS: alpha ist relativ, die Kompassrichtung kommt extra -> Versatz bestimmen.
      // Nur in einer eindeutigen Haltung (leicht bis fast aufrecht, kaum zur Seite gekippt):
      // dort zeigen Oberkante und Rückseite in dieselbe Himmelsrichtung.
      if (Math.abs(gamma) < 20 && beta > 15 && beta < 80 && (e.webkitCompassAccuracy == null || e.webkitCompassAccuracy >= 0)) {
        const d = wrap180((360 - e.webkitCompassHeading) - alpha);
        this.iosVersatz = this.iosVersatz == null ? d : this.iosVersatz + 0.08 * wrap180(d - this.iosVersatz);
      }
      if (this.iosVersatz != null) { alpha = alpha + this.iosVersatz; absolut = true; }
      this.genauigkeit = e.webkitCompassAccuracy;
    }
    this.ios = typeof e.webkitCompassHeading === "number";
    this.absolut = absolut;
    if (absolut) alpha -= this.deklination; // magnetisch -> geografisch Nord
    alpha -= this.korrektur;
    const eu = new THREE.Euler(beta * A.RAD, gamma * A.RAD, alpha * A.RAD, "ZXY");
    this.qRoh.setFromEuler(eu);
    if (!this.hatDaten) this.q.copy(this.qRoh);
    else this.q.slerp(this.qRoh, 0.22);
    this.hatDaten = true;
  }

  _ohneSensoren() {
    this.ohneSensoren = true;
    document.getElementById("zeigen-anweisung").textContent = "Keine Lagesensoren gefunden – zum Umsehen hier ziehen. Am Handy funktioniert der Zeige-Modus mit Kompass.";
  }

  _ziehen() {
    let start = null;
    this.c.addEventListener("pointerdown", (e) => { if (this.hatDaten) return; start = { x: e.clientX, y: e.clientY, az: this.blick.az, el: this.blick.el }; this.c.setPointerCapture(e.pointerId); });
    this.c.addEventListener("pointermove", (e) => {
      if (!start) return;
      const f = this.F || 600;
      this.blick.az = (start.az - (e.clientX - start.x) / f * A.DEG + 360) % 360;
      this.blick.el = Math.max(-30, Math.min(89, start.el + (e.clientY - start.y) / f * A.DEG));
    });
    this.c.addEventListener("pointerup", () => (start = null));
  }

  /** Blickrichtung (Rückseite des Handys) in Ost-Nord-Oben */
  _vorne() {
    if (this.hatDaten) return new THREE.Vector3(0, 0, -1).applyQuaternion(this.q);
    return null;
  }

  _achsen() {
    const winkel = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * A.RAD;
    if (this.hatDaten) {
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -winkel);
      const q = this.q.clone().multiply(rot);
      return {
        r: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
        u: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
        f: new THREE.Vector3(0, 0, -1).applyQuaternion(q),
      };
    }
    // ohne Sensoren: Blick per Maus/Finger
    const az = this.blick.az * A.RAD, el = this.blick.el * A.RAD;
    const f = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el));
    const r = new THREE.Vector3(Math.cos(az), -Math.sin(az), 0);
    const u = new THREE.Vector3().crossVectors(r, f);
    return { r, u, f };
  }

  _bild() {
    if (!this.offen) return;
    requestAnimationFrame(this._bild);
    const c = this.c, w = c.clientWidth, h = c.clientHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * pr) || c.height !== Math.round(h * pr)) { c.width = Math.round(w * pr); c.height = Math.round(h * pr); }
    const g = c.getContext("2d");
    g.setTransform(pr, 0, 0, pr, 0, 0);
    const cx = w / 2, cy = h / 2;
    const F = (Math.max(w, h) / 2) / Math.tan(((this.stream ? KAMERAWINKEL : SICHTWINKEL) / 2) * A.RAD);
    this.F = F;
    const ax = this._achsen();
    const proj = (az, el) => {
      const a = az * A.RAD, e = el * A.RAD;
      const d = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e));
      const z = d.dot(ax.f);
      const x = d.dot(ax.r), y = d.dot(ax.u);
      return { x: cx + F * x / Math.max(z, 1e-3), y: cy - F * y / Math.max(z, 1e-3), vorne: z > 0.02, dx: x, dy: y, z };
    };
    // Himmel
    const sonne = this.opt.sonne();
    const sonneEl = sonne ? sonne.el : -90;
    if (this.stream) g.clearRect(0, 0, w, h);
    else {
      const t = Math.max(0, Math.min(1, (sonneEl + 12) / 14));
      g.fillStyle = t > 0 ? `rgb(${Math.round(5 + 50 * t)},${Math.round(9 + 90 * t)},${Math.round(22 + 140 * t)})` : "#03060f";
      g.fillRect(0, 0, w, h);
    }
    g.save();
    let erster = true;
    // Höhenkreise
    g.lineWidth = 1;
    for (const el of [30, 60]) {
      g.strokeStyle = "rgba(170,190,240,0.25)";
      g.setLineDash([4, 6]); g.beginPath(); erster = true;
      for (let az = 0; az <= 360; az += 3) {
        const p = proj(az, el);
        if (!p.vorne) { erster = true; continue; }
        if (erster) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        erster = false;
      }
      g.stroke();
    }
    g.setLineDash([]);
    // Horizontlinie
    g.strokeStyle = "rgba(120,200,255,0.75)"; g.lineWidth = 2; g.beginPath(); erster = true;
    for (let az = 0; az <= 360; az += 2) {
      const p = proj(az, 0);
      if (!p.vorne) { erster = true; continue; }
      if (erster) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      erster = false;
    }
    g.stroke();
    g.restore();
    g.font = "700 15px system-ui"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [t, az] of [["N", 0], ["NO", 45], ["O", 90], ["SO", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]]) {
      const p = proj(az, 0);
      if (!p.vorne || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      g.fillStyle = t.length === 1 ? "#9fe0ff" : "rgba(159,224,255,0.7)";
      g.fillText(t, p.x, p.y + 14);
    }
    // Sterne
    const sterne = this.opt.sterne ? this.opt.sterne() : null;
    if (sterne && sonneEl < -5) {
      for (const s of sterne) {
        if (s.el < -2) continue;
        const p = proj(s.az, s.el);
        if (!p.vorne || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
        g.fillStyle = `rgba(255,255,255,${Math.max(0.3, Math.min(1, 1.1 - s.mag * 0.17))})`;
        g.beginPath(); g.arc(p.x, p.y, Math.max(0.7, 2.8 - 0.5 * s.mag), 0, 2 * Math.PI); g.fill();
        if (s.name && s.mag < 1.6) { g.fillStyle = "rgba(220,230,250,0.65)"; g.font = "11px system-ui"; g.fillText(s.name, p.x, p.y + 11); }
      }
    }
    // Sonne, Mond
    const mond = this.opt.mond();
    if (mond && mond.el > -3) {
      const p = proj(mond.az, mond.el);
      if (p.vorne) { mondZeichnen(g, p.x, p.y, 13, mond.phase); g.fillStyle = "#eef"; g.font = "12px system-ui"; g.fillText("Mond", p.x, p.y + 24); }
    }
    document.getElementById("zeigen-mond").disabled = !(mond && mond.el > 2 && this.hatDaten);
    if (sonne && sonne.el > -3) {
      const p = proj(sonne.az, sonne.el);
      if (p.vorne) { g.fillStyle = "#ffd54a"; g.beginPath(); g.arc(p.x, p.y, 15, 0, 2 * Math.PI); g.fill(); g.fillStyle = "#ffe9a6"; g.font = "12px system-ui"; g.fillText("Sonne – nicht hineinschauen", p.x, p.y + 26); }
    }
    // andere sichtbare Satelliten
    const andere = this.opt.andere ? this.opt.andere() : [];
    for (const s of andere) {
      const p = proj(s.az, s.el);
      if (!p.vorne) continue;
      g.fillStyle = s.sichtbar ? "rgba(255,224,102,0.9)" : "rgba(220,228,255,0.5)";
      g.beginPath(); g.arc(p.x, p.y, s.sichtbar ? 3.5 : 2, 0, 2 * Math.PI); g.fill();
    }
    // Bahn des Ziels
    const z = this.ziel;
    if (z.bahn) {
      const jetzt = Date.now();
      g.lineWidth = 2.5;
      let alt = null;
      for (let k = 0; k < z.bahn.length; k += 4) {
        const t = z.bahnVon + z.bahn[k] * 1000;
        if (t < jetzt - 30000) continue;
        if (z.bahn[k + 2] < -0.5) { alt = null; continue; }
        const p = proj(z.bahn[k + 1], z.bahn[k + 2]);
        if (!p.vorne) { alt = null; continue; }
        if (alt) {
          g.strokeStyle = z.bahn[k + 3] >= 0.5 ? "rgba(255,224,102,0.75)" : "rgba(170,185,220,0.55)";
          g.setLineDash(z.bahn[k + 3] >= 0.5 ? [] : [6, 6]);
          g.beginPath(); g.moveTo(alt.x, alt.y); g.lineTo(p.x, p.y); g.stroke();
        }
        const sek = Math.round((t - jetzt) / 1000);
        if (sek > 0 && Math.round(z.bahn[k]) % 60 === 0) {
          g.setLineDash([]);
          g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 3, 0, 2 * Math.PI); g.fill();
          g.font = "11px system-ui"; g.fillText(`${Math.round(sek / 60)} min`, p.x + 22, p.y - 8);
        }
        alt = p;
      }
      g.setLineDash([]);
    }
    // Ziel
    const r = z.richtung();
    const anw = document.getElementById("zeigen-anweisung");
    const fuss = document.getElementById("zeigen-fuss");
    if (!r) { anw.textContent = "Keine Position verfügbar."; return; }
    const p = proj(r.az, r.el);
    document.getElementById("zeigen-ziel").textContent =
      `${A.richtung(r.az)} (${Math.round(r.az)}°) · ${Math.round(r.el)}° hoch · ${r.el < 0 ? "unter dem Horizont" : r.sichtbar ? "jetzt sichtbar" : r.licht >= 0.5 ? "angestrahlt" : "im Erdschatten"}`;
    const imBild = p.vorne && p.x > 30 && p.x < w - 30 && p.y > 90 && p.y < h - 120;
    const winkel = Math.acos(Math.max(-1, Math.min(1, p.z))) * A.DEG;
    // Fadenkreuz
    const ziel = winkel < 3.5;
    g.strokeStyle = ziel ? "#5fe08a" : "rgba(255,255,255,0.85)";
    g.lineWidth = ziel ? 3.5 : 2;
    g.beginPath(); g.arc(cx, cy, 30, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx - 44, cy); g.lineTo(cx - 34, cy); g.moveTo(cx + 34, cy); g.lineTo(cx + 44, cy);
    g.moveTo(cx, cy - 44); g.lineTo(cx, cy - 34); g.moveTo(cx, cy + 34); g.lineTo(cx, cy + 44); g.stroke();
    if (p.vorne) {
      g.strokeStyle = r.sichtbar ? "#ffe066" : r.licht >= 0.5 ? "#ffffff" : "#9aa8c8";
      g.lineWidth = 3;
      g.setLineDash(r.licht >= 0.5 ? [] : [5, 5]);
      g.beginPath(); g.arc(p.x, p.y, 16, 0, 2 * Math.PI); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 3.5, 0, 2 * Math.PI); g.fill();
      g.font = "700 14px system-ui"; g.textAlign = "left";
      g.fillStyle = "#fff"; g.fillText(z.name, p.x + 22, p.y - 4);
      if (r.mag != null && r.el > 0) { g.font = "12px system-ui"; g.fillStyle = "#dfe6f5"; g.fillText(`${zahl(r.mag, 1)} mag`, p.x + 22, p.y + 13); }
      g.textAlign = "center";
    }
    if (!imBild) {
      // Pfeil am Rand in Richtung des Ziels
      let dx = p.dx, dy = -p.dy;
      if (!p.vorne && Math.hypot(dx, dy) < 1e-3) { dx = 0; dy = 1; }
      const a = Math.atan2(dy, dx);
      const rx = w / 2 - 46, ry = h / 2 - 130;
      const t = Math.min(Math.abs(rx / (Math.cos(a) || 1e-9)), Math.abs(ry / (Math.sin(a) || 1e-9)));
      const px = cx + Math.cos(a) * t, py = cy + 10 + Math.sin(a) * t;
      g.save(); g.translate(px, py); g.rotate(a);
      g.fillStyle = "#ffb340"; g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(26, 0); g.lineTo(-14, -18); g.lineTo(-6, 0); g.lineTo(-14, 18); g.closePath(); g.fill();
      g.restore();
    }
    // Anweisung in Worten
    let text;
    if (ziel) text = "Im Ziel! Genau dort ist er.";
    else if (!this.hatDaten && this.ohneSensoren) text = "Zum Umsehen ziehen";
    else {
      const f = ax.f;
      const hF = Math.atan2(f.x, f.y) * A.DEG, elF = Math.asin(Math.max(-1, Math.min(1, f.z))) * A.DEG;
      const dAz = wrap180(r.az - hF), dEl = r.el - elF;
      const teile = [];
      if (elF < 75 && r.el < 80 && Math.abs(dAz) > 4) teile.push(`${Math.round(Math.abs(dAz))}° nach ${dAz > 0 ? "rechts" : "links"}`);
      if (Math.abs(dEl) > 4) teile.push(`${Math.round(Math.abs(dEl))}° ${dEl > 0 ? "höher" : "tiefer"}`);
      text = teile.length ? "Dreh dich " + teile.join(" und ") : `Fast – noch ${Math.round(winkel)}°`;
      if (r.el < 0) text = "Steht unter dem Horizont – " + text.charAt(0).toLowerCase() + text.slice(1);
    }
    if (anw.textContent !== text) anw.textContent = text;
    anw.classList.toggle("ziel", ziel);
    if (ziel && !this.imZiel && navigator.vibrate && performance.now() - this.zuletztVibriert > 3000) { navigator.vibrate(60); this.zuletztVibriert = performance.now(); }
    this.imZiel = ziel;
    let f = "";
    if (this.hatDaten && this.ios && this.iosVersatz == null) f = "Halte das Handy kurz aufrecht vor dich, damit sich der Kompass einstellt.";
    else if (this.hatDaten && !this.absolut) f = "Kein Kompass: Richtung ist nur relativ – bitte mit dem Mond abgleichen.";
    else if (this.hatDaten && this.genauigkeit != null && (this.genauigkeit < 0 || this.genauigkeit > 25)) f = "Kompass ungenau – Handy ein paar Mal in Form einer liegenden Acht bewegen.";
    else if (this.hatDaten) f = `Missweisung ${zahl(this.deklination, 1)}° berücksichtigt. Kompass kann einige Grad danebenliegen.`;
    if (fuss.textContent !== f) fuss.textContent = f;
  }
}

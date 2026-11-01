// „Himmel live“: Handy hochhalten und den Himmel sehen – mit Kompass und Lagesensoren.
// Sterne, Sternbilder, Planeten, Mond und Satelliten; Antippen erklärt, was es ist;
// ein Ziel (Satellit, Planet, Stern …) wird mit Pfeil und Fadenkreuz gesucht.
import * as THREE from "../lib/three.min.js";
import * as A from "./astro.js";
import { mondZeichnen } from "./himmel.js";
import { PLANETEN, astronomieLaden, azElZuEnu, enuZuAzEl } from "./himmelsdaten.js";
import { infoHtml } from "./wasistdas.js";
import { speicher, zahl, esc, uhr, tag } from "./ui.js";
import { Etiketten } from "./etiketten.js";
import { suchEintraege, suchen, nieZuSehen } from "./suche.js";

const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const SICHTWINKEL = 62;  // Bildwinkel entlang der langen Bildschirmseite in Grad (ohne Kamera)
const KAMERAWINKEL = 68; // typische Hauptkamera eines Handys entlang der langen Seite

const FARBEN = {
  normal: {
    nacht: "#02050c", text: "#eef2fb", leise: "rgba(200,212,236,0.75)", horizont: "rgba(120,200,255,0.8)", gitter: "rgba(170,190,240,0.2)",
    boden: "rgba(4,8,14,0.74)", linie: "rgba(130,165,255,", sbName: "rgba(150,182,255,0.62)", sichtbar: "#ffe066", licht: "rgba(225,232,255,0.8)",
    ziel: "#ffb340", gruen: "#5fe08a", iss: "#ffb340", stern: (k) => sternFarbe(k), schatten: "rgba(0,0,0,.6)",
  },
  rot: {
    nacht: "#000000", text: "#ff5a48", leise: "rgba(255,80,64,0.7)", horizont: "rgba(255,64,48,0.75)", gitter: "rgba(255,50,40,0.16)",
    boden: "rgba(0,0,0,0.78)", linie: "rgba(255,60,45,", sbName: "rgba(255,80,64,0.55)", sichtbar: "#ff8a5a", licht: "rgba(255,95,80,0.75)",
    ziel: "#ff5a3c", gruen: "#ffa080", iss: "#ff7a50", stern: () => [255, 70, 55], schatten: "rgba(0,0,0,.8)",
  },
};

function sternFarbe(k) {
  const t = k * 100;
  if (t < 3800) return [255, 196, 150];
  if (t < 5200) return [255, 222, 180];
  if (t < 6200) return [255, 244, 225];
  if (t < 8000) return [242, 246, 255];
  return [205, 222, 255];
}

export class Zeigen {
  constructor(opt) {
    this.opt = opt;
    this.HD = opt.himmel;
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
    const e = speicher.lies("sus.himmelLive", {});
    this.einst = { satelliten: e.satelliten !== false, sternbilder: e.sternbilder !== false, planeten: e.planeten !== false, rot: !!e.rot };
    this.offen = false;
    this.imZiel = false;
    this.zuletztVibriert = 0;
    this.zoom = 1;
    this.blick = { az: 180, el: 30 }; // ohne Sensoren: Blick per Maus/Finger
    this.ziel = null;     // { art, … }
    this.gewaehlt = null; // Objekt der Info-Karte
    this.treffer = [];
    this._ereignis = this._ereignis.bind(this);
    this._bild = this._bild.bind(this);
    const $ = (id) => document.getElementById(id);
    $("zeigen-zu").onclick = () => this.schliessen();
    $("zeigen-kamera").onclick = () => this.kamera(!this.stream);
    $("zeigen-rot").onclick = () => this.setzeRot(!this.einst.rot);
    $("zeigen-satelliten").onclick = () => this._schalte("satelliten");
    $("zeigen-sternbilder").onclick = () => this._schalte("sternbilder");
    $("zeigen-planeten").onclick = () => this._schalte("planeten");
    $("zeigen-kompass").onclick = () => this._kompassFeld(!this.kompassOffen);
    $("zeigen-abgleich").onclick = () => this.abgleichen();
    $("zeigen-links").onclick = () => this.korrigiere(-2);
    $("zeigen-rechts").onclick = () => this.korrigiere(2);
    $("zeigen-ziel-weg").onclick = () => this.setzeZiel(null);
    $("zeigen-info").addEventListener("click", (ev) => this._infoKlick(ev));
    // Suche
    $("zeigen-suchen").onclick = () => (this.sucheOffen ? this.sucheSchliessen() : this.sucheOeffnen());
    $("zeigen-suche-zu").onclick = () => this.sucheSchliessen();
    $("zeigen-suchfeld").addEventListener("input", () => this._sucheZeichnen());
    $("zeigen-suchfeld").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); const t = this._sucheTreffer && this._sucheTreffer[0]; if (t) this._sucheWahl(t, true); }
      else if (ev.key === "Escape") this.sucheSchliessen();
    });
    $("zeigen-suchliste").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-such]");
      const t = b && this._sucheTreffer ? this._sucheTreffer[Number(b.dataset.such)] : null;
      if (t) this._sucheWahl(t, b.dataset.art === "hin");
    });
    $("zeigen-chips").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-chip]");
      if (b && this._chipObjekte) { const o = this._chipObjekte[Number(b.dataset.chip)]; if (o) { this.setzeZiel(o); this.gewaehlt = null; document.getElementById("zeigen-info").hidden = true; } }
    });
    this._gesten();
    this._knoepfeSetzen();
    this.setzeRot(this.einst.rot, false);
  }

  // ------------------------------------------------------------ Öffnen / Schließen
  /** Muss direkt im Klick aufgerufen werden (iOS fragt nur dann nach Erlaubnis) */
  erlaubnis() {
    const D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    // iOS fragt nach („granted“/„denied“); neuere Chrome-Versionen antworten auch „prompt“ –
    // dann einfach versuchen: kommen keine Daten, merkt das die Seite selbst
    if (typeof D.requestPermission === "function") return D.requestPermission().then((r) => r !== "denied").catch(() => true);
    return Promise.resolve(true);
  }

  /** ziel: optional { art: "sat", i } | { art: "planet", id } | { art: "mond" } | { art: "stern", k } … */
  oeffnen(ziel = null) {
    this.el.hidden = false;
    this.offen = true;
    this.hatDaten = false;
    this.ohneSensoren = false;
    document.getElementById("zeigen-kamera").hidden = false;
    document.getElementById("zeigen-kompass").hidden = false;
    this.iosVersatz = null;
    this.imZiel = false;
    this.gewaehlt = null;
    this._kompassFeld(false);
    this.sucheSchliessen();
    document.getElementById("zeigen-info").hidden = true;
    const b = this.opt.beobachter();
    this.deklination = b ? this.opt.missweisung(b.lat, b.lon) : 0;
    this._korrekturText();
    this.HD.laden().catch(() => this.opt.melde("Sterndaten ließen sich nicht laden."));
    astronomieLaden();
    this.setzeZiel(ziel);
    const ereignis = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    this.ereignisName = ereignis;
    window.addEventListener(ereignis, this._ereignis, true);
    if (ereignis === "deviceorientationabsolute") window.addEventListener("deviceorientation", this._ereignis, true);
    this.wartet = setTimeout(() => { if (!this.hatDaten) this._ohneSensoren(); }, 1600);
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => (this.wach = w)).catch(() => {});
    this._hinweisBis = performance.now() + 6000;
    if (this.opt.onAuf) this.opt.onAuf();
    this._chipZeit = 0;
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

  setzeZiel(o) {
    this.ziel = o;
    this.imZiel = false;
    this.zielBahn = null;
    document.getElementById("zeigen-ziel-weg").hidden = !o;
    document.getElementById("zeigen-anweisung").hidden = !o;
    if (o && o.art === "sat" && this.opt.satBahn) {
      const i = o.i;
      this.opt.satBahn(i).then((m) => { if (this.ziel && this.ziel.art === "sat" && this.ziel.i === i && m && m.daten) this.zielBahn = m; });
    }
    // ohne Lagesensoren (PC): den Blick gleich selbst hindrehen
    if (o && !this.hatDaten) this._dreheZu(o);
    this._titel();
  }

  /** Blick (ohne Sensoren) sanft auf ein Objekt drehen */
  _dreheZu(o) {
    const d = this._objekt(o);
    if (!d) return;
    const el = Math.max(-20, Math.min(85, d.el));
    this._blickFlug = { t0: performance.now(), dauer: 900, az0: this.blick.az, el0: this.blick.el, dAz: wrap180(d.az - this.blick.az), dEl: el - this.blick.el };
  }

  setzeRot(an, sichern = true) {
    this.einst.rot = an;
    this.el.classList.toggle("rot", an);
    document.body.classList.toggle("rotlicht", an);
    document.getElementById("zeigen-rot").setAttribute("aria-pressed", String(an));
    if (sichern) this._sichern();
    if (this.opt.onRot) this.opt.onRot(an);
  }

  _schalte(k) {
    this.einst[k] = !this.einst[k];
    this.einstellungenGeaendert();
    if (this.opt.onEinst) this.opt.onEinst();
  }
  /** nach Änderung von außen (Himmelskarte) */
  einstellungenGeaendert() {
    this._knoepfeSetzen();
    this._sichern();
    this._chipZeit = 0;
  }
  _knoepfeSetzen() {
    document.getElementById("zeigen-satelliten").setAttribute("aria-pressed", String(this.einst.satelliten));
    document.getElementById("zeigen-sternbilder").setAttribute("aria-pressed", String(this.einst.sternbilder));
    document.getElementById("zeigen-planeten").setAttribute("aria-pressed", String(this.einst.planeten));
  }
  _sichern() { speicher.schreib("sus.himmelLive", this.einst); }

  async kamera(an) {
    const knopf = document.getElementById("zeigen-kamera");
    if (!an) {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.video.classList.remove("an");
      this.video.srcObject = null;
      knopf.setAttribute("aria-pressed", "false");
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.video.classList.add("an");
      knopf.setAttribute("aria-pressed", "true");
    } catch (e) {
      this.opt.melde("Die Kamera ließ sich nicht starten. Erlaubnis im Browser prüfen.");
    }
  }

  // ------------------------------------------------------------ Kompass
  korrigiere(grad) {
    this.korrektur = wrap180(this.korrektur + grad);
    speicher.schreib("sus.kompassKorrektur", this.korrektur);
    this._korrekturText();
  }
  _korrekturText() {
    document.getElementById("zeigen-korrektur").textContent = `${this.korrektur > 0 ? "+" : ""}${Math.round(this.korrektur)}°`;
  }
  _kompassFeld(an) {
    if (an) this.sucheSchliessen();
    this.kompassOffen = an;
    document.getElementById("zeigen-kompass-feld").hidden = !an;
    document.getElementById("zeigen-kompass").setAttribute("aria-pressed", String(an));
    if (an) document.getElementById("zeigen-info").hidden = true;
  }

  /** Hellen Stern, Planeten oder Mond im Kreis in der Mitte -> Kompassfehler bestimmen */
  abgleichen() {
    const f = this._vorne();
    if (!f) { this.opt.melde("Ohne Lagesensoren geht der Abgleich nicht."); return; }
    const mitte = enuZuAzEl(f.x, f.y, f.z);
    const kandidaten = [];
    const m = this.opt.mond();
    if (m && m.el > 2) kandidaten.push({ name: "Mond", az: m.az, el: m.el });
    for (const p of this.HD.planeten) if (p.el > 2 && p.mag < 1.8) kandidaten.push({ name: p.name, az: p.az, el: p.el });
    if (this.HD.bereit) {
      for (let k = 0; k < this.HD.sterne.length; k++) {
        const z = this.HD.sterne[k];
        if (z[2] > 1.6) break;
        const e = this.HD.sENU;
        const r = enuZuAzEl(e[3 * k], e[3 * k + 1], e[3 * k + 2]);
        if (r.el > 2) kandidaten.push({ name: z[4] || z[5], az: r.az, el: r.el });
      }
    }
    let best = null, bd = 12;
    for (const k of kandidaten) {
      const d = Math.hypot(wrap180(k.az - mitte.az) * Math.cos(k.el * A.RAD), k.el - mitte.el);
      if (d < bd) { bd = d; best = k; }
    }
    if (!best) { this.opt.melde("Kein heller Stern, Planet oder Mond im Kreis. Nimm einen genau in die Mitte und tippe noch einmal."); return; }
    this.korrigiere(wrap180(best.az - mitte.az));
    this.opt.melde(`Mit ${best.name} abgeglichen: Korrektur jetzt ${Math.round(this.korrektur)}°.`);
    this._kompassFeld(false);
  }

  // ------------------------------------------------------------ Sensoren
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
    if (!this.hatDaten && this.ohneSensoren) {
      // Sensoren kamen spät: Kamera- und Kompass-Knopf doch noch zeigen
      this.ohneSensoren = false;
      document.getElementById("zeigen-kamera").hidden = false;
      document.getElementById("zeigen-kompass").hidden = false;
    }
    this.hatDaten = true;
  }

  _ohneSensoren() {
    this.ohneSensoren = true;
    // ohne Lagesensoren (PC) nützen Kamera und Kompass nichts
    document.getElementById("zeigen-kamera").hidden = true;
    document.getElementById("zeigen-kompass").hidden = true;
    this._titel();
  }

  _gesten() {
    const c = this.c;
    const zeiger = new Map();
    let start = null, pinch = null;
    const abstand = () => { const [a, b] = [...zeiger.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    c.addEventListener("pointerdown", (e) => {
      this._blickFlug = null;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zeiger.size === 1) start = { x: e.clientX, y: e.clientY, t: performance.now(), az: this.blick.az, el: this.blick.el, bewegt: false };
      else if (zeiger.size === 2) { pinch = { d: abstand(), zoom: this.zoom }; start = null; }
      try { c.setPointerCapture(e.pointerId); } catch { /* egal */ }
    });
    c.addEventListener("pointermove", (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && zeiger.size >= 2) { this.zoom = Math.max(0.6, Math.min(3, pinch.zoom * abstand() / Math.max(10, pinch.d))); return; }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.bewegt && Math.hypot(dx, dy) > 8) start.bewegt = true;
      if (start.bewegt && !this.hatDaten) {
        const f = this.F || 600;
        this.blick.az = (start.az - dx / f * A.DEG + 360) % 360;
        this.blick.el = Math.max(-30, Math.min(89, start.el + dy / f * A.DEG));
      }
    });
    const ende = (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      if (zeiger.size < 2) pinch = null;
      if (start && !start.bewegt && performance.now() - start.t < 600 && e.type === "pointerup") {
        const r = c.getBoundingClientRect();
        this._tippen(e.clientX - r.left, e.clientY - r.top, e.pointerType === "mouse" ? 18 : 30);
      }
      if (!zeiger.size) start = null;
    };
    c.addEventListener("pointerup", ende);
    c.addEventListener("pointercancel", ende);
    c.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom = Math.max(0.6, Math.min(3, this.zoom * Math.exp(-e.deltaY * 0.0015))); }, { passive: false });
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
    const az = this.blick.az * A.RAD, el = this.blick.el * A.RAD;
    const f = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el));
    const r = new THREE.Vector3(Math.cos(az), -Math.sin(az), 0);
    const u = new THREE.Vector3().crossVectors(r, f);
    return { r, u, f };
  }

  // ------------------------------------------------------------ Objekte
  /** aktuelle Richtung und Daten eines Objekts */
  _objekt(o) {
    if (!o) return null;
    const b = this.opt.beobachter();
    if (o.art === "sat") {
      const r = this.opt.satRichtung(o.i);
      return r ? { ...r, name: this.opt.satName(o.i) } : null;
    }
    if (o.art === "planet") {
      const p = this.HD.planeten.find((x) => x.id === o.id);
      return p ? { az: p.az, el: p.el, mag: p.mag, name: p.name } : null;
    }
    if (o.art === "mond") { const m = this.opt.mond(); return m ? { az: m.az, el: m.el, name: "Mond" } : null; }
    if (o.art === "sonne") { const s = this.opt.sonne(); return s ? { az: s.az, el: s.el, name: "Sonne" } : null; }
    if (o.art === "stern" && this.HD.bereit) {
      const e = this.HD.sENU, k = o.k, z = this.HD.sterne[k];
      return { ...enuZuAzEl(e[3 * k], e[3 * k + 1], e[3 * k + 2]), mag: z[2], name: z[4] || z[5] };
    }
    if (o.art === "sternbild" && this.HD.bereit) {
      const sb = this.HD.sbIndex[o.k];
      if (!sb || !b) return null;
      let k = 0;
      for (; k < this.HD.labSb.length; k++) if (this.HD.labSb[k] === sb.j) break;
      const e = this.HD.labENU;
      return { ...enuZuAzEl(e[3 * k], e[3 * k + 1], e[3 * k + 2]), name: sb.de };
    }
    return null;
  }

  _titel() {
    const name = document.getElementById("zeigen-name");
    const zeile = document.getElementById("zeigen-ziel");
    if (this.ziel) {
      const d = this._objekt(this.ziel);
      name.textContent = d ? d.name : "Ziel";
    } else {
      name.textContent = "Himmel live";
      zeile.textContent = this.ohneSensoren && !this.hatDaten
        ? "Keine Lagesensoren gefunden – zum Umsehen ziehen. Am Handy geht es mit Kompass."
        : "Handy hochhalten und umsehen · Antippen = Was ist das?";
    }
  }

  /** Antippen: was ist an dieser Stelle? */
  _tippen(x, y, radius) {
    if (this.sucheOffen) { this.sucheSchliessen(); return; }
    let best = null, bd = radius * radius;
    for (const t of this.treffer) {
      const d = ((t.x - x) ** 2 + (t.y - y) ** 2) / t.gewicht;
      if (d < bd) { bd = d; best = t.o; }
    }
    if (!best && this.HD.bereit && this._inv) {
      // kein Objekt: welches Sternbild ist dort?
      const d = this._inv(x, y);
      const rd = this.HD.enuZuRaDec(d[0], d[1], d[2]);
      const sb = rd && this.HD.sternbildAn(rd.ra, rd.dec);
      if (sb) best = { art: "sternbild", k: sb.k };
    }
    if (best) this.zeigeInfo(best);
    else { this.gewaehlt = null; document.getElementById("zeigen-info").hidden = true; }
  }

  zeigeInfo(o) {
    this.gewaehlt = o;
    this._kompassFeld(false);
    this.sucheSchliessen();
    this._infoNeu();
    document.getElementById("zeigen-info").hidden = false;
  }

  /** Richtung eines Objekts (auch für die Himmelskarte) */
  objektRichtung(o) { return this._objekt(o); }

  _infoNeu() {
    const o = this.gewaehlt;
    if (!o) return;
    const el = document.getElementById("zeigen-info");
    const daten = this.infoDaten(o);
    if (!daten) { el.hidden = true; return; }
    const html = infoHtml(daten);
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  /** Daten für die Info-Karte („Was ist das?“) */
  infoDaten(o) {
    const b = this.opt.beobachter();
    const jetzt = Date.now();
    let daten = null;
    if (o.art === "sat") daten = { art: "sat", ...this.opt.satDaten(o.i) };
    else if (o.art === "planet") {
      const p = this.HD.planeten.find((x) => x.id === o.id);
      if (p && b) daten = { art: "planet", p, sb: this.HD.sternbildVon(p.id, b.lat, b.lon, jetzt), au: this.HD.aufUnter(p.id, b.lat, b.lon, jetzt) };
    } else if (o.art === "mond" && b) {
      const m = this.HD.mondDetails(b.lat, b.lon, jetzt);
      if (m) daten = { art: "mond", m, sb: this.HD.sternbildVon("Moon", b.lat, b.lon, jetzt), au: this.HD.aufUnter("Moon", b.lat, b.lon, jetzt) };
    } else if (o.art === "sonne") {
      const s = this.opt.sonne();
      if (s) daten = { art: "sonne", az: s.az, el: s.el };
    } else if (o.art === "stern") {
      const d = this._objekt(o);
      const z = this.HD.sterne[o.k];
      if (d && z) daten = { art: "stern", z, sb: this.HD.sbIndex[z[6]], az: d.az, el: d.el };
    } else if (o.art === "sternbild") {
      const sb = this.HD.sbIndex[o.k];
      if (sb) daten = { art: "sternbild", sb, hellster: sb.hellster != null ? this.HD.sterne[sb.hellster] : null };
    }
    return daten;
  }

  _infoKlick(ev) {
    const b = ev.target.closest("[data-info]");
    if (!b) return;
    const a = b.dataset.info;
    if (a === "zu") { this.gewaehlt = null; document.getElementById("zeigen-info").hidden = true; }
    else if (a === "hin" && this.gewaehlt) { this.setzeZiel(this.gewaehlt); document.getElementById("zeigen-info").hidden = true; }
    else if (a === "steckbrief" && this.gewaehlt && this.gewaehlt.art === "sat") { const i = this.gewaehlt.i; this.schliessen(); this.opt.onSteckbrief(i); }
  }

  /** Leiste „Jetzt zu sehen“: Mond, Planeten und sichtbare Satelliten über dem Horizont */
  _chips(sats, sonneEl) {
    const grenze = A.sichtGrenze(sonneEl, this.opt.sichtGrenze ? this.opt.sichtGrenze() : 5);
    const liste = [];
    const m = this.opt.mond();
    if (m && m.el > 0) liste.push({ o: { art: "mond" }, t: "Mond", cls: "c-mond" });
    if (this.einst.planeten) {
      for (const p of [...this.HD.planeten].sort((a, b) => a.mag - b.mag)) {
        if (p.el > 1 && p.mag < Math.max(grenze, -3.5) && p.mag < 6) liste.push({ o: { art: "planet", id: p.id }, t: p.name, cls: "c-planet" });
      }
    }
    const sicht = sats.filter((s) => s.sichtbar).sort((a, b) => (b.iss - a.iss) || ((a.mag ?? 9) - (b.mag ?? 9)));
    for (const s of sicht.slice(0, 8)) liste.push({ o: { art: "sat", i: s.i }, t: s.iss ? "ISS" : s.name, cls: s.iss ? "c-iss" : "c-sat" });
    const schl = liste.map((x) => x.t).join("|");
    const el = document.getElementById("zeigen-chips");
    if (el._schl === schl) return;
    el._schl = schl;
    this._chipObjekte = liste.map((x) => x.o);
    el.innerHTML = liste.length
      ? `<span class="chips-titel">Jetzt zu sehen:</span>` + liste.map((x, k) => `<button class="chip ${x.cls}" data-chip="${k}">${esc(x.t)}</button>`).join("")
      : `<span class="chips-titel">${sonneEl > -3 ? "Bei Tageslicht ist am Himmel wenig zu sehen." : "Gerade kein Planet und kein heller Satellit über dem Horizont."}</span>`;
  }

  // ------------------------------------------------------------ Suche
  get sucheOffen() { return !document.getElementById("zeigen-suche").hidden; }

  sucheOeffnen() {
    this._kompassFeld(false);
    this.gewaehlt = null;
    document.getElementById("zeigen-info").hidden = true;
    document.getElementById("zeigen-suche").hidden = false;
    const f = document.getElementById("zeigen-suchfeld");
    f.value = "";
    this._sucheListe = null; // neu aufbauen: Daten und Satelliten können sich geändert haben
    this._sucheZeichnen();
    document.getElementById("zeigen-suchliste").scrollTop = 0;
    // am PC gleich lostippen; am Handy erst die Liste zeigen (die Tastatur ist nachts grell)
    if (!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)) f.focus();
  }

  sucheSchliessen() {
    const el = document.getElementById("zeigen-suche");
    if (!el || el.hidden) return;
    el.hidden = true;
    document.getElementById("zeigen-suchfeld").blur();
  }

  _sucheWahl(t, hin) {
    this.sucheSchliessen();
    if (hin) { this.setzeZiel(t.o); this.gewaehlt = null; document.getElementById("zeigen-info").hidden = true; }
    else this.zeigeInfo(t.o);
  }

  /** Lage eines Suchtreffers in Worten */
  _sucheWo(e) {
    const d = this._objekt(e.o);
    if (!d) return esc(e.art);
    if (d.el > 0) return `${esc(e.art)} · <b>im ${A.richtungLang(d.az)}, ${Math.round(d.el)}° hoch</b>`;
    const b = this.opt.beobachter();
    if (b && (e.o.art === "planet" || e.o.art === "mond")) {
      const au = this.HD.aufUnter(e.o.art === "mond" ? "Moon" : e.o.id, b.lat, b.lon, Date.now());
      if (au && au.auf) return `${esc(e.art)} · geht ${tag(au.auf)} um ${uhr(au.auf)} Uhr auf`;
    }
    if (b && e.dec != null && nieZuSehen(e.dec, b.lat)) return `${esc(e.art)} · von hier aus nie zu sehen`;
    return `${esc(e.art)} · gerade unter dem Horizont`;
  }

  _sucheZeichnen() {
    if (!this._sucheListe) {
      const iss = this.opt.issIdx ? this.opt.issIdx() : -1;
      const sichtbar = (this.opt.satelliten ? this.opt.satelliten() : []).filter((x) => x.sichtbar && !x.iss);
      this._sucheListe = suchEintraege(this.HD, iss, sichtbar);
      if (!this.HD.bereit) this.HD.laden().then(() => { this._sucheListe = null; if (this.sucheOffen) this._sucheZeichnen(); }).catch(() => {});
    }
    const q = document.getElementById("zeigen-suchfeld").value;
    const gefunden = suchen(this._sucheListe, q);
    let gruppen;
    if (gefunden) gruppen = [[null, gefunden]];
    else {
      // ohne Suchbegriff: alles zum Stöbern – was gerade über dem Horizont steht, zuerst
      const L = this._sucheListe;
      const oben = new Map(L.map((e) => { const d = this._objekt(e.o); return [e, d && d.el > 0 ? 1 : 0]; }));
      const mag = (e) => { if (e.o.art === "mond") return -12; const p = this.HD.planeten.find((x) => x.id === e.o.id); return p ? p.mag : (e.mag ?? 9); };
      const nachOben = (a, b) => oben.get(b) - oben.get(a);
      gruppen = [
        ["Mond und Planeten", L.filter((e) => e.gruppe === 0).sort((a, b) => nachOben(a, b) || mag(a) - mag(b))],
        ["Satelliten", L.filter((e) => e.gruppe === 1)],
        ["Sternbilder", L.filter((e) => e.gruppe === 2).sort((a, b) => nachOben(a, b) || (a.rang ?? 9) - (b.rang ?? 9) || a.name.localeCompare(b.name, "de"))],
        ["Helle Sterne", L.filter((e) => e.gruppe === 3).sort((a, b) => nachOben(a, b) || a.mag - b.mag)],
      ];
    }
    this._sucheTreffer = [];
    let html = "";
    for (const [titel, liste] of gruppen) {
      if (!liste.length) continue;
      if (titel) html += `<li class="such-gruppe">${esc(titel)}</li>`;
      for (const e of liste) {
        const k = this._sucheTreffer.push(e) - 1;
        html += `<li class="treffer"><button class="such-zeile" data-such="${k}"><span class="such-name">${esc(e.name)}${e.zusatz ? `<small>${esc(e.zusatz)}</small>` : ""}</span><span class="such-art">${this._sucheWo(e)}</span></button><button class="knopf knopf-hin" data-such="${k}" data-art="hin"><svg><use href="#i-pfeil"/></svg>Hinführen</button></li>`;
      }
    }
    if (!this._sucheTreffer.length) html = `<li class="leer">${gefunden ? "Nichts gefunden. Versuch es mit dem deutschen oder lateinischen Namen." : "Sterndaten werden geladen …"}</li>`;
    document.getElementById("zeigen-suchliste").innerHTML = html;
  }

  // ------------------------------------------------------------ Zeichnen
  _sichtwinkel() {
    return Math.max(20, Math.min(110, (this.stream ? KAMERAWINKEL : SICHTWINKEL) / this.zoom));
  }

  _bild() {
    if (!this.offen) return;
    requestAnimationFrame(this._bild);
    const t0 = performance.now();
    this._zeichnen();
    const d = performance.now() - t0;
    this.zeichenZeit = this.zeichenZeit == null ? d : this.zeichenZeit * 0.9 + d * 0.1;
  }

  _zeichnen() {
    const c = this.c, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * pr) || c.height !== Math.round(h * pr)) { c.width = Math.round(w * pr); c.height = Math.round(h * pr); }
    const g = c.getContext("2d");
    g.setTransform(pr, 0, 0, pr, 0, 0);
    const P = this.einst.rot ? FARBEN.rot : FARBEN.normal;
    const jetzt = Date.now();
    if (this._blickFlug) {
      const f = this._blickFlug;
      const k = Math.min(1, (performance.now() - f.t0) / f.dauer);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.blick.az = (f.az0 + f.dAz * e + 360) % 360;
      this.blick.el = f.el0 + f.dEl * e;
      if (k >= 1) this._blickFlug = null;
    }
    const ort = this.opt.beobachter();
    const HD = this.HD;
    if (ort && HD.bereit) HD.aktualisieren(ort.lat, ort.lon, jetzt);
    if (ort && this.einst.planeten || (ort && this.ziel && this.ziel.art === "planet")) HD.planetenAktualisieren(ort.lat, ort.lon, jetzt);
    const cx = w / 2, cy = h / 2;
    const F = (Math.max(w, h) / 2) / Math.tan((this._sichtwinkel() / 2) * A.RAD);
    this.F = F;
    const ax = this._achsen();
    const fx = ax.f.x, fy = ax.f.y, fz = ax.f.z, rx = ax.r.x, ry = ax.r.y, rz = ax.r.z, ux = ax.u.x, uy = ax.u.y, uz = ax.u.z;
    // Bildpunkt -> Richtung (für Antippen)
    this._inv = (x, y) => {
      const a = (x - cx) / F, b = -(y - cy) / F;
      const d = [fx + a * rx + b * ux, fy + a * ry + b * uy, fz + a * rz + b * uz];
      const n = Math.hypot(d[0], d[1], d[2]);
      return [d[0] / n, d[1] / n, d[2] / n];
    };
    const projE = (e, n, u) => {
      const z = e * fx + n * fy + u * fz;
      if (z < 0.02) return null;
      return { x: cx + F * (e * rx + n * ry + u * rz) / z, y: cy - F * (e * ux + n * uy + u * uz) / z, z };
    };
    const proj = (az, el) => { const v = azElZuEnu(az, el); return projE(v[0], v[1], v[2]); };
    const imBild = (p, rand = 0) => p && p.x > -rand && p.x < w + rand && p.y > -rand && p.y < h + rand;
    const cosRand = Math.cos(Math.min(89, Math.atan(Math.hypot(w, h) / 2 / F) * A.DEG + 3) * A.RAD);
    this.treffer = [];
    const treffer = (p, o, gewicht = 1) => { if (p) this.treffer.push({ x: p.x, y: p.y, o, gewicht }); };
    // Beschriftungen: nicht unter die Leisten oben und unten, nicht übereinander
    const obenH = document.querySelector(".zeigen-oben").offsetHeight || 90;
    const untenH = document.querySelector(".zeigen-unten").offsetHeight || 140;
    const seite = document.querySelector(".zeigen-seite");
    const seiteH = seite ? seite.offsetHeight : 160;
    const et = new Etiketten(g, w, h, [{ x: 0, y: 0, w, h: obenH - 18 }, { x: 0, y: h - untenH + 18, w, h: untenH }, { x: w - 66, y: obenH - 18, w: 66, h: seiteH + 30 }],
      { kontur: this.einst.rot ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.6)" });

    // Himmel
    const sonne = this.opt.sonne();
    const sonneEl = sonne ? sonne.el : -90;
    const dunkel = Math.max(0, Math.min(1, (-sonneEl - 2) / 12)); // 0 = Tag, 1 = Nacht
    if (this.stream) g.clearRect(0, 0, w, h);
    else {
      const t = this.einst.rot ? 0 : Math.max(0, Math.min(1, (sonneEl + 12) / 14));
      g.fillStyle = t > 0 ? `rgb(${Math.round(4 + 50 * t)},${Math.round(8 + 90 * t)},${Math.round(20 + 140 * t)})` : P.nacht;
      g.fillRect(0, 0, w, h);
    }
    const sternGrenze = sonneEl < -12 ? 6 : Math.max(1.6, Math.min(6, A.sichtGrenze(sonneEl, 6.5) + 1));

    // Sternbild-Linien
    if (HD.bereit && this.einst.sternbilder) {
      const L = HD.lENU, S = HD.strecken;
      g.lineWidth = 1.1;
      g.strokeStyle = P.linie + (0.18 + 0.32 * dunkel) + ")";
      g.beginPath();
      for (let k = 0; k < S.length; k += 2) {
        const a = 3 * S[k], b = 3 * S[k + 1];
        let ae = L[a], an = L[a + 1], au = L[a + 2], be = L[b], bn = L[b + 1], bu = L[b + 2];
        let za = ae * fx + an * fy + au * fz, zb = be * fx + bn * fy + bu * fz;
        if (za < 0.05 && zb < 0.05) continue;
        if (za < 0.05 || zb < 0.05) {
          // auf die Ebene knapp vor der Kamera kürzen (Gerade bleibt Gerade)
          const t = (0.05 - za) / (zb - za);
          const ne = ae + (be - ae) * t, nn = an + (bn - an) * t, nu = au + (bu - au) * t;
          if (za < 0.05) { ae = ne; an = nn; au = nu; za = 0.05; } else { be = ne; bn = nn; bu = nu; zb = 0.05; }
        }
        const pa = { x: cx + F * (ae * rx + an * ry + au * rz) / za, y: cy - F * (ae * ux + an * uy + au * uz) / za };
        const pb = { x: cx + F * (be * rx + bn * ry + bu * rz) / zb, y: cy - F * (be * ux + bn * uy + bu * uz) / zb };
        if ((pa.x < 0 && pb.x < 0) || (pa.x > w && pb.x > w) || (pa.y < 0 && pb.y < 0) || (pa.y > h && pb.y > h)) continue;
        g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
      }
      g.stroke();
    }

    // Sterne (nach Helligkeit gruppiert, damit es schnell geht)
    if (HD.bereit) {
      const E = HD.sENU, Z = HD.sterne, n = Z.length;
      const stufen = [[], [], [], [], [], []];
      const hell = [];
      for (let k = 0; k < n; k++) {
        const m = Z[k][2];
        if (m > sternGrenze) break; // nach Helligkeit sortiert
        const e = E[3 * k], nn = E[3 * k + 1], u = E[3 * k + 2];
        const z = e * fx + nn * fy + u * fz;
        if (z < cosRand) continue;
        const x = cx + F * (e * rx + nn * ry + u * rz) / z, y = cy - F * (e * ux + nn * uy + u * uz) / z;
        if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
        if (m < 1.5) hell.push([x, y, k]);
        else stufen[m < 2.5 ? 0 : m < 3.2 ? 1 : m < 3.9 ? 2 : m < 4.6 ? 3 : m < 5.3 ? 4 : 5].push(x, y);
        if (m < 4.2 || Z[k][4]) treffer({ x, y }, { art: "stern", k }, m < 2 ? 1.4 : 1);
      }
      const radien = [2.3, 1.85, 1.5, 1.2, 0.95, 0.75];
      const alpha = [0.98, 0.9, 0.78, 0.62, 0.48, 0.36].map((a) => a * (0.35 + 0.65 * dunkel));
      const sf = this.einst.rot ? [255, 70, 55] : [236, 242, 255];
      for (let s = 0; s < 6; s++) {
        const a = stufen[s];
        if (!a.length) continue;
        g.fillStyle = `rgba(${sf[0]},${sf[1]},${sf[2]},${alpha[s]})`;
        g.beginPath();
        const r = radien[s];
        for (let q = 0; q < a.length; q += 2) { g.moveTo(a[q] + r, a[q + 1]); g.arc(a[q], a[q + 1], r, 0, 2 * Math.PI); }
        g.fill();
      }
      for (const [x, y, k] of hell) {
        const z = Z[k], f = P.stern(z[3]);
        const r = Math.max(2.4, 3.6 - 0.6 * z[2]);
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
        gr.addColorStop(0, `rgba(${f[0]},${f[1]},${f[2]},0.9)`);
        gr.addColorStop(0.3, `rgba(${f[0]},${f[1]},${f[2]},0.35)`);
        gr.addColorStop(1, `rgba(${f[0]},${f[1]},${f[2]},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.2, 0, 2 * Math.PI); g.fill();
        g.fillStyle = `rgb(${f[0]},${f[1]},${f[2]})`; g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
      }
      // Namen der hellen Sterne
      const zielK = this.ziel && this.ziel.art === "stern" ? this.ziel.k : -1;
      for (const [x, y, k] of hell) { et.sperre(x, y, 3); if (Z[k][4] && k !== zielK) et.dazu(Z[k][4], x, y, 3, P.leise, "11.5px system-ui, sans-serif", 4 - Z[k][2]); }
    }

    // Sternbild-Namen
    if (HD.bereit && this.einst.sternbilder) {
      const E = HD.labENU;
      for (let k = 0; k < HD.labSb.length; k++) {
        const sb = HD.sternbilder[HD.labSb[k]];
        if (sb.rang > 2 && this.zoom < 1.4) continue;
        const p = projE(E[3 * k], E[3 * k + 1], E[3 * k + 2]);
        if (!imBild(p, -10)) continue;
        et.dazu(sb.de.toUpperCase(), p.x, p.y, null, P.sbName, "600 11.5px system-ui, sans-serif", 0.5 - sb.rang * 0.1);
        treffer(p, { art: "sternbild", k: sb.k }, 0.5);
      }
    }

    // Planeten
    if (this.einst.planeten || (this.ziel && this.ziel.art === "planet")) {
      for (const p of HD.planeten) {
        if (!this.einst.planeten && !(this.ziel && this.ziel.id === p.id)) continue;
        const q = proj(p.az, p.el);
        if (!imBild(q, 20)) continue;
        const r = Math.max(2.6, Math.min(6.5, 4.6 - 0.8 * p.mag));
        const f = this.einst.rot ? "#ff6a50" : p.farbe;
        g.save();
        g.shadowColor = f; g.shadowBlur = 10;
        g.fillStyle = f; g.beginPath(); g.arc(q.x, q.y, r, 0, 2 * Math.PI); g.fill();
        g.restore();
        if (p.id === "Saturn") { g.strokeStyle = f; g.lineWidth = 1.2; g.beginPath(); g.ellipse(q.x, q.y, r * 2.1, r * 0.7, -0.35, 0, 2 * Math.PI); g.stroke(); }
        et.sperre(q.x, q.y, p.id === "Saturn" ? r * 2 : r + 2);
        if (!(this.ziel && this.ziel.art === "planet" && this.ziel.id === p.id)) et.dazu(p.name, q.x, q.y, p.id === "Saturn" ? r * 2 : r + 2, f, "700 12.5px system-ui, sans-serif", 8 - p.mag * 0.1, p.el > 0);
        treffer(q, { art: "planet", id: p.id }, 2.2);
      }
    }

    // Mond (helle Seite zur Sonne gedreht) und Sonne
    const mond = this.opt.mond();
    if (mond && mond.el > -10) {
      const p = proj(mond.az, mond.el);
      if (imBild(p, 30)) {
        let winkel = 0;
        if (sonne) {
          // Richtung zur Sonne auf dem Bildschirm, gemessen nahe am Mond
          const m = azElZuEnu(mond.az, mond.el), s = azElZuEnu(sonne.az, sonne.el);
          const d = m[0] * s[0] + m[1] * s[1] + m[2] * s[2];
          const t = [s[0] - d * m[0], s[1] - d * m[1], s[2] - d * m[2]];
          const q = projE(m[0] + 0.02 * t[0], m[1] + 0.02 * t[1], m[2] + 0.02 * t[2]);
          if (q) winkel = Math.atan2(q.y - p.y, q.x - p.x);
        }
        const rM = Math.max(9, 0.26 * A.RAD * F); // echte Größe, aber mindestens 9 px
        mondZeichnen(g, p.x, p.y, rM, mond.phase, winkel, this.einst.rot);
        et.sperre(p.x, p.y, rM + 2);
        if (!(this.ziel && this.ziel.art === "mond")) et.dazu("Mond", p.x, p.y, rM + 2, P.text, "600 12px system-ui, sans-serif", 9, true);
        treffer(p, { art: "mond" }, 3);
      }
    }
    if (sonne && sonne.el > -10) {
      const p = proj(sonne.az, sonne.el);
      if (imBild(p, 30)) {
        g.fillStyle = this.einst.rot ? "#ff5030" : "#ffd54a"; g.beginPath(); g.arc(p.x, p.y, 15, 0, 2 * Math.PI); g.fill();
        et.sperre(p.x, p.y, 16);
        et.dazu("Sonne – nicht hineinschauen", p.x, p.y, 16, this.einst.rot ? "#ff7050" : "#ffe9a6", "12px system-ui, sans-serif", 9.5, true);
        treffer(p, { art: "sonne" }, 3);
      }
    }

    // Boden: unter dem Horizont abdunkeln
    this._boden(g, w, h, cx, cy, F, ax, P);

    // Höhenkreise und Horizont
    g.lineWidth = 1;
    for (const el of [30, 60]) {
      g.strokeStyle = P.gitter;
      g.setLineDash([4, 6]); g.beginPath();
      let erster = true;
      for (let az = 0; az <= 360; az += 3) {
        const p = proj(az, el);
        if (!p || p.z < 0.1) { erster = true; continue; }
        if (erster) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
        erster = false;
      }
      g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = P.horizont; g.lineWidth = 2; g.beginPath();
    let erster = true;
    for (let az = 0; az <= 360; az += 2) {
      const p = proj(az, 0);
      if (!p || p.z < 0.05) { erster = true; continue; }
      if (erster) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      erster = false;
    }
    g.stroke();
    g.font = "700 15px system-ui"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const [t, az] of [["N", 0], ["NO", 45], ["O", 90], ["SO", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]]) {
      const p = proj(az, 0);
      if (!imBild(p, 20)) continue;
      g.fillStyle = t.length === 1 ? P.horizont : P.leise;
      g.fillText(t, p.x, p.y + 14);
    }

    // Satelliten: sichtbare groß und gelb mit Namen, angestrahlte klein (ausgeschaltet: nur das Ziel)
    const alleSats = this.opt.satelliten ? this.opt.satelliten() : [];
    const sats = this.einst.satelliten ? alleSats : alleSats.filter((s) => this.ziel && this.ziel.art === "sat" && this.ziel.i === s.i);
    for (const s of sats) {
      const p = proj(s.az, s.el);
      if (!imBild(p, 10)) continue;
      let nachLinks = false;
      if (s.az2 != null) {
        // Flugrichtung: wo er in 10 Sekunden ist
        const q = proj(s.az2, s.el2);
        if (q) {
          nachLinks = q.x > p.x;
          const gr = g.createLinearGradient(p.x, p.y, q.x, q.y);
          const f = s.iss ? P.iss : P.sichtbar;
          gr.addColorStop(0, f); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.strokeStyle = gr; g.lineWidth = 2.5; g.globalAlpha = 0.85;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
          g.globalAlpha = 1;
        }
      }
      if (s.iss) {
        g.save(); g.translate(p.x, p.y);
        g.fillStyle = s.sichtbar ? P.iss : P.licht; g.shadowColor = P.iss; g.shadowBlur = s.sichtbar ? 10 : 0;
        g.fillRect(-3, -3, 6, 6); g.fillRect(-13, -1, 26, 2); g.fillRect(-14, -6, 7, 12); g.fillRect(7, -6, 7, 12);
        g.restore();
        et.sperre(p.x, p.y, 14);
        if (!(this.ziel && this.ziel.art === "sat" && this.ziel.i === s.i)) et.dazu("ISS", p.x, p.y, 15, P.iss, "700 12.5px system-ui, sans-serif", 10, true, nachLinks);
        treffer(p, { art: "sat", i: s.i }, 4);
        continue;
      }
      if (s.sichtbar) {
        g.save(); g.shadowColor = P.sichtbar; g.shadowBlur = 12;
        g.fillStyle = P.sichtbar; g.beginPath(); g.arc(p.x, p.y, 4.2, 0, 2 * Math.PI); g.fill();
        g.restore();
        if (!(this.ziel && this.ziel.art === "sat" && this.ziel.i === s.i)) et.dazu(s.name, p.x, p.y, 6, P.sichtbar, "600 11.5px system-ui, sans-serif", 6 - (s.mag ?? 5) * 0.1, false, nachLinks);
        treffer(p, { art: "sat", i: s.i }, 2.5);
      } else if (s.mag != null && s.mag < 7.5) {
        // angestrahlt, aber gerade nicht mit bloßem Auge (Fernglas) – klein und blass
        g.fillStyle = P.licht; g.beginPath(); g.arc(p.x, p.y, 1.6, 0, 2 * Math.PI); g.fill();
        treffer(p, { art: "sat", i: s.i }, 0.8);
      }
    }
    et.zeichne();

    // Bahn des Ziel-Satelliten
    const zb = this.ziel && this.ziel.art === "sat" ? this.zielBahn : null;
    if (zb && zb.daten) {
      g.lineWidth = 2.5;
      let alt = null;
      const B = zb.daten;
      for (let k = 0; k < B.length; k += 4) {
        const t = zb.von + B[k] * 1000;
        if (t < jetzt - 30000) continue;
        if (B[k + 2] < -0.5) { alt = null; continue; }
        const p = proj(B[k + 1], B[k + 2]);
        if (!p) { alt = null; continue; }
        if (alt) {
          g.strokeStyle = B[k + 3] >= 0.5 ? (this.einst.rot ? "rgba(255,120,90,0.7)" : "rgba(255,224,102,0.75)") : (this.einst.rot ? "rgba(255,70,50,0.45)" : "rgba(170,185,220,0.55)");
          g.setLineDash(B[k + 3] >= 0.5 ? [] : [6, 6]);
          g.beginPath(); g.moveTo(alt.x, alt.y); g.lineTo(p.x, p.y); g.stroke();
        }
        const sek = Math.round((t - jetzt) / 1000);
        if (sek > 0 && Math.round(B[k]) % 60 === 0) {
          g.setLineDash([]);
          g.fillStyle = P.text; g.beginPath(); g.arc(p.x, p.y, 3, 0, 2 * Math.PI); g.fill();
          g.font = "11px system-ui"; g.textAlign = "left"; g.fillText(`${Math.round(sek / 60)} min`, p.x + 8, p.y - 8);
        }
        alt = p;
      }
      g.setLineDash([]);
    }

    // gewähltes Objekt (Info-Karte) markieren
    if (this.gewaehlt && (!this.ziel || !gleich(this.gewaehlt, this.ziel))) {
      const d = this._objekt(this.gewaehlt);
      const p = d && proj(d.az, d.el);
      if (imBild(p, 20)) { g.strokeStyle = P.text; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.arc(p.x, p.y, 14, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); }
    }

    // Ziel mit Fadenkreuz und Pfeil
    this._zielZeichnen(g, w, h, cx, cy, proj, P, ax);

    // Leiste, Infos und Hinweise
    if (jetzt - (this._chipZeit || 0) > 1500) { this._chipZeit = jetzt; this._chips(sats, sonneEl); if (this.gewaehlt) this._infoNeu(); this._titel(); }
    const fuss = document.getElementById("zeigen-fuss");
    let f = "";
    if (this.hatDaten && this.ios && this.iosVersatz == null) f = "Halte das Handy kurz aufrecht vor dich, damit sich der Kompass einstellt.";
    else if (this.hatDaten && !this.absolut) f = "Kein Kompass: Richtung ist nur relativ – bitte über den Kompass-Knopf abgleichen.";
    else if (this.hatDaten && this.genauigkeit != null && (this.genauigkeit < 0 || this.genauigkeit > 25)) f = "Kompass ungenau – Handy ein paar Mal in Form einer liegenden Acht bewegen.";
    else if (this.kompassOffen) f = `Missweisung ${zahl(this.deklination, 1)}° ist berücksichtigt.`;
    if (fuss.textContent !== f) fuss.textContent = f;
  }

  /** dunkler Boden unter der Horizontlinie (Horizont ist im Bild eine Gerade) */
  _boden(g, w, h, cx, cy, F, ax, P) {
    // Oben-Anteil eines Bildpunkts: f.z + (x-cx)/F * r.z - (y-cy)/F * u.z  (< 0 = unter dem Horizont)
    const a = ax.r.z / F, b = -ax.u.z / F, c0 = ax.f.z - a * cx - b * cy;
    const wert = (x, y) => a * x + b * y + c0;
    const ecken = [[0, 0], [w, 0], [w, h], [0, h]];
    const poly = [];
    for (let k = 0; k < 4; k++) {
      const p = ecken[k], q = ecken[(k + 1) % 4];
      const vp = wert(p[0], p[1]), vq = wert(q[0], q[1]);
      if (vp < 0) poly.push(p);
      if ((vp < 0) !== (vq < 0)) { const t = vp / (vp - vq); poly.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    if (poly.length < 3) return;
    g.fillStyle = P.boden;
    g.beginPath(); g.moveTo(poly[0][0], poly[0][1]);
    for (let k = 1; k < poly.length; k++) g.lineTo(poly[k][0], poly[k][1]);
    g.closePath(); g.fill();
  }

  _zielZeichnen(g, w, h, cx, cy, proj, P, ax) {
    const anw = document.getElementById("zeigen-anweisung");
    const zeile = document.getElementById("zeigen-ziel");
    // kleiner Kreis in der Mitte (Abgleich, Orientierung)
    if (!this.ziel) {
      g.strokeStyle = this.kompassOffen ? P.text : P.gitter; g.lineWidth = this.kompassOffen ? 2 : 1.2;
      g.beginPath(); g.arc(cx, cy, this.kompassOffen ? 26 : 18, 0, 2 * Math.PI); g.stroke();
      return;
    }
    const z = this.ziel;
    const r = this._objekt(z);
    if (!r) { anw.textContent = "Keine Position verfügbar."; return; }
    const p = proj(r.az, r.el);
    const art = z.art === "sat" ? (r.el < 0 ? "unter dem Horizont" : r.sichtbar ? "jetzt sichtbar" : r.licht >= 0.5 ? "angestrahlt" : "im Erdschatten") : r.el < 0 ? "unter dem Horizont" : "über dem Horizont";
    const t = `${A.richtung(r.az)} (${Math.round(r.az)}°) · ${zahl(Math.round(r.el))}° hoch · ${art}`;
    if (zeile.textContent !== t) zeile.textContent = t;
    const imBild = p && p.x > 30 && p.x < w - 30 && p.y > 90 && p.y < h - 170;
    const winkel = p ? Math.acos(Math.max(-1, Math.min(1, p.z))) * A.DEG : 180;
    const ziel = winkel < 3.5;
    // Fadenkreuz
    g.strokeStyle = ziel ? P.gruen : P.text;
    g.lineWidth = ziel ? 3.5 : 2;
    g.beginPath(); g.arc(cx, cy, 30, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx - 44, cy); g.lineTo(cx - 34, cy); g.moveTo(cx + 34, cy); g.lineTo(cx + 44, cy);
    g.moveTo(cx, cy - 44); g.lineTo(cx, cy - 34); g.moveTo(cx, cy + 34); g.lineTo(cx, cy + 44); g.stroke();
    if (p) {
      g.strokeStyle = P.ziel; g.lineWidth = 3;
      g.setLineDash(z.art === "sat" && !(r.licht >= 0.5) ? [5, 5] : []);
      g.beginPath(); g.arc(p.x, p.y, 17, 0, 2 * Math.PI); g.stroke();
      g.setLineDash([]);
      g.font = "700 14px system-ui"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillStyle = P.ziel; g.fillText(r.name, p.x + 22, p.y - 5);
      if (r.mag != null && r.el > 0) { g.font = "12px system-ui"; g.fillStyle = P.leise; g.fillText(`${zahl(r.mag, 1)} mag`, p.x + 22, p.y + 11); }
    }
    if (!imBild) {
      const f0 = ax.f, d = azElZuEnu(r.az, r.el);
      let dx = d[0] * ax.r.x + d[1] * ax.r.y + d[2] * ax.r.z, dy = -(d[0] * ax.u.x + d[1] * ax.u.y + d[2] * ax.u.z);
      if (Math.hypot(dx, dy) < 1e-3) { dx = 0; dy = 1; }
      const a = Math.atan2(dy, dx);
      const rx = w / 2 - 46, ry = h / 2 - 150;
      const tt = Math.min(Math.abs(rx / (Math.cos(a) || 1e-9)), Math.abs(ry / (Math.sin(a) || 1e-9)));
      const px = cx + Math.cos(a) * tt, py = cy + Math.sin(a) * tt;
      g.save(); g.translate(px, py); g.rotate(a);
      g.fillStyle = P.ziel; g.shadowColor = P.schatten; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(26, 0); g.lineTo(-14, -18); g.lineTo(-6, 0); g.lineTo(-14, 18); g.closePath(); g.fill();
      g.restore();
      void f0;
    }
    // Anweisung in Worten
    let text;
    if (ziel) text = "Im Ziel! Genau dort.";
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
  }
}

function gleich(a, b) {
  return a && b && a.art === b.art && a.i === b.i && a.id === b.id && a.k === b.k;
}

export { PLANETEN };

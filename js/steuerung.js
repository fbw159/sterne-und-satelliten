// Kamerasteuerung für den Globus.
// Finger: einer = verschieben (mit Schwung); zwei = zoomen, drehen (Finger im Kreis) und verschieben;
//         zwei Finger nebeneinander gemeinsam nach oben/unten = neigen (Blick von der Seite).
// Maus:   ziehen = verschieben, rechte Taste (oder Strg/Umschalt) + ziehen = drehen und neigen, Rad = zoomen.
// Die Kamera schaut auf einen Punkt der Erdoberfläche (lat/lon). Kurs 0 = Norden oben,
// Neigung 0 = senkrecht von oben, Abstand = Kamera bis Blickpunkt in Erdradien.
// Verschieben ändert nur Breite und Länge des Blickpunkts: Norden bleibt, wo er war (wie bei einer Karte).
// Gesten verändern die Ziel-Pose; die angezeigte Pose folgt ihr in jedem Bild weich nach.
// So gleichen sich unregelmäßig eintreffende Fingerbewegungen aus und nichts ruckelt.
import * as THREE from "../lib/three.min.js";

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const klemme = (x, a, b) => Math.max(a, Math.min(b, x));
const GLAETTEN = 0.05; // Zeitkonstante in Sekunden, mit der die Anzeige der Geste folgt

/** Einheitsvektoren Oben/Ost/Nord am Punkt lat/lon in Szenen-Koordinaten (x = ECEF x, y = ECEF z, z = −ECEF y) */
export function basis(lat, lon, U = new THREE.Vector3(), E = new THREE.Vector3(), N = new THREE.Vector3()) {
  const la = lat * RAD, lo = lon * RAD;
  const cla = Math.cos(la), sla = Math.sin(la), clo = Math.cos(lo), slo = Math.sin(lo);
  U.set(cla * clo, sla, -cla * slo);
  E.set(-slo, 0, -clo);
  N.set(-sla * clo, cla, sla * slo);
  return { U, E, N };
}
/** Breite/Länge eines Richtungsvektors in der Szene */
export const latLonVon = (u) => ({ lat: Math.asin(klemme(u.y, -1, 1)) * DEG, lon: Math.atan2(-u.z, u.x) * DEG });

function slerp(a, b, t, w) {
  if (w < 1e-5) return a.clone().lerp(b, t).normalize();
  const s = Math.sin(w);
  return a.clone().multiplyScalar(Math.sin((1 - t) * w) / s).addScaledVector(b, Math.sin(t * w) / s);
}

export class Steuerung {
  constructor(kamera, el, opt = {}) {
    this.kamera = kamera;
    this.el = el;
    this.opt = opt; // { onStart(art), onAenderung(), folgt: () => bool }
    this.pose = { lat: 20, lon: 10, kurs: 0, neigung: 0, abstand: 14 };   // Ziel (Gesten, Flüge)
    this.anzeige = { ...this.pose };                                        // was gerade zu sehen ist
    this.minAbstand = 0.035;
    this.maxAbstand = 15;
    this.flug = null;
    this.schwung = null;   // { lat, lon } in Grad pro Sekunde
    this.zoomZiel = null;  // { abstand, x, y }
    this.aktiv = false;    // Finger oder Maus gerade unten
    this._proben = [];
    this._poseNr = 0;
    this._zkNr = -1;
    this._zuletztGeste = 0;
    this._U = new THREE.Vector3(); this._E = new THREE.Vector3(); this._N = new THREE.Vector3(); this._H = new THREE.Vector3();
    this._U2 = new THREE.Vector3(); this._E2 = new THREE.Vector3(); this._N2 = new THREE.Vector3();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._ray = new THREE.Raycaster();
    this._zk = kamera.clone(); // Kamera in der Ziel-Pose: für das Treffen von Erdpunkten
    this._rechteckAlt = null;
    const neu = () => { this._rechteckAlt = null; };
    window.addEventListener("resize", neu);
    window.addEventListener("orientationchange", neu);
    if (window.ResizeObserver) new ResizeObserver(neu).observe(el);
    this._gesten();
    this.setzePose({});
  }

  /** größte Neigung: nah dran bis 80°, weit draußen weniger */
  maxNeigung(d = this.pose.abstand) { return d <= 3 ? 80 : Math.max(45, 80 - (d - 3) * 6); }

  /** wird der Globus gerade bedient? (Finger unten, Schwung, Zoom) – dann andere Rechenarbeit zurückstellen */
  get bedient() {
    return this.aktiv || !!this.schwung || !!this.zoomZiel || performance.now() - this._zuletztGeste < 300;
  }

  /** Ziel-Pose in ihre Grenzen bringen (die Anzeige folgt im nächsten Bild) */
  anwenden() {
    const p = this.pose;
    p.abstand = klemme(p.abstand, this.minAbstand, this.maxAbstand);
    p.neigung = klemme(p.neigung, 0, this.maxNeigung(p.abstand));
    p.lat = klemme(p.lat, -90, 90);
    p.lon = wrap180(p.lon);
    p.kurs = wrap180(p.kurs);
    this._poseNr++;
  }

  /** Kamera k in die Pose p setzen */
  _setze(k, p) {
    const { U, E, N } = basis(p.lat, p.lon, this._U, this._E, this._N);
    const h = p.kurs * RAD, t = p.neigung * RAD;
    const H = this._H.copy(E).multiplyScalar(Math.sin(h)).addScaledVector(N, Math.cos(h));
    k.position.copy(U).addScaledVector(U, p.abstand * Math.cos(t)).addScaledVector(H, -p.abstand * Math.sin(t));
    k.up.copy(H).multiplyScalar(Math.cos(t)).addScaledVector(U, Math.sin(t));
    k.lookAt(U); // Blickpunkt auf der Kugel (Radius 1)
    k.updateMatrixWorld();
  }

  /** sofort hinspringen (ohne Nachführen) */
  setzePose(p) {
    Object.assign(this.pose, p);
    this.flug = null; this.schwung = null; this.zoomZiel = null;
    this.anwenden();
    Object.assign(this.anzeige, this.pose);
    this._setze(this.kamera, this.anzeige);
  }

  _rechteck() {
    if (!this._rechteckAlt || !this._rechteckAlt.width) this._rechteckAlt = this.el.getBoundingClientRect();
    return this._rechteckAlt;
  }
  _brennweite() {
    return (this._rechteck().height / 2) / Math.tan((this.kamera.fov * RAD) / 2);
  }

  /** Kamera der Ziel-Pose bereitstellen (gleiche Bildgeometrie wie die echte Kamera) */
  _zielKamera() {
    const zk = this._zk, k = this.kamera;
    zk.projectionMatrix.copy(k.projectionMatrix);
    zk.projectionMatrixInverse.copy(k.projectionMatrixInverse);
    if (this._zkNr !== this._poseNr) { this._setze(zk, this.pose); this._zkNr = this._poseNr; }
    return zk;
  }

  /** Erdpunkt (Einheitsvektor) unter einem Bildschirmpunkt (clientX/Y) in der Ziel-Pose; null = am Globus vorbei */
  treffer(x, y, out = new THREE.Vector3()) {
    const r = this._rechteck();
    if (!r.width || !r.height) return null;
    this._ray.setFromCamera({ x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 }, this._zielKamera());
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    const b = o.dot(d), c = o.lengthSq() - 1, D = b * b - c;
    if (D < 0) return null;
    const t = -b - Math.sqrt(D);
    if (t <= 0) return null;
    return out.copy(o).addScaledVector(d, t).normalize();
  }

  /** Blickpunkt um dLat/dLon verschieben (über die Pole geht es nicht hinweg; je Schritt höchstens 8°) */
  _verschiebe(dLat, dLon) {
    const p = this.pose;
    p.lat = klemme(p.lat + klemme(dLat, -8, 8), -89.5, 89.5);
    p.lon = wrap180(p.lon + klemme(wrap180(dLon), -8, 8));
  }

  /** Erdpunkt b soll dorthin, wo jetzt a ist (Norden bleibt, wo er ist); Blickpunkt höchstens um maxW (rad) */
  _anker(a, b, maxW = Infinity) {
    const la = latLonVon(a), lb = latLonVon(b);
    let dLat = la.lat - lb.lat, dLon = wrap180(la.lon - lb.lon);
    // nahe am Horizont oder Erdrand würde ein kleiner Fingerweg einen riesigen Sprung bedeuten: begrenzen
    const m = Math.hypot(dLat, dLon * Math.cos(this.pose.lat * RAD)) * RAD;
    if (m > maxW) { const f = maxW / m; dLat *= f; dLon *= f; }
    this._verschiebe(dLat, dLon);
    return { lat: dLat, lon: dLon };
  }

  /** neben der Erde: gleichmäßig um den Winkel drehen, senkrecht zur Fingerbewegung */
  _linear(dx, dy, winkel) {
    const m = this._zielKamera().matrixWorld.elements;
    const achse = new THREE.Vector3(m[0], m[1], m[2]).multiplyScalar(-dy).addScaledVector(new THREE.Vector3(m[4], m[5], m[6]), -dx).normalize();
    const q = this._q.setFromAxisAngle(achse, winkel);
    const p = this.pose;
    const ll = latLonVon(basis(p.lat, p.lon, this._U2, this._E2, this._N2).U.applyQuaternion(q));
    const d = { lat: ll.lat - p.lat, lon: wrap180(ll.lon - p.lon) };
    // über den Pol hinweg (Länge springt um ~180°): nur bis an den Pol
    if (Math.abs(d.lon) > 90) { d.lat = Math.sign(p.lat || 1) * 89.5 - p.lat; d.lon = 0; }
    this._verschiebe(d.lat, d.lon);
    return d;
  }

  /** Erdpunkt unter (x0,y0) nach (x1,y1) ziehen */
  _schiebe(x0, y0, x1, y1, merken = true) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const lin = (len * Math.min(this.pose.abstand, 4)) / this._brennweite();
    const a = this.treffer(x0, y0, this._a);
    const b = a ? this.treffer(x1, y1, this._b) : null;
    const d = a && b ? this._anker(a, b, 2.5 * lin + 1e-4) : this._linear(dx, dy, lin);
    this.anwenden();
    if (merken) this._merke(d);
  }

  // ------------------------------------------------------------ Schwung nach dem Loslassen
  _merke(d) {
    const t = performance.now();
    this._proben.push({ t, lat: d.lat, lon: d.lon });
    while (this._proben.length > 1 && t - this._proben[0].t > 100) this._proben.shift();
  }
  _schwungStart() {
    const P = this._proben;
    this._proben = [];
    if (P.length < 2 || performance.now() - P[P.length - 1].t > 90) return;
    let lat = 0, lon = 0;
    for (const p of P) { lat += p.lat; lon += p.lon; }
    const dauer = (P[P.length - 1].t - P[0].t) / 1000 + 0.016;
    const v = { lat: lat / dauer, lon: lon / dauer };
    // Geschwindigkeit in Grad Erdbogen pro Sekunde, bezogen auf den Abstand
    const tempo = Math.hypot(v.lat, v.lon * Math.cos(this.pose.lat * RAD));
    if (tempo < 3 * Math.min(1, this.pose.abstand)) return;
    const grenze = 240 * Math.min(1, this.pose.abstand / 2);
    const k = tempo > grenze ? grenze / tempo : 1;
    this.schwung = { lat: v.lat * k, lon: v.lon * k };
  }

  // ------------------------------------------------------------ Flüge
  /** sanft zu einer (Teil-)Pose fliegen; log = Abstand logarithmisch (Anflug aus dem All) */
  fliege(ziel, dauer = 1400, log = false) {
    // vom gerade Sichtbaren aus starten, damit nichts springt
    Object.assign(this.pose, this.anzeige);
    const von = { ...this.pose };
    const nach = Object.assign({ ...this.pose }, ziel);
    nach.abstand = klemme(nach.abstand, this.minAbstand, this.maxAbstand);
    nach.kurs = von.kurs + wrap180(nach.kurs - von.kurs);
    const vu = basis(von.lat, von.lon).U, nu = basis(nach.lat, nach.lon).U;
    const w = Math.acos(klemme(vu.dot(nu), -1, 1));
    // weite Wege: zwischendurch etwas höher, damit man sieht, wohin es geht
    const hop = log ? 0 : Math.max(0, w * 1.4 - Math.max(von.abstand, nach.abstand));
    this.flug = { t0: performance.now(), dauer: Math.max(1, dauer), von, nach, vu, nu, w, log, hop };
    this.schwung = null; this.zoomZiel = null;
  }
  _flugSchritt(jetzt) {
    const f = this.flug, p = this.pose;
    const k = Math.max(0, Math.min(1, (jetzt - f.t0) / f.dauer));
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const ll = latLonVon(slerp(f.vu, f.nu, e, f.w));
    p.lat = ll.lat; p.lon = ll.lon;
    p.kurs = f.von.kurs + (f.nach.kurs - f.von.kurs) * e;
    p.neigung = f.von.neigung + (f.nach.neigung - f.von.neigung) * e;
    if (f.log) p.abstand = f.von.abstand * Math.pow(f.nach.abstand / f.von.abstand, 1 - Math.pow(1 - k, 2.4));
    else p.abstand = f.von.abstand + (f.nach.abstand - f.von.abstand) * e + f.hop * Math.sin(Math.PI * e);
    if (k >= 1) this.flug = null;
  }

  /** jedes Bild: Flug, Schwung, weiches Zoomen, Anzeige nachführen. true = Kamera hat sich bewegt */
  update(jetzt = performance.now()) {
    const dt = Math.min(0.06, Math.max(0, (jetzt - (this._zuletzt ?? jetzt)) / 1000));
    this._zuletzt = jetzt;
    const imFlug = !!this.flug;
    if (this.flug) { this._flugSchritt(performance.now()); this.anwenden(); }
    else {
      if (this.schwung && !this.aktiv) {
        const s = this.schwung;
        this._verschiebe(s.lat * dt, s.lon * dt);
        const f = Math.exp(-dt / 0.3);
        s.lat *= f; s.lon *= f;
        if (Math.hypot(s.lat, s.lon) < 0.5 * Math.min(1, this.pose.abstand)) this.schwung = null;
        this.anwenden();
        this._zuletztGeste = performance.now();
      }
      if (this.zoomZiel) { this._zoomSchritt(dt); this._zuletztGeste = performance.now(); }
    }
    // angezeigte Pose folgt der Ziel-Pose weich
    const a = this.anzeige, p = this.pose;
    const ua = basis(a.lat, a.lon, this._U2, this._E2, this._N2).U;
    const up = basis(p.lat, p.lon, this._a, this._E, this._N).U;
    const w = Math.acos(klemme(ua.dot(up), -1, 1));
    const rest = w + Math.abs(wrap180(p.kurs - a.kurs)) * RAD + Math.abs(p.neigung - a.neigung) * RAD + Math.abs(Math.log(p.abstand / a.abstand));
    if (rest < 1e-7) return false;
    const k = imFlug || rest < 2e-5 ? 1 : 1 - Math.exp(-dt / GLAETTEN);
    if (k >= 1) Object.assign(a, p);
    else {
      const ll = latLonVon(slerp(ua, up, k, w));
      a.lat = ll.lat; a.lon = ll.lon;
      a.kurs = wrap180(a.kurs + wrap180(p.kurs - a.kurs) * k);
      a.neigung += (p.neigung - a.neigung) * k;
      a.abstand *= Math.pow(p.abstand / a.abstand, k);
    }
    this._setze(this.kamera, a);
    if (this.opt.onAenderung) this.opt.onAenderung();
    return true;
  }

  // ------------------------------------------------------------ Zoomen mit Mausrad (zur Maus hin)
  _rad(e) {
    e.preventDefault();
    const f = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.06 : e.deltaMode === 2 ? 0.8 : 0.0018));
    const z = this.zoomZiel || { abstand: this.pose.abstand };
    z.abstand = klemme(z.abstand * f, this.minAbstand, this.maxAbstand);
    z.x = e.clientX; z.y = e.clientY;
    this.flug = null; this.schwung = null;
    this.zoomZiel = z;
    if (this.opt.onStart) this.opt.onStart("zoom");
  }
  _zoomSchritt(dt) {
    const z = this.zoomZiel, p = this.pose;
    const rest = Math.log(z.abstand / p.abstand);
    const schritt = Math.abs(rest) < 0.003 ? rest : rest * Math.min(1, dt * 14);
    const folgt = this.opt.folgt && this.opt.folgt();
    const a = folgt ? null : this.treffer(z.x, z.y, this._a);
    p.abstand *= Math.exp(schritt);
    this.anwenden();
    if (a) { const b = this.treffer(z.x, z.y, this._b); if (b) { this._anker(a, b, 0.2); this.anwenden(); } }
    if (schritt === rest) this.zoomZiel = null;
  }

  // ------------------------------------------------------------ Gesten
  _start(art) {
    this.flug = null; this.schwung = null; this.zoomZiel = null;
    if (this.opt.onStart) this.opt.onStart(art);
  }

  _gesten() {
    const el = this.el;
    const zeiger = new Map();
    let modus = null, zwei = null;
    const geaendert = () => { this._zuletztGeste = performance.now(); if (this.opt.onAenderung) this.opt.onAenderung(); };
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    // Safari (iOS): eigene Zoom-Geste der Seite über dem Globus unterdrücken
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) el.addEventListener(t, (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY, rx: e.clientX, ry: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* egal */ }
      this.aktiv = true;
      this._proben = [];
      // Berühren hält Flug und Schwung an – genau dort, wo man gerade ist
      if (this.flug || this.schwung || this.zoomZiel) Object.assign(this.pose, this.anzeige);
      this.flug = null; this.schwung = null; this.zoomZiel = null;
      this.anwenden();
      if (zeiger.size === 1) {
        // Verschieben erst ab etwas Bewegung (sonst endet „Folgen“ schon beim Ansetzen zweier Finger)
        modus = e.pointerType === "mouse" && (e.button === 2 || e.ctrlKey || e.shiftKey || e.metaKey) ? "dreh" : "rest";
        if (modus === "dreh") this._start("dreh");
      } else if (zeiger.size === 2) {
        modus = "zwei";
        zwei = this._zweiStart(zeiger);
        this._start("zwei");
      }
    });
    el.addEventListener("pointermove", (e) => {
      const z = zeiger.get(e.pointerId);
      if (!z) return;
      const x0 = z.x, y0 = z.y;
      z.x = e.clientX; z.y = e.clientY;
      if (modus === "rest" && zeiger.size === 1) {
        // erst verschieben, wenn sich der Finger deutlich bewegt hat – dann ab dem Aufsetzpunkt
        if (Math.hypot(z.x - z.rx, z.y - z.ry) < 6) return;
        modus = "schieben";
        if (this.opt.onStart) this.opt.onStart("schieben");
        this._schiebe(z.rx, z.ry, z.x, z.y);
        geaendert();
        return;
      }
      if (modus === "schieben" && zeiger.size === 1) { this._schiebe(x0, y0, z.x, z.y); geaendert(); }
      else if (modus === "dreh" && zeiger.size === 1) {
        this.pose.kurs += (z.x - x0) * 0.3;
        this.pose.neigung -= (z.y - y0) * 0.3;
        this.anwenden(); geaendert();
      } else if (modus === "zwei" && zwei && zeiger.size >= 2) { if (this._zweiBewegt(zeiger, zwei)) geaendert(); }
    });
    const ende = (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      if (!zeiger.size) {
        if (modus === "schieben" && e.type === "pointerup") this._schwungStart();
        modus = null; zwei = null; this.aktiv = false;
        this._zuletztGeste = performance.now();
      } else if (zeiger.size === 1) {
        // mit dem übrigen Finger weiter verschieben (ohne Sprung) – aber nicht schon beim Loslassen
        const [z] = zeiger.values();
        z.rx = z.x; z.ry = z.y;
        modus = "rest"; zwei = null; this._proben = [];
      } else zwei = this._zweiStart(zeiger);
    };
    el.addEventListener("pointerup", ende);
    el.addEventListener("pointercancel", ende);
    el.addEventListener("lostpointercapture", ende);
    el.addEventListener("wheel", (e) => this._rad(e), { passive: false });
  }

  _zweiStart(zeiger) {
    const [a, b] = zeiger.values();
    return {
      a0: { x: a.x, y: a.y }, b0: { x: b.x, y: b.y },
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      d: Math.hypot(b.x - a.x, b.y - a.y), w: Math.atan2(b.y - a.y, b.x - a.x),
      art: null, dreh: 0, drehAn: false,
    };
  }

  /** zwei Finger: neigen – oder zoomen, drehen und verschieben zugleich */
  _zweiBewegt(zeiger, s) {
    const [a, b] = zeiger.values();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const d = Math.hypot(b.x - a.x, b.y - a.y), w = Math.atan2(b.y - a.y, b.x - a.x);
    if (!s.art) {
      // erst entscheiden, wenn sich die Finger merklich bewegt haben;
      // die Finger melden sich nacheinander: warten, bis sich beide bewegt haben (oder einer deutlich)
      const ax = a.x - s.a0.x, ay = a.y - s.a0.y, bx = b.x - s.b0.x, by = b.y - s.b0.y;
      const wa = Math.hypot(ax, ay), wb = Math.hypot(bx, by);
      if (Math.max(wa, wb) < 8 || (Math.min(wa, wb) < 4 && Math.max(wa, wb) < 22)) return false;
      const senkrecht = ay * by > 0 && Math.abs(ay) > 1.3 * Math.abs(ax) && Math.abs(by) > 1.3 * Math.abs(bx);
      const nebeneinander = Math.abs(s.b0.y - s.a0.y) < Math.abs(s.b0.x - s.a0.x);
      const fest = Math.abs(d - s.d) < 0.6 * Math.min(Math.abs(ay), Math.abs(by));
      s.art = senkrecht && nebeneinander && fest ? "neigen" : "frei";
    }
    if (s.art === "neigen") {
      this.pose.neigung -= (my - s.my) * 0.3;
      this.anwenden();
    } else {
      const folgt = this.opt.folgt && this.opt.folgt();
      const p0 = folgt ? null : this.treffer(s.mx, s.my, this._a);
      if (s.d > 20 && d > 20) this.pose.abstand *= s.d / d;
      // Drehen erst ab etwas Drehung, damit beim Zoomen nichts verrutscht
      const dw = wrap180((w - s.w) * DEG);
      s.dreh += dw;
      if (!s.drehAn && Math.abs(s.dreh) > 10) s.drehAn = true;
      if (s.drehAn) this.pose.kurs -= dw;
      this.anwenden();
      if (!folgt) {
        // der Erdpunkt zwischen den Fingern bleibt zwischen den Fingern
        const p1 = this.treffer(mx, my, this._b);
        if (p0 && p1) { this._anker(p0, p1, 0.2); this.anwenden(); }
        else if (!p0 && !p1) {
          const dx = mx - s.mx, dy = my - s.my, len = Math.hypot(dx, dy);
          if (len > 0.01) { this._linear(dx, dy, (len * Math.min(this.pose.abstand, 4)) / this._brennweite()); this.anwenden(); }
        }
        // nur einer der beiden Punkte auf der Erde (am Erdrand): diesmal nicht verschieben, sonst springt es
      }
    }
    s.mx = mx; s.my = my; s.d = d; s.w = w;
    return true;
  }
}

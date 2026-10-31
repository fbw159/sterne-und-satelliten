// 3D-Globus mit three.js: Erde mit Tag/Nacht, Sterne, Satelliten, Bahnen, Beschriftungen.
import * as THREE from "../lib/three.min.js";
import * as A from "./astro.js";

const { OrbitControls } = THREE;

export const KAT = {
  iss: { name: "ISS", farbe: "#ffb340" },
  station: { name: "Raumstationen & Raumschiffe", farbe: "#ff8a5c" },
  starlink: { name: "Starlink", farbe: "#8fb3ff" },
  internet: { name: "Andere Internet-Satelliten", farbe: "#5fd4c4" },
  navi: { name: "Navigation (GPS, Galileo …)", farbe: "#7ee081" },
  wetter: { name: "Wetter", farbe: "#4fc3f7" },
  erde: { name: "Erdbeobachtung", farbe: "#c5e86c" },
  wissen: { name: "Wissenschaft & Technik", farbe: "#c792ea" },
  militaer: { name: "Militär", farbe: "#ff6b6b" },
  funk: { name: "Kommunikation & Funk", farbe: "#f78fb3" },
  stufe: { name: "Raketenstufen", farbe: "#b9c1d0" },
  sonst: { name: "Sonstige", farbe: "#8c96a8" },
};

const RE = A.RE;
const GELB = new THREE.Color("#ffe066");
const WEISS = new THREE.Color("#ffffff");

const ERDE_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ERDE_FS = `
uniform sampler2D tTag; uniform sampler2D tNacht; uniform sampler2D tWasser;
uniform vec3 uSonne;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vP);
  float mu = dot(n, uSonne);
  float tag = smoothstep(-0.11, 0.10, mu);
  vec3 tagF = texture2D(tTag, vUv).rgb;
  float lichter = texture2D(tNacht, vUv).r;
  float wasser = texture2D(tWasser, vUv).r;
  vec3 hell = tagF * (0.07 + 1.1 * max(mu, 0.0));
  vec3 dunkel = vec3(1.0, 0.72, 0.40) * pow(lichter, 1.7) * 0.8 + tagF * 0.022;
  vec3 c = mix(dunkel, hell, tag);
  vec3 h = normalize(uSonne + v);
  float glanz = pow(max(dot(n, h), 0.0), 70.0) * wasser * smoothstep(0.0, 0.25, mu);
  c += vec3(1.0, 0.88, 0.7) * glanz * 0.5;
  float daemmerung = exp(-pow((mu + 0.02) / 0.045, 2.0));
  c += vec3(0.30, 0.10, 0.02) * daemmerung * 0.12;
  float rand = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  c += vec3(0.22, 0.45, 1.0) * rand * (0.08 + 0.55 * smoothstep(-0.25, 0.5, mu));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const HUELLE_VS = `
varying vec3 vNw; varying vec3 vNv;
void main() {
  vNw = normalize(mat3(modelMatrix) * normal);
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const HUELLE_FS = `
uniform vec3 uSonne;
varying vec3 vNw; varying vec3 vNv;
void main() {
  float i = pow(clamp(0.74 - dot(vNv, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.2);
  float s = smoothstep(-0.35, 0.45, dot(vNw, uSonne));
  vec3 c = vec3(0.30, 0.58, 1.0) * i * (0.18 + 1.1 * s);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const SAT_VS = `
attribute vec3 v0; attribute vec4 farbe; attribute float groesse;
uniform mat3 uMat; uniform float uDt; uniform float uPx;
varying vec4 vF;
void main() {
  vec3 p = position;
  float r = length(p);
  vec3 a = -398600.4418 * p / (r * r * r);
  vec3 q = p + v0 * uDt + 0.5 * a * uDt * uDt;
  vec4 mv = viewMatrix * vec4(uMat * q, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = groesse * uPx;
  vF = farbe;
  if (groesse <= 0.0 || r < 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const SAT_FS = `
varying vec4 vF;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float kern = 1.0 - smoothstep(0.30, 0.55, d);
  float schein = (1.0 - d) * (1.0 - d);
  float a = max(kern, schein * 0.55) * vF.a;
  gl_FragColor = vec4(vF.rgb * (0.65 + 0.35 * kern) + schein * 0.25 * vF.rgb, a);
  #include <colorspace_fragment>
}`;
const STERN_VS = `
attribute float groesse; attribute vec3 farbe;
uniform mat3 uDreh; uniform float uPx;
varying vec3 vF;
void main() {
  vec4 mv = viewMatrix * vec4(uDreh * position * 90.0, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = groesse * uPx;
  vF = farbe;
}`;
const STERN_FS = `
varying vec3 vF;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 1.6);
  gl_FragColor = vec4(vF * a, a);
  #include <colorspace_fragment>
}`;

function farbtemperatur(k) {
  // grobe Sternfarbe aus der Temperatur (in 100 K)
  const t = k * 100;
  if (t < 3800) return [1.0, 0.72, 0.52];
  if (t < 5200) return [1.0, 0.85, 0.68];
  if (t < 6200) return [1.0, 0.96, 0.88];
  if (t < 8000) return [0.95, 0.97, 1.0];
  return [0.78, 0.86, 1.0];
}

export class Globus {
  constructor(el, opt = {}) {
    this.el = el;
    this.opt = opt;
    this.n = 0;
    this.tick = null;
    this.auswahl = -1;
    this.bahnIdx = -1;
    this.folgen = false;
    this.zeigeLinien = true;
    this.zeigeNamen = true;
    this.kats = [];
    this.namen = [];
    this.filter = {};
    this.beob = null;
    this.letzteAktion = performance.now();
    this.uMat = new THREE.Matrix3();
    this.uMat4 = new THREE.Matrix4();
    this.versatz = { x: 0, y: 0 };
    this._tmp = new THREE.Vector3();

    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.pr = pr;
    const r = new THREE.WebGLRenderer({ antialias: pr < 2, powerPreference: "high-performance" });
    r.setPixelRatio(pr);
    r.setClearColor(0x05070d, 1);
    el.appendChild(r.domElement);
    this.renderer = r;

    this.szene = new THREE.Scene();
    this.kamera = new THREE.PerspectiveCamera(40, 1, 0.005, 300);
    this.kamera.position.set(0, 1.6, 4.8);

    const c = new OrbitControls(this.kamera, r.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.085;
    c.enablePan = false;
    c.minDistance = 1.07;
    c.maxDistance = 16;
    c.zoomSpeed = 0.9;
    c.rotateSpeed = 0.5;
    c.addEventListener("start", () => { this.folgen = false; this.flug = null; this.letzteAktion = performance.now(); if (this.opt.onBedienung) this.opt.onBedienung(); });
    c.addEventListener("change", () => { this.letzteAktion = performance.now(); });
    this.steuerung = c;

    this._erde();
    this._satelliten();
    this._linien();
    this._marken();
    this._tippen();

    new ResizeObserver(() => this.groesse()).observe(el);
    this.groesse();
    this._schleife = this._schleife.bind(this);
    this.laeuft = true;
    requestAnimationFrame(this._schleife);
    document.addEventListener("visibilitychange", () => {
      this.laeuft = !document.hidden;
      if (this.laeuft) requestAnimationFrame(this._schleife);
    });
  }

  // ------------------------------------------------------------ Aufbau
  _erde() {
    const lader = new THREE.TextureLoader();
    const tex = (url, srgb, fertig) => {
      const t = lader.load(url, fertig, undefined, () => this.opt.onFehler && this.opt.onFehler(`Bild ${url} nicht geladen`));
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    let geladen = 0;
    const fertig = () => { if (++geladen === 3 && this.opt.onBereit) this.opt.onBereit(); };
    this.uni = {
      tTag: { value: tex("img/erde-tag-2k.jpg", true, fertig) },
      tNacht: { value: tex("img/erde-nacht.jpg", false, fertig) },
      tWasser: { value: tex("img/erde-wasser.jpg", false, fertig) },
      uSonne: { value: new THREE.Vector3(1, 0, 0) },
    };
    const erde = new THREE.Mesh(
      new THREE.SphereGeometry(1, 160, 96),
      new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: ERDE_VS, fragmentShader: ERDE_FS }),
    );
    erde.scale.set(1, 1 - 1 / 298.257223563, 1);
    erde.renderOrder = 0;
    this.szene.add(erde);
    this.erde = erde;
    this._hoch = false;

    const huelle = new THREE.Mesh(
      new THREE.SphereGeometry(1.075, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uSonne: this.uni.uSonne }, vertexShader: HUELLE_VS, fragmentShader: HUELLE_FS,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      }),
    );
    huelle.renderOrder = 3;
    this.szene.add(huelle);

    // Sonnenschein am Himmel
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.sonnePunkt = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { uPx: { value: this.pr } },
      vertexShader: `uniform float uPx; void main(){ gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); gl_PointSize = 90.0 * uPx; }`,
      fragmentShader: `void main(){ float d = length(gl_PointCoord-0.5)*2.0; if(d>1.0) discard; float a = pow(1.0-d, 3.0); gl_FragColor = vec4(vec3(1.0,0.95,0.8)*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sonnePunkt.frustumCulled = false;
    this.szene.add(this.sonnePunkt);
  }

  _hochaufloesend() {
    if (this._hoch) return;
    this._hoch = true;
    new THREE.TextureLoader().load("img/erde-tag-4k.jpg", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const alt = this.uni.tTag.value;
      this.uni.tTag.value = t;
      alt.dispose();
    });
  }

  sterne(liste, ms) {
    const n = liste.length;
    const pos = new Float32Array(3 * n), gr = new Float32Array(n), fa = new Float32Array(3 * n);
    liste.forEach((s, k) => {
      const p = A.praezession(s[0], s[1], ms);
      const v = A.radecVektor(p.ra, p.dec);
      pos[3 * k] = v.x; pos[3 * k + 1] = v.y; pos[3 * k + 2] = v.z;
      gr[k] = Math.max(1.2, 5.2 - 0.8 * s[2]);
      const f = farbtemperatur(s[3]);
      const h = Math.min(1, Math.pow(10, -0.4 * (s[2] - 1.0)) * 0.7 + 0.25);
      fa[3 * k] = f[0] * h; fa[3 * k + 1] = f[1] * h; fa[3 * k + 2] = f[2] * h;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("groesse", new THREE.BufferAttribute(gr, 1));
    g.setAttribute("farbe", new THREE.BufferAttribute(fa, 3));
    this.sternUni = { uDreh: { value: new THREE.Matrix3() }, uPx: { value: this.pr } };
    const m = new THREE.ShaderMaterial({ uniforms: this.sternUni, vertexShader: STERN_VS, fragmentShader: STERN_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -1;
    this.szene.add(p);
  }

  _satelliten() {
    this.satGeo = new THREE.BufferGeometry();
    this.satUni = { uMat: { value: this.uMat }, uDt: { value: 0 }, uPx: { value: this.pr } };
    const m = new THREE.ShaderMaterial({ uniforms: this.satUni, vertexShader: SAT_VS, fragmentShader: SAT_FS, transparent: true, depthWrite: false });
    this.satPunkte = new THREE.Points(this.satGeo, m);
    this.satPunkte.frustumCulled = false;
    this.satPunkte.renderOrder = 2;
    this.szene.add(this.satPunkte);
  }

  _linien() {
    // Umlaufbahn (inertial, dreht mit uMat)
    this.ring = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.ring.matrixAutoUpdate = false;
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    this.szene.add(this.ring);
    // Bodenspur (erdfest)
    this.spur = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.spur.frustumCulled = false;
    this.spur.visible = false;
    this.szene.add(this.spur);
    // Sichtkreis um den Beobachter
    this.kreis = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4dd0ff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.kreis.frustumCulled = false;
    this.kreis.visible = false;
    this.szene.add(this.kreis);
    // Sichtlinien
    this.linienPos = new Float32Array(6 * 64);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(this.linienPos, 3));
    lg.setDrawRange(0, 0);
    this.sichtLinien = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.45, depthWrite: false }));
    this.sichtLinien.frustumCulled = false;
    this.szene.add(this.sichtLinien);
  }

  _marken() {
    const m = document.getElementById("marken");
    this.markenEl = m;
    const mk = (cls, html) => { const d = document.createElement("div"); d.className = "marke " + cls; d.innerHTML = html; d.style.display = "none"; m.appendChild(d); return d; };
    this.markeIch = mk("marke-ich", "<span>Du</span>");
    this.markeIss = mk("marke-iss", '<svg viewBox="0 0 40 24"><use href="#i-iss"/></svg><span>ISS</span>');
    this.markeIss.addEventListener("click", (e) => { e.stopPropagation(); if (this.issIdx >= 0 && this.opt.onWahl) this.opt.onWahl(this.issIdx); });
    this.markeWahl = mk("marke-wahl", "<span></span>");
    this.namenEl = [];
  }

  // ------------------------------------------------------------ Daten
  setzeKatalog(kats, namen, issIdx) {
    this.tick = null;
    this.kats = kats;
    this.namen = namen;
    this.issIdx = issIdx;
    this.n = kats.length;
    const n = this.n;
    this.aPos = new THREE.BufferAttribute(new Float32Array(3 * n), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(3 * n), 3);
    this.aFarbe = new THREE.BufferAttribute(new Float32Array(4 * n), 4);
    this.aGr = new THREE.BufferAttribute(new Float32Array(n), 1);
    for (const a of [this.aPos, this.aVel, this.aFarbe, this.aGr]) a.setUsage(THREE.DynamicDrawUsage);
    const g = this.satGeo;
    g.setAttribute("position", this.aPos);
    g.setAttribute("v0", this.aVel);
    g.setAttribute("farbe", this.aFarbe);
    g.setAttribute("groesse", this.aGr);
    g.setDrawRange(0, n);
    this.katFarbe = {};
    for (const [k, v] of Object.entries(KAT)) this.katFarbe[k] = new THREE.Color(v.farbe);
  }

  setzeFilter(filter) { this.filter = filter; if (this.tick) this._faerben(); }

  setzeTakt(tick) {
    if (!this.n || tick.pos.length !== 3 * this.n) return;
    this.tick = tick;
    this.aPos.array.set(tick.pos);
    this.aVel.array.set(tick.vel);
    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this._faerben();
  }

  _faerben() {
    const st = this.tick.st, n = this.n, f = this.aFarbe.array, gr = this.aGr.array;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = st[i];
      const kat = this.kats[i];
      if (!(s & 1) || (s & 64) || this.filter[kat] === false) { gr[i] = 0; continue; }
      const basis = this.katFarbe[kat] || this.katFarbe.sonst;
      let g, a;
      const oben = s & 2;
      if (s & 8) { c.copy(GELB); g = 11; a = 1; }
      else if (s & 4) { c.copy(basis).lerp(WEISS, oben ? 0.35 : 0.12); g = oben ? 5.5 : 3.2; a = oben ? 1 : 0.92; }
      else { c.copy(basis).multiplyScalar(0.45); g = oben ? 4.6 : 2.6; a = oben ? 0.9 : 0.6; }
      if (kat === "starlink" && !(s & 8)) { g *= oben ? 0.85 : 0.7; a *= oben ? 0.9 : 0.55; }
      if (i === this.auswahl) { g = Math.max(g, 8); a = 1; }
      f[4 * i] = c.r; f[4 * i + 1] = c.g; f[4 * i + 2] = c.b; f[4 * i + 3] = a;
      gr[i] = g;
    }
    this.aFarbe.needsUpdate = true;
    this.aGr.needsUpdate = true;
  }

  setzeBeobachter(lat, lon) {
    const p = A.geoZuEcef(lat, lon, 0);
    this.beob = { lat, lon, v: new THREE.Vector3(p.x / RE, p.z / RE, -p.y / RE) };
    this.kreisNeu();
  }

  setzeAuswahl(i) {
    if (i !== this.auswahl) this.folgen = false;
    this.auswahl = i;
    if (this.tick) this._faerben();
  }

  /** Wessen Bahn gezeigt wird (Auswahl oder sonst die ISS) */
  setzeBahnZiel(i) {
    if (i === this.bahnIdx) return;
    this.bahnIdx = i;
    this.ring.visible = false; this.spur.visible = false; this.kreis.visible = false;
    this.kreisHoehe = null;
  }

  setzeBahn(b) {
    if (b.i !== this.bahnIdx) return;
    const rg = this.ring.geometry;
    rg.setAttribute("position", new THREE.BufferAttribute(b.ring, 3));
    rg.computeBoundingSphere();
    const farbe = new THREE.Color((KAT[this.kats[b.i]] || KAT.sonst).farbe);
    this.ring.material.color.copy(farbe).lerp(WEISS, 0.3);
    this.ring.visible = true;
    // Bodenspur: Vergangenheit blass, Zukunft kräftig
    const n = b.spur.length / 3;
    const pos = new Float32Array(3 * n), col = new Float32Array(3 * n);
    for (let k = 0; k < n; k++) {
      const lat = b.spur[3 * k] * A.RAD, lon = b.spur[3 * k + 1] * A.RAD, dt = b.spur[3 * k + 2];
      const r = 1.004;
      pos[3 * k] = r * Math.cos(lat) * Math.cos(lon);
      pos[3 * k + 1] = r * Math.sin(lat) * (1 - 1 / 298.257);
      pos[3 * k + 2] = -r * Math.cos(lat) * Math.sin(lon);
      const h = dt < 0 ? 0.35 : 0.95;
      col[3 * k] = farbe.r * h; col[3 * k + 1] = farbe.g * h; col[3 * k + 2] = farbe.b * h;
    }
    const sg = this.spur.geometry;
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    sg.computeBoundingSphere();
    this.spur.visible = true;
    this.bahnZeit = b.t;
  }

  /** Sichtkreis: von hier aus steht ein Satellit in Höhe hKm mindestens 10° über dem Horizont */
  kreisNeu(hKm) {
    if (hKm != null) this.kreisHoehe = hKm;
    if (!this.beob || !this.kreisHoehe || !(this.bahnIdx >= 0)) { this.kreis.visible = false; return; }
    const eps = 10 * A.RAD;
    const lam = Math.acos((RE / (RE + this.kreisHoehe)) * Math.cos(eps)) - eps;
    const la0 = this.beob.lat * A.RAD, lo0 = this.beob.lon * A.RAD;
    const n = 128, pos = new Float32Array(3 * n);
    for (let k = 0; k < n; k++) {
      const az = (k / n) * 2 * Math.PI;
      const la = Math.asin(Math.sin(la0) * Math.cos(lam) + Math.cos(la0) * Math.sin(lam) * Math.cos(az));
      const lo = lo0 + Math.atan2(Math.sin(az) * Math.sin(lam) * Math.cos(la0), Math.cos(lam) - Math.sin(la0) * Math.sin(la));
      const r = 1.003;
      pos[3 * k] = r * Math.cos(la) * Math.cos(lo);
      pos[3 * k + 1] = r * Math.sin(la) * (1 - 1 / 298.257);
      pos[3 * k + 2] = -r * Math.cos(la) * Math.sin(lo);
    }
    const g = this.kreis.geometry;
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.computeBoundingSphere();
    this.kreis.visible = true;
  }

  // ------------------------------------------------------------ Kamera
  groesse() {
    const w = this.el.clientWidth || window.innerWidth, h = this.el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.kamera.aspect = w / h;
    // Hochformat: senkrechten Bildwinkel vergrößern, damit waagerecht genug zu sehen ist
    const hMin = 34 * A.RAD;
    const v = 2 * Math.atan(Math.tan(hMin / 2) / this.kamera.aspect) * A.DEG;
    this.kamera.fov = Math.min(75, Math.max(40, v));
    this._ansicht();
  }

  /** Abstand, bei dem die Erde gut ins Bild passt */
  passenderAbstand(anteil = 0.8) {
    const v = this.kamera.fov * A.RAD;
    const hz = 2 * Math.atan(Math.tan(v / 2) * this.kamera.aspect);
    const rho = anteil * Math.min(v, hz) / 2;
    return Math.min(9, Math.max(1.6, 1 / Math.sin(rho)));
  }

  /** Den Globus in die freie Fläche schieben (Blatt unten bzw. Leiste rechts) */
  setzeVersatz(x, y) {
    this.versatzZiel = { x, y };
  }

  _versatzSchritt() {
    const z = this.versatzZiel;
    if (!z) return;
    const v = this.versatz;
    const nx = v.x + (z.x - v.x) * 0.18, ny = v.y + (z.y - v.y) * 0.18;
    const fertig = Math.abs(z.x - nx) < 0.5 && Math.abs(z.y - ny) < 0.5;
    this.versatz = fertig ? { x: z.x, y: z.y } : { x: nx, y: ny };
    if (fertig) this.versatzZiel = null;
    this._ansicht();
    this.letzteAktion = performance.now();
  }

  _ansicht() {
    const w = this.el.clientWidth || window.innerWidth, h = this.el.clientHeight || window.innerHeight;
    const { x, y } = this.versatz;
    if (x || y) this.kamera.setViewOffset(w, h, x / 2, y / 2, w, h);
    else this.kamera.clearViewOffset();
    this.kamera.updateProjectionMatrix();
  }

  /** Kamera zu einer Richtung (Szenenvektor) fliegen */
  fliegeZu(richtung, abstand, dauer = 1400) {
    const start = this.kamera.position.clone();
    const ziel = richtung.clone().normalize();
    this.flug = { t0: performance.now(), dauer, von: start.clone().normalize(), nach: ziel, d0: start.length(), d1: abstand ?? start.length() };
    this.folgen = false;
  }

  zuMir(abstand) {
    if (!this.beob) return;
    if (abstand == null) abstand = this.passenderAbstand(0.8);
    // leicht von Süden schauen, damit der Himmel darüber gut zu sehen ist
    const v = this.beob.v.clone().normalize();
    const nord = new THREE.Vector3(0, 1, 0);
    const blick = v.clone().multiplyScalar(1).add(nord.clone().sub(v.clone().multiplyScalar(v.dot(nord))).multiplyScalar(-0.35));
    this.fliegeZu(blick, abstand);
  }

  starteFolgen() { if (this.auswahl >= 0) { this.folgen = true; this.flug = null; } }

  // ------------------------------------------------------------ Rechnen
  _matrix(ms) {
    const g = A.gmst(ms), c = Math.cos(g), s = Math.sin(g);
    const k = 1 / RE;
    this.uMat.set(c * k, s * k, 0, 0, 0, k, s * k, -c * k, 0);
    this.uMat4.set(c * k, s * k, 0, 0, 0, 0, k, 0, s * k, -c * k, 0, 0, 0, 0, 0, 1);
    return g;
  }

  /** Szenenposition eines Satelliten jetzt (wie im Shader) */
  satPosition(i, out = new THREE.Vector3()) {
    const t = this.tick;
    if (!t || !(t.st[i] & 1)) return null;
    const dt = this.dt;
    const p = t.pos, v = t.vel;
    const x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    const a = -A.MU / (r * r * r);
    out.set(x + v[3 * i] * dt + 0.5 * a * x * dt * dt, y + v[3 * i + 1] * dt + 0.5 * a * y * dt * dt, z + v[3 * i + 2] * dt + 0.5 * a * z * dt * dt);
    return out.applyMatrix3(this.uMat);
  }

  /** Bildschirmposition; null, wenn hinter der Erde oder hinter der Kamera */
  projiziere(v) {
    const cam = this.kamera.position;
    // verdeckt die Erde (Kugel r=1) die Sicht?
    const dx = v.x - cam.x, dy = v.y - cam.y, dz = v.z - cam.z;
    const a = dx * dx + dy * dy + dz * dz, b = 2 * (cam.x * dx + cam.y * dy + cam.z * dz), c = cam.lengthSq() - 0.993;
    const D = b * b - 4 * a * c;
    if (D > 0) {
      const t1 = (-b - Math.sqrt(D)) / (2 * a);
      if (t1 > 0 && t1 < 1) return null;
    }
    const p = this._tmp.copy(v).project(this.kamera);
    if (p.z > 1 || p.z < -1) return null;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h };
  }

  _tippen() {
    const el = this.renderer.domElement;
    let start = null;
    el.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
    el.addEventListener("pointerup", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const weg = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const dauer = performance.now() - start.t;
      start = null;
      if (weg > 8 || dauer > 600) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (this.opt.onOrtTippen && this.ortWaehlen) { this._ortAusTippen(x, y); return; }
      const i = this.finde(x, y, e.pointerType === "mouse" ? 14 : 26);
      if (this.opt.onWahl) this.opt.onWahl(i);
    });
  }

  _ortAusTippen(x, y) {
    const ray = new THREE.Raycaster();
    const w = this.el.clientWidth, h = this.el.clientHeight;
    ray.setFromCamera(new THREE.Vector2(x / w * 2 - 1, -(y / h) * 2 + 1), this.kamera);
    const hit = ray.intersectObject(this.erde)[0];
    this.ortWaehlen = false;
    if (!hit) { this.opt.onOrtTippen(null); return; }
    const p = hit.point; // Szene: x = ECEF x, y = ECEF z, z = -ECEF y (in Erdradien)
    const geo = A.ecefZuGeo(p.x * RE, -p.z * RE, p.y * RE);
    this.opt.onOrtTippen({ lat: geo.lat, lon: geo.lon });
  }

  /** Nächster sichtbarer Satellit bei Bildschirmpunkt x,y */
  finde(x, y, radius) {
    if (!this.tick) return -1;
    let best = -1, bd = radius * radius;
    const v = new THREE.Vector3();
    const gr = this.aGr.array;
    for (let i = 0; i < this.n; i++) {
      if (gr[i] <= 0) continue;
      if (!this.satPosition(i, v)) continue;
      const p = this.projiziere(v);
      if (!p) continue;
      let d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (this.tick.st[i] & 2) d *= 0.8; // über dem Horizont leicht bevorzugen
      if (i === this.issIdx) d *= 0.4;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ------------------------------------------------------------ Zeichnen
  _schleife(jetzt) {
    if (!this.laeuft) return;
    requestAnimationFrame(this._schleife);
    // Strom sparen: ohne Bedienung ~30 Bilder/s
    if (performance.now() - this.letzteAktion > 4000 && this._letztesBild && jetzt - this._letztesBild < 30) return;
    this._letztesBild = jetzt;
    const ms = Date.now();
    this._matrix(ms);
    this.dt = this.tick ? (ms - this.tick.t) / 1000 : 0;
    this.satUni.uDt.value = this.dt;
    if (this.sternUni) this.sternUni.uDreh.value.copy(this.uMat).multiplyScalar(RE);
    if (this.tick) {
      const s = this.tick.sonne;
      const v = new THREE.Vector3(s.x, s.y, s.z).applyMatrix3(this.uMat).normalize();
      this.uni.uSonne.value.copy(v);
      this.sonnePunkt.geometry.attributes.position.setXYZ(0, v.x * 80, v.y * 80, v.z * 80);
      this.sonnePunkt.geometry.attributes.position.needsUpdate = true;
    }
    this.ring.matrix.copy(this.uMat4);
    this.ring.matrixWorldNeedsUpdate = true;

    // Kameraflug und Folgen
    if (this.flug) {
      const f = this.flug;
      let k = Math.min(1, (performance.now() - f.t0) / f.dauer);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const dir = slerp(f.von, f.nach, e);
      this.kamera.position.copy(dir.multiplyScalar(f.d0 + (f.d1 - f.d0) * e));
      if (k >= 1) this.flug = null;
      this.letzteAktion = performance.now();
    } else if (this.folgen && this.auswahl >= 0) {
      const p = this.satPosition(this.auswahl, new THREE.Vector3());
      if (p) {
        const d = Math.max(this.kamera.position.length(), p.length() + 0.35);
        const ziel = p.clone().normalize();
        const jetztR = this.kamera.position.clone().normalize();
        this.kamera.position.copy(jetztR.lerp(ziel, 0.12).normalize().multiplyScalar(d));
      }
    }
    this._versatzSchritt();
    const abstand = this.kamera.position.length();
    this.steuerung.rotateSpeed = Math.min(0.55, Math.max(0.04, (abstand - 1) * 0.32));
    this.steuerung.zoomSpeed = abstand < 1.6 ? 0.5 : 0.9;
    if (abstand < 2.2) this._hochaufloesend();
    this.steuerung.update();

    this._sichtlinien();
    this.renderer.render(this.szene, this.kamera);
    this._markenSetzen();
    if (this.opt.onBild) this.opt.onBild(ms);
  }

  _sichtlinien() {
    const g = this.sichtLinien.geometry;
    if (!this.tick || !this.beob || !this.zeigeLinien) { g.setDrawRange(0, 0); return; }
    const st = this.tick.st, b = this.beob.v;
    let k = 0;
    const v = new THREE.Vector3();
    const p = this.linienPos;
    const nimm = (i) => {
      if (k >= 64 || !this.satPosition(i, v)) return;
      p.set([b.x, b.y, b.z, v.x, v.y, v.z], 6 * k);
      k++;
    };
    if (this.auswahl >= 0 && (st[this.auswahl] & 2)) nimm(this.auswahl);
    for (let i = 0; i < this.n && k < 64; i++) {
      if ((st[i] & 8) && i !== this.auswahl && !(st[i] & 64) && this.filter[this.kats[i]] !== false) nimm(i);
    }
    g.attributes.position.needsUpdate = true;
    g.setDrawRange(0, 2 * k);
  }

  _markenSetzen() {
    const setze = (el, v, an = true) => {
      const p = an && v ? this.projiziere(v) : null;
      if (!p) { if (el.style.display !== "none") el.style.display = "none"; return null; }
      if (el.style.display === "none") el.style.display = "";
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      return p;
    };
    setze(this.markeIch, this.beob ? this.beob.v.clone().multiplyScalar(1.001) : null);
    const v = new THREE.Vector3();
    setze(this.markeIss, this.issIdx >= 0 && this.tick && this.filter.iss !== false ? this.satPosition(this.issIdx, v) : null);
    const w = this.auswahl >= 0 && this.auswahl !== this.issIdx && this.tick ? this.satPosition(this.auswahl, new THREE.Vector3()) : null;
    if (setze(this.markeWahl, w) && this.markeWahl._i !== this.auswahl) {
      this.markeWahl._i = this.auswahl;
      this.markeWahl.querySelector("span").textContent = this.namen[this.auswahl] || "";
    }
    // Namen der sichtbaren Satelliten (Starlinks nur wenige, sonst wird es unlesbar)
    let k = 0, starlinks = 0;
    if (this.zeigeNamen && this.tick) {
      const st = this.tick.st;
      for (let i = 0; i < this.n && k < 16; i++) {
        if (!(st[i] & 8) || (st[i] & 64) || i === this.issIdx || i === this.auswahl || this.filter[this.kats[i]] === false) continue;
        if (this.kats[i] === "starlink" && ++starlinks > 3) continue;
        let el = this.namenEl[k];
        if (!el) { el = document.createElement("div"); el.className = "marke marke-name"; this.markenEl.appendChild(el); this.namenEl.push(el); }
        if (el._i !== i) { el._i = i; el.textContent = this.namen[i]; }
        setze(el, this.satPosition(i, v));
        k++;
      }
    }
    for (let j = k; j < this.namenEl.length; j++) if (this.namenEl[j].style.display !== "none") this.namenEl[j].style.display = "none";
  }
}

function slerp(a, b, t) {
  const d = Math.min(1, Math.max(-1, a.dot(b)));
  const w = Math.acos(d);
  if (w < 1e-4) return a.clone().lerp(b, t).normalize();
  const s = Math.sin(w);
  return a.clone().multiplyScalar(Math.sin((1 - t) * w) / s).add(b.clone().multiplyScalar(Math.sin(t * w) / s));
}

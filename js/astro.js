// Himmelsmechanik für „Satelliten über mir“: Zeit, Sonne, Mond, Koordinaten,
// Sichtbarkeit und Helligkeit. Läuft im Hauptprogramm und im Rechen-Worker.

export const RE = 6378.137;               // Äquatorradius WGS84 [km]
const F = 1 / 298.257223563;              // Abplattung WGS84
const E2 = F * (2 - F);
export const MU = 398600.4418;            // Gravitationsparameter Erde [km³/s²]
export const RAD = Math.PI / 180;
export const DEG = 180 / Math.PI;
const AU = 149597870.7;                   // [km]
const R_SONNE = 696000;                   // [km]

export const jd = (ms) => ms / 86400000 + 2440587.5;

/** Sternzeit Greenwich (IAU-82, wie satellite.js gstime) in rad */
export function gmst(ms) {
  const tut1 = (jd(ms) - 2451545.0) / 36525.0;
  let t = -6.2e-6 * tut1 ** 3 + 0.093104 * tut1 * tut1 + (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841;
  t = ((t * RAD) / 240.0) % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

/** Sonne: Einheitsvektor (äquatorial, mittleres Äquinoktium des Datums) und Entfernung [km]. Genauigkeit ~0,01° */
export function sonne(ms) {
  const n = jd(ms) - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * RAD;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const r = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam), r };
}

/** Mond: geozentrischer Vektor [km], äquatorial. Genauigkeit ~0,3° (Astronomical Almanac, Kurzformel) */
export function mond(ms) {
  const T = (jd(ms) - 2451545.0) / 36525;
  const s = (a) => Math.sin(a * RAD), c = (a) => Math.cos(a * RAD);
  const lam = 218.32 + 481267.881 * T + 6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T)
    + 0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T) - 0.19 * s(357.5 + 35999.05 * T)
    - 0.11 * s(186.5 + 966404.03 * T);
  const bet = 5.13 * s(93.3 + 483202.02 * T) + 0.28 * s(228.2 + 960400.89 * T) - 0.28 * s(318.3 + 6003.15 * T)
    - 0.17 * s(217.6 - 407332.21 * T);
  const par = 0.9508 + 0.0518 * c(135.0 + 477198.87 * T) + 0.0095 * c(259.3 - 413335.36 * T)
    + 0.0078 * c(235.7 + 890534.22 * T) + 0.0028 * c(269.9 + 954397.74 * T);
  const r = 6378.14 / Math.sin(par * RAD);
  const eps = (23.439 - 0.0130 * T) * RAD;
  const l = lam * RAD, b = bet * RAD;
  const xe = Math.cos(b) * Math.cos(l), ye = Math.cos(b) * Math.sin(l), ze = Math.sin(b);
  return {
    x: r * xe,
    y: r * (Math.cos(eps) * ye - Math.sin(eps) * ze),
    z: r * (Math.sin(eps) * ye + Math.cos(eps) * ze),
    r,
  };
}

/** Beobachter: geodätisch -> erdfest (ECEF) [km] */
export function geoZuEcef(latDeg, lonDeg, hKm = 0) {
  const la = latDeg * RAD, lo = lonDeg * RAD;
  const sl = Math.sin(la), cl = Math.cos(la);
  const N = RE / Math.sqrt(1 - E2 * sl * sl);
  return { x: (N + hKm) * cl * Math.cos(lo), y: (N + hKm) * cl * Math.sin(lo), z: (N * (1 - E2) + hKm) * sl };
}

/** erdfest -> geodätisch (Bowring, 2 Iterationen reichen hier) */
export function ecefZuGeo(x, y, z) {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  let h = 0;
  for (let i = 0; i < 4; i++) {
    const sl = Math.sin(lat);
    const N = RE / Math.sqrt(1 - E2 * sl * sl);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - E2 * N / (N + h)));
  }
  return { lat: lat * DEG, lon: lon * DEG, h };
}

/** inertial (TEME/ECI) -> erdfest: Drehung um z mit -GMST */
export function eciZuEcef(v, g) {
  const c = Math.cos(g), s = Math.sin(g);
  return { x: c * v.x + s * v.y, y: -s * v.x + c * v.y, z: v.z };
}
export function ecefZuEci(v, g) {
  const c = Math.cos(g), s = Math.sin(g);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z };
}

/** Beobachter-Objekt mit vorberechneten Größen */
export function beobachter(latDeg, lonDeg, hKm = 0) {
  const la = latDeg * RAD, lo = lonDeg * RAD;
  const p = geoZuEcef(latDeg, lonDeg, hKm);
  return {
    lat: latDeg, lon: lonDeg, h: hKm, ecef: p,
    sla: Math.sin(la), cla: Math.cos(la), slo: Math.sin(lo), clo: Math.cos(lo),
  };
}

/** Richtung vom Beobachter zu einem erdfesten Punkt: Azimut (ab Nord über Ost), Höhe, Entfernung */
export function blick(b, x, y, z) {
  const dx = x - b.ecef.x, dy = y - b.ecef.y, dz = z - b.ecef.z;
  const ost = -b.slo * dx + b.clo * dy;
  const nord = -b.sla * b.clo * dx - b.sla * b.slo * dy + b.cla * dz;
  const oben = b.cla * b.clo * dx + b.cla * b.slo * dy + b.sla * dz;
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let az = Math.atan2(ost, nord) * DEG;
  if (az < 0) az += 360;
  return { az, el: Math.asin(oben / r) * DEG, r, ost, nord, oben };
}

/** Anteil der Sonnenscheibe, der den Satelliten erreicht (1 = voll, 0 = Kernschatten) */
export function lichtAnteil(sat, so) {
  // sat: ECI [km]; so: Sonne {x,y,z (Einheit), r}
  const sx = so.x * so.r - sat.x, sy = so.y * so.r - sat.y, sz = so.z * so.r - sat.z;
  const ds = Math.sqrt(sx * sx + sy * sy + sz * sz);
  const rs = Math.sqrt(sat.x * sat.x + sat.y * sat.y + sat.z * sat.z);
  const re = RE + 20; // Erde + dichte Atmosphäre
  if (rs <= re) return 0;
  const thE = Math.asin(re / rs);                      // Winkelradius Erde
  const thS = Math.asin(Math.min(1, R_SONNE / ds));    // Winkelradius Sonne
  const cosT = (-sat.x * sx - sat.y * sy - sat.z * sz) / (rs * ds);
  const th = Math.acos(Math.max(-1, Math.min(1, cosT))); // Winkel Erdmitte–Sonne
  if (th >= thE + thS) return 1;
  if (th <= thE - thS) return 0;
  return (th - (thE - thS)) / (2 * thS); // Halbschatten, linear genähert
}

/** Phasenwinkel am Satelliten (Sonne–Satellit–Beobachter) in rad */
export function phasenWinkel(sat, so, beobEci) {
  const ax = so.x * so.r - sat.x, ay = so.y * so.r - sat.y, az = so.z * so.r - sat.z;
  const bx = beobEci.x - sat.x, by = beobEci.y - sat.y, bz = beobEci.z - sat.z;
  const c = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz));
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Luftmasse (Kasten & Young 1989) */
export function luftmasse(elDeg) {
  if (elDeg <= 0) return 40;
  return 1 / (Math.sin(elDeg * RAD) + 0.50572 * Math.pow(elDeg + 6.07995, -1.6364));
}

/**
 * Geschätzte Helligkeit (mag). stdMag gilt für 1000 km und 90° Phasenwinkel,
 * Phasengesetz einer diffus reflektierenden Kugel, dazu Extinktion 0,2 mag je Luftmasse.
 */
export function helligkeit(stdMag, rKm, phase, elDeg, licht = 1) {
  if (stdMag == null || licht <= 0.02) return null;
  const f = Math.sin(phase) + (Math.PI - phase) * Math.cos(phase);
  if (f <= 1e-4) return null;
  return stdMag + 5 * Math.log10(rKm / 1000) - 2.5 * Math.log10(f) + 0.2 * luftmasse(elDeg) - 2.5 * Math.log10(licht);
}

/** Bis zu welcher Helligkeit sieht man mit bloßem Auge – abhängig von der Sonnenhöhe */
export function sichtGrenze(sonnenHoehe, himmel = 4.5) {
  const p = [[0, -3], [-3, -0.5], [-6, 2], [-9, 3.5], [-12, 4.5], [-15, 5.5], [-18, 6.5]];
  if (sonnenHoehe >= 0) return -4;
  let g = p[p.length - 1][1];
  for (let i = 1; i < p.length; i++) {
    if (sonnenHoehe >= p[i][0]) {
      const [h0, g0] = p[i - 1], [h1, g1] = p[i];
      g = g0 + (g1 - g0) * (sonnenHoehe - h0) / (h1 - h0);
      break;
    }
  }
  return Math.min(g, himmel);
}

const RICHTUNGEN = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const richtung = (az) => RICHTUNGEN[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
const RICHTUNG_LANG = { N: "Norden", O: "Osten", S: "Süden", W: "Westen" };
export const himmelsrichtung = (az) => RICHTUNG_LANG[["N", "O", "S", "W"][Math.round(((az % 360) + 360) % 360 / 90) % 4]];
const RICHTUNG8 = ["Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten"];
/** Himmelsrichtung in Worten (8 Richtungen) */
export const richtungLang = (az) => RICHTUNG8[Math.round(((az % 360) + 360) % 360 / 45) % 8];

/** Präzession J2000 -> Datum (IAU 1976), für Sternörter. Gibt RA/Dec in Grad zurück. */
export function praezession(raDeg, decDeg, ms) {
  const T = (jd(ms) - 2451545.0) / 36525;
  const as = RAD / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T) * as;
  const z = (2306.2181 * T + 1.09468 * T * T) * as;
  const th = (2004.3109 * T - 0.42665 * T * T) * as;
  const ra = raDeg * RAD, de = decDeg * RAD;
  const A = Math.cos(de) * Math.sin(ra + zeta);
  const B = Math.cos(th) * Math.cos(de) * Math.cos(ra + zeta) - Math.sin(th) * Math.sin(de);
  const C = Math.sin(th) * Math.cos(de) * Math.cos(ra + zeta) + Math.cos(th) * Math.sin(de);
  let r = (Math.atan2(A, B) + z) * DEG;
  if (r < 0) r += 360;
  return { ra: r % 360, dec: Math.asin(C) * DEG };
}

/** Richtung (Einheitsvektor, äquatorial) aus RA/Dec in Grad */
export function radecVektor(raDeg, decDeg) {
  const ra = raDeg * RAD, de = decDeg * RAD;
  return { x: Math.cos(de) * Math.cos(ra), y: Math.cos(de) * Math.sin(ra), z: Math.sin(de) };
}

/** Höhe/Azimut eines Himmelskörpers in Richtung u (ECI, Einheitsvektor oder km) für den Beobachter */
export function blickEci(b, v, g, entfernt = true) {
  // v: ECI-Vektor [km] oder Einheitsvektor (entfernt = true -> keine Parallaxe)
  const e = eciZuEcef(v, g);
  if (entfernt) {
    const n = Math.hypot(e.x, e.y, e.z);
    return blick(b, b.ecef.x + e.x / n * 1e9, b.ecef.y + e.y / n * 1e9, b.ecef.z + e.z / n * 1e9);
  }
  return blick(b, e.x, e.y, e.z);
}

/** beleuchteter Anteil des Mondes (0..1) */
export function mondPhase(ms) {
  const so = sonne(ms), mo = mond(ms);
  const c = (so.x * mo.x + so.y * mo.y + so.z * mo.z) / mo.r; // cos Elongation
  return (1 - c) / 2;
}

/** Bahnart grob einordnen */
export function bahnArt(n, e, i, hp, ha) {
  const periode = 1440 / n;
  if (Math.abs(periode - 1436) < 30 && e < 0.05 && i < 20) return "geostationär";
  if (Math.abs(periode - 1436) < 60 && e < 0.1) return "geosynchron";
  if (e > 0.25) return "stark elliptisch";
  if (ha < 2000) {
    if (i > 95 && i < 102 && hp > 300) return "sonnensynchron (polar)";
    if (i > 80 && i < 100) return "polar";
    return "niedrige Umlaufbahn (LEO)";
  }
  if (ha < 35000) return "mittlere Umlaufbahn (MEO)";
  return "hohe Umlaufbahn";
}

/** Halbachse, Perigäum- und Apogäumshöhe aus mittlerer Bewegung n [U/Tag] und e */
export function bahnHoehen(n, e) {
  const nRad = n * 2 * Math.PI / 86400;
  const a = Math.cbrt(MU / (nRad * nRad));
  return { a, hp: a * (1 - e) - RE, ha: a * (1 + e) - RE, periode: 1440 / n };
}

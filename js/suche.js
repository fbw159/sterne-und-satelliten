// Suche in „Himmel live“: Mond, Planeten, Sternbilder, helle Sterne und Satelliten.
// Findet deutsche und lateinische Namen, auch ohne Umlaute, und bekannte Beinamen („Großer Wagen“).
import { PLANETEN } from "./himmelsdaten.js";

const BEINAMEN = {
  UMa: ["Großer Wagen", "Großer Bär"],
  UMi: ["Kleiner Wagen", "Kleiner Bär"],
  Cas: ["Himmels-W", "Himmels W"],
  Tau: ["Plejaden", "Siebengestirn", "Hyaden"],
  Ori: ["Himmelsjäger", "Oriongürtel"],
  Cyg: ["Kreuz des Nordens", "Nordkreuz", "Sommerdreieck"],
  Lyr: ["Sommerdreieck"],
  Aql: ["Sommerdreieck"],
  Sgr: ["Teekanne", "Milchstraßenzentrum"],
  Cru: ["Kreuz des Südens"],
  Peg: ["Herbstviereck", "Pegasusquadrat"],
  CMa: ["Großer Hund"],
  CMi: ["Kleiner Hund", "Winterdreieck"],
  And: ["Andromedagalaxie", "Andromedanebel"],
  Her: ["Kugelsternhaufen M13"],
  Cnc: ["Krippe", "Praesepe"],
};

/** Text für den Vergleich: klein, ohne Umlaute und Akzente, ß = ss */
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** dasselbe mit ä = ae, ö = oe, ü = ue (für „Loewe“) */
const normAe = (s) => norm(String(s || "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue"));

/**
 * Alle Einträge für die Suche. HD = HimmelDaten, iss = Index der ISS (oder −1),
 * sats = gerade sichtbare Satelliten [{ i, name }]
 */
export function suchEintraege(HD, iss, sats = []) {
  const L = [];
  L.push({ o: { art: "mond" }, name: "Mond", art: "Mond", gruppe: 0, namen: ["Mond", "Moon"] });
  for (const p of PLANETEN) L.push({ o: { art: "planet", id: p.id }, name: p.name, art: "Planet", gruppe: 0, namen: [p.name, p.id] });
  if (iss >= 0) L.push({ o: { art: "sat", i: iss }, name: "ISS", zusatz: "Internationale Raumstation", art: "Raumstation", gruppe: 1, namen: ["ISS", "Internationale Raumstation", "Raumstation"] });
  for (const s of sats) if (s.i !== iss) L.push({ o: { art: "sat", i: s.i }, name: s.name, art: "Satellit, gerade sichtbar", gruppe: 1, namen: [s.name] });
  if (HD && HD.bereit) {
    for (const sb of HD.sternbilder) {
      L.push({
        o: { art: "sternbild", k: sb.k }, name: sb.de, zusatz: sb.la !== sb.de ? sb.la : "", art: "Sternbild", gruppe: 2,
        rang: sb.rang, dec: sb.pos && sb.pos[0] ? sb.pos[0][1] : null, namen: [sb.de, sb.la, ...(BEINAMEN[sb.k] || [])],
      });
    }
    HD.sterne.forEach((z, k) => {
      if (z[4]) L.push({ o: { art: "stern", k }, name: z[4], zusatz: z[5] || "", art: "Stern", gruppe: 3, mag: z[2], dec: z[1], namen: [z[4], z[5]] });
    });
  }
  for (const e of L) {
    e.n = [];
    e.namen.filter(Boolean).forEach((t, k) => { for (const n of new Set([norm(t), normAe(t)])) e.n.push({ n, k, t }); });
  }
  return L;
}

/** Treffer für einen Suchbegriff, beste zuerst (null = kein Suchbegriff); gruppe = nur diese Art (0 Mond/Planeten, 1 Satelliten, 2 Sternbilder, 3 Sterne) */
export function suchen(L, q, gruppe = null) {
  const nq = norm(q);
  if (!nq) return null;
  const out = [];
  for (const e of L) {
    if (gruppe != null && e.gruppe !== gruppe) continue;
    let best = 0, via = null;
    for (const { n, k, t } of e.n) {
      const w = n === nq ? 4 : n.startsWith(nq) ? 3 : (" " + n).includes(" " + nq) ? 2 : nq.length >= 3 && n.includes(nq) ? 1 : 0;
      // Beinamen (ab dem 3. Namen) nur, wenn nichts Besseres passt
      if (w > best || (w === best && w && via && k < via.k)) { best = w; via = { k, t }; }
    }
    if (best) out.push({ e, best, via });
  }
  out.sort((a, b) => b.best - a.best || a.e.gruppe - b.e.gruppe || (a.e.rang ?? 9) - (b.e.rang ?? 9)
    || (a.e.mag ?? 9) - (b.e.mag ?? 9) || a.e.name.localeCompare(b.e.name, "de"));
  // über einen Beinamen gefunden: diesen dazuschreiben („Stier – Plejaden“)
  return out.slice(0, gruppe == null ? 40 : 150).map((x) => (x.via && x.via.k >= 2 && x.e.gruppe === 2 ? { ...x.e, zusatz: x.via.t } : x.e));
}

/** Geht ein Punkt mit dieser Deklination für diese Breite nie auf? */
export const nieZuSehen = (dec, lat) => (lat >= 0 ? dec < lat - 90 + 2 : dec > lat + 90 - 2);

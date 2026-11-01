// „Gerade über …“: Land, großer See oder Meer an einer Stelle der Erde (Raster aus Natural Earth, 0,2°)
let daten = null, laedt = null;

export function orteLaden() {
  if (daten) return Promise.resolve(daten);
  if (!laedt) laedt = fetch("data/orte.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => (daten = d)).catch(() => { laedt = null; return null; });
  return laedt;
}

/** Dativ mit Artikel, z. B. „Italien“, „dem Mittelmeer“, „der Ostsee“ – oder null, solange nicht geladen */
export function ortName(lat, lon) {
  if (!daten || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const a = daten.aufloesung, W = daten.breite, H = daten.hoehe;
  const y = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / a)));
  const l = (((lon + 180) % 360) + 360) % 360;
  const x = Math.min(W - 1, Math.floor(l / a));
  const r = daten.zeilen[y];
  let k = 0;
  for (let i = 0; i < r.length; i += 2) {
    k += r[i + 1];
    if (x < k) return daten.namen[r[i]] || null;
  }
  return null;
}

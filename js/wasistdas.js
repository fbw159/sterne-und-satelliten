// „Was ist das?“ – kurze Steckbriefe für Sterne, Planeten, Mond, Sonne, Sternbilder und Satelliten
import * as A from "./astro.js";
import { esc, zahl, uhr, tag, km, helligkeitWort } from "./ui.js";

const LICHTJAHR_JAHRE = (lj) => Math.round(lj);

const PLANET_TEXT = {
  Mercury: "Der Planet, der der Sonne am nächsten ist. Er steht nie weit von ihr entfernt und ist deshalb nur kurz in der Abend- oder Morgendämmerung tief am Horizont zu sehen.",
  Venus: "Nach Sonne und Mond das hellste Objekt am Himmel – der „Abendstern“ oder „Morgenstern“. Ihre dichte Wolkendecke wirft viel Sonnenlicht zurück.",
  Mars: "Der rote Planet. Seine Farbe kommt von rostigem Staub. Etwa alle zwei Jahre kommt er der Erde besonders nahe und leuchtet dann sehr hell.",
  Jupiter: "Der größte Planet – mehr als 1.300 Erden würden hineinpassen. Schon mit einem Fernglas sieht man seine vier großen Monde als Pünktchen neben ihm.",
  Saturn: "Der Ringplanet. Die Ringe aus Eis und Gestein sieht man schon mit einem kleinen Teleskop.",
  Uranus: "Ein Eisriese weit draußen. Mit bloßem Auge ist er nur unter sehr dunklem Himmel als schwaches Pünktchen zu erahnen, mit einem Fernglas leicht zu finden.",
  Neptune: "Der äußerste Planet. Er ist zu schwach für das bloße Auge – man braucht ein Fernglas oder Teleskop.",
};

const TIERKREIS = new Set(["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"]);
const SB_TEXT = {
  UMa: "Sein bekanntester Teil ist der Große Wagen aus sieben hellen Sternen. Verlängert man die hintere Kante des Wagenkastens etwa fünfmal, landet man beim Polarstern.",
  UMi: "Hier steht der Polarstern, am Ende der Deichsel des Kleinen Wagens. Er zeigt fast genau nach Norden.",
  Cas: "Das „Himmels-W“ aus fünf hellen Sternen. Bei uns geht es nie unter und ist das ganze Jahr zu sehen.",
  Ori: "Der Himmelsjäger mit den drei Gürtelsternen in einer Reihe. Oben links der rötliche Beteigeuze, unten rechts der bläuliche Rigel. Unter dem Gürtel liegt der Orionnebel, in dem neue Sterne entstehen.",
  Cyg: "Auch „Kreuz des Nordens“ genannt. Sein hellster Stern Deneb bildet mit Wega und Atair das Sommerdreieck.",
  Lyr: "Klein, aber mit Wega, einem der hellsten Sterne am Nordhimmel. Wega bildet mit Deneb und Atair das Sommerdreieck.",
  Aql: "Mit Atair, einem der hellen Sterne des Sommerdreiecks. Er ist nur 17 Lichtjahre entfernt.",
  Leo: "Frühlingssternbild. Der Kopf sieht aus wie ein rückwärts geschriebenes Fragezeichen, darunter steht der helle Regulus.",
  Gem: "Die beiden hellen Sterne Kastor und Pollux sind die Köpfe der Zwillinge.",
  Tau: "Mit dem rötlichen Aldebaran und zwei bekannten Sternhaufen: den Plejaden (Siebengestirn) und den Hyaden.",
  Sco: "Sommersternbild tief im Süden, mit dem roten Riesenstern Antares im Herzen des Skorpions.",
  Sgr: "In dieser Richtung liegt das Zentrum unserer Milchstraße. Die hellsten Sterne sehen aus wie eine Teekanne.",
  Boo: "Mit Arktur, dem hellsten Stern des Nordhimmels. Man findet ihn, indem man den Bogen der Deichsel des Großen Wagens verlängert.",
  Vir: "Großes Tierkreissternbild mit dem bläulichen Stern Spica. Hier liegen viele ferne Galaxien.",
  CMa: "Hier steht Sirius, der hellste Stern am ganzen Nachthimmel – nur 8,6 Lichtjahre entfernt.",
  CMi: "Mit Prokyon. Er bildet mit Sirius und Beteigeuze das Winterdreieck.",
  Aur: "Mit der hellen Kapella, die im Winter hoch über uns steht.",
  Per: "Mit Algol, einem Stern, der alle knapp drei Tage für einige Stunden dunkler wird. Im August scheinen die Sternschnuppen der Perseiden von hier zu kommen.",
  And: "Hier liegt die Andromeda-Galaxie, 2,5 Millionen Lichtjahre entfernt – das Fernste, was man mit bloßem Auge sehen kann.",
  Peg: "Vier helle Sterne bilden das große Herbstviereck, den Rumpf des geflügelten Pferdes.",
  Dra: "Der Drache windet sich zwischen Großem und Kleinem Bären hindurch.",
  Her: "Hier liegt der Kugelsternhaufen M13 mit Hunderttausenden Sternen, im Fernglas ein kleiner Nebelfleck.",
  Oph: "Die Sonne zieht jedes Jahr auch durch den Schlangenträger, obwohl er nicht zu den klassischen Tierkreiszeichen gehört.",
  Cru: "Das kleinste Sternbild. Vom Süden der Erde aus zeigt es zum Himmelssüdpol.",
  Cen: "Mit Alpha Centauri, dem Nachbarsystem der Sonne: 4,4 Lichtjahre entfernt.",
  CrB: "Ein kleiner Halbkreis aus Sternen, wie eine Krone.",
  Del: "Klein, aber gut zu erkennen: Es sieht wirklich aus wie ein springender Delfin.",
  Cnc: "Unscheinbar, aber in der Mitte liegt der Sternhaufen Krippe (Praesepe), im Fernglas sehr schön.",
  Hya: "Das größte Sternbild am Himmel – es ist mehr als 100 Grad lang.",
  Cep: "Sieht aus wie ein Haus mit spitzem Dach. Hier liegt der Granatstern, einer der rötesten Sterne mit bloßem Auge.",
  Lep: "Der Hase sitzt zu Füßen des Orion.",
  Eri: "Ein langer Himmelsfluss, der sich vom Orion weit nach Süden schlängelt.",
  Cet: "Mit Mira, einem Stern, der im Lauf von knapp einem Jahr sehr hell und wieder unsichtbar wird.",
  Psc: "Ein großes, eher lichtschwaches Tierkreissternbild. Hier steht zurzeit der Frühlingspunkt.",
  Ari: "Klein, mit dem hellen Stern Hamal. Ein klassisches Tierkreissternbild.",
  Lib: "Die Waage war früher die Scheren des Skorpions – daher die Sternnamen Zubenelgenubi und Zubeneschamali („südliche“ und „nördliche Schere“).",
  Cap: "Eher lichtschwaches Tierkreissternbild am Herbsthimmel, tief im Süden.",
  Aqr: "Großes, lichtschwaches Tierkreissternbild am Herbsthimmel.",
  PsA: "Mit Fomalhaut, dem einzigen hellen Stern tief am Herbsthimmel im Süden.",
  Ser: "Das einzige zweigeteilte Sternbild: Kopf und Schwanz der Schlange liegen links und rechts vom Schlangenträger.",
  Car: "Mit Canopus, dem zweithellsten Stern am Nachthimmel. Von Deutschland aus nicht zu sehen.",
  Sge: "Ein kleiner Pfeil mitten in der Sommermilchstraße.",
  CVn: "Mit Cor Caroli, „Herz Karls“, benannt nach einem englischen König.",
  Com: "Hier liegen sehr viele Galaxien – und ein großer, lockerer Sternhaufen.",
  Lyn: "Sehr lichtschwach – man soll Augen wie ein Luchs brauchen, um es zu erkennen.",
};

const PHASEN = [[10, "Neumond"], [80, "zunehmende Sichel"], [100, "Halbmond (erstes Viertel)"], [170, "zunehmender Mond"], [190, "Vollmond"], [260, "abnehmender Mond"], [280, "Halbmond (letztes Viertel)"], [350, "abnehmende Sichel"], [361, "Neumond"]];
export const phasenName = (w) => PHASEN.find(([g]) => w < g)[1];

export function farbeWort(kHundert) {
  const k = kHundert * 100;
  if (k < 3700) return "rötlich";
  if (k < 5200) return "orange";
  if (k < 6000) return "gelblich";
  if (k < 7500) return "weiß";
  if (k < 10000) return "bläulich-weiß";
  return "bläulich";
}

const zeile = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
const richtungText = (az, el) => el < 0 ? `unter dem Horizont (${A.richtung(az)})` : `${A.richtung(az)} (${Math.round(az)}°), ${Math.round(el)}° hoch`;

function aufUnterText(au, el) {
  if (!au) return "";
  const t = [];
  if (el < 0 && au.auf) t.push(`geht ${tag(au.auf)} um ${uhr(au.auf)} Uhr auf`);
  if (el >= 0 && au.unter) t.push(`geht ${tag(au.unter)} um ${uhr(au.unter)} Uhr unter`);
  if (!t.length && el >= 0 && !au.unter) t.push("geht heute nicht unter");
  if (!t.length && el < 0 && !au.auf) t.push("geht heute nicht auf");
  return t.join(", ");
}

function lichtZeit(kmEntf) {
  const s = kmEntf / 299792.458;
  if (s < 90) return `${zahl(s, 1)} Sekunden`;
  if (s < 5400) return `${zahl(s / 60)} Minuten`;
  return `${zahl(s / 3600, 1)} Stunden`;
}

function knoepfe(o, mitSteckbrief, opt = {}) {
  const hin = opt.hinText || "Hinführen";
  return `<div class="info-knoepfe">${o.hinfuehren !== false ? `<button class="knopf" data-info="hin"><svg><use href="#i-${opt.hinText ? "handy" : "pfeil"}"/></svg>${esc(hin)}</button>` : ""}${mitSteckbrief ? '<button class="knopf" data-info="steckbrief">Alles über ihn</button>' : ""}</div>`;
}

/**
 * HTML für die Info-Karte. o = { art, … } mit:
 *  stern:  { z (Zeile aus sterne.json), sb, az, el }
 *  planet: { p (aus planetenAktualisieren), sb, au }
 *  mond:   { m (mondDetails), sb, au }
 *  sonne:  { az, el }
 *  sternbild: { sb, hellster (Zeile) }
 *  sat:    { name, kat, az, el, r, mag, sichtbar, licht, iss, was, zweck, firma }
 * opt = { hinText: Beschriftung statt „Hinführen“, klappen: Knopf zum Kleinklappen (Infobox) }
 */
export function infoHtml(o, opt = {}) {
  const klappen = opt.klappen ? '<button class="rund klein knopf-klappen" data-klappen aria-label="Infobox klein- oder großklappen" title="klein-/großklappen"><svg><use href="#i-klappen"/></svg></button>' : "";
  const kopf = (titel, unter) => `<div class="info-kopf"><div><h3>${esc(titel)}</h3>${unter ? `<p>${unter}</p>` : ""}</div><div class="kopf-knopfe">${klappen}<button class="rund klein" data-info="zu" aria-label="Schließen"><svg><use href="#i-zu"/></svg></button></div></div>`;
  let h = "";
  if (o.art === "stern") {
    const z = o.z;
    const name = z[4] || z[5];
    const sbName = o.sb ? o.sb.de : "";
    h += kopf(name, `Stern${sbName ? ` im Sternbild ${esc(sbName)}` : ""}${z[4] ? ` · ${esc(z[5])}` : ""}`);
    h += `<table class="tabelle">`;
    h += zeile("Wo", richtungText(o.az, o.el));
    h += zeile("Helligkeit", `${zahl(z[2], 1)} mag${z[2] < 1 ? " – einer der hellsten Sterne" : z[2] < 2.5 ? ", gut zu sehen" : z[2] > 4.5 ? ", nur unter dunklem Himmel" : ""}`);
    h += zeile("Farbe", `${farbeWort(z[3])}, Oberfläche etwa ${zahl(Math.round((z[3] * 100 - 273) / 100) * 100)} °C`);
    if (z[7] != null) {
      const unsicher = typeof z[7] === "string";
      const lj = parseFloat(String(z[7]).replace("~", ""));
      const jahr = new Date().getFullYear() - LICHTJAHR_JAHRE(lj);
      h += zeile("Entfernung", `${unsicher ? "etwa " : ""}${zahl(lj, lj < 20 ? 1 : 0)} Lichtjahre`);
      h += `</table><p class="info-text">${lj < 1500 ? `Das Licht, das jetzt bei dir ankommt, ist ${jahr > 0 ? `im Jahr ${jahr}` : `vor ${zahl(lj)} Jahren`} dort losgeflogen.` : `Das Licht, das jetzt bei dir ankommt, war ${unsicher ? "etwa " : ""}${zahl(lj)} Jahre unterwegs.`}</p>`;
    } else h += "</table>";
    h += knoepfe(o, false, opt);
  } else if (o.art === "planet") {
    const p = o.p;
    const kmE = p.dist * 149597870.7;
    h += kopf(p.name, `Planet${o.sb ? ` · steht im Sternbild ${esc(o.sb.de)}` : ""}`);
    h += `<table class="tabelle">`;
    h += zeile("Wo", richtungText(p.az, p.el) + (o.au ? `<br><small>${aufUnterText(o.au, p.el)}</small>` : ""));
    h += zeile("Helligkeit", `${zahl(p.mag, 1)} mag, ${helligkeitWort(p.mag)}`);
    h += zeile("Entfernung", `${kmE > 1e9 ? `${zahl(kmE / 1e9, 2)} Mrd. km` : `${zahl(kmE / 1e6)} Mio. km`}`);
    h += zeile("Licht braucht", lichtZeit(kmE));
    if (p.id === "Venus" || p.id === "Mercury" || p.id === "Mars") h += zeile("Beleuchtet", `zu ${zahl(p.anteil * 100)} %`);
    if (p.id === "Saturn" && p.ring != null) h += zeile("Ringe", `um ${zahl(Math.abs(p.ring), 1)}° geöffnet${Math.abs(p.ring) < 5 ? " – fast von der Kante gesehen" : ""}`);
    h += `</table><p class="info-text">${PLANET_TEXT[p.id] || ""}</p>`;
    h += knoepfe(o, false, opt);
  } else if (o.art === "mond") {
    const m = o.m;
    h += kopf("Mond", `${phasenName(m.phase)}, zu ${zahl(m.anteil * 100)} % beleuchtet${o.sb ? ` · im Sternbild ${esc(o.sb.de)}` : ""}`);
    h += `<table class="tabelle">`;
    h += zeile("Wo", richtungText(m.az, m.el) + (o.au ? `<br><small>${aufUnterText(o.au, m.el)}</small>` : ""));
    h += zeile("Entfernung", `${km(Math.round(m.distKm / 100) * 100)}`);
    h += zeile("Licht braucht", lichtZeit(m.distKm));
    h += `</table><p class="info-text">Der Mond umkreist die Erde in gut 27 Tagen und dreht uns dabei immer dieselbe Seite zu. Von Neumond zu Neumond dauert es 29,5 Tage.</p>`;
    h += knoepfe(o, false, opt);
  } else if (o.art === "sonne") {
    h += kopf("Sonne", "unser Stern");
    h += `<p class="info-text"><b>Nie direkt in die Sonne schauen – erst recht nicht mit Fernglas oder Kamera!</b> Sie ist 150 Millionen km entfernt, ihr Licht braucht gut 8 Minuten bis zu uns.</p>`;
    h += `<table class="tabelle">${zeile("Wo", richtungText(o.az, o.el))}</table>`;
  } else if (o.art === "sternbild") {
    const sb = o.sb;
    h += kopf(sb.de, `Sternbild ${esc(sb.la)}${TIERKREIS.has(sb.k) ? " · Tierkreis" : ""}`);
    if (o.hellster) h += `<table class="tabelle">${zeile("Hellster Stern", `${esc(o.hellster[4] || o.hellster[5])} (${zahl(o.hellster[2], 1)} mag)`)}</table>`;
    let t = SB_TEXT[sb.k] || "";
    if (TIERKREIS.has(sb.k)) t = (t ? t + " " : "") + "Sonne, Mond und Planeten ziehen durch die Sternbilder des Tierkreises.";
    if (t) h += `<p class="info-text">${t}</p>`;
    h += knoepfe(o, false, opt);
  } else if (o.art === "sat") {
    h += kopf(o.name, `${esc(o.kat || "Satellit")}`);
    h += `<table class="tabelle">`;
    if (o.was) h += zeile("Was ist das?", esc(o.was));
    if (o.zweck && o.was !== "Raketenstufe" && o.was !== "Trümmerteil") h += zeile("Wofür?", esc(o.zweck));
    if (o.firma) h += zeile(o.was === "Raketenstufe" ? "Rakete von" : o.was === "Trümmerteil" ? "Herkunft" : "Betreiber", esc(o.firma));
    h += zeile("Wo", richtungText(o.az, o.el));
    h += zeile("Zustand", o.sichtbar ? `<b class="gelb">jetzt mit bloßem Auge zu sehen</b>${o.mag != null ? `, ${zahl(o.mag, 1)} mag` : ""}` : o.licht ? "von der Sonne angestrahlt, aber gerade nicht gut zu sehen" : "im Erdschatten – unsichtbar");
    if (o.r) h += zeile("Entfernung", km(o.r));
    h += "</table>";
    h += knoepfe(o, true, opt);
  }
  return h;
}

export { TIERKREIS };

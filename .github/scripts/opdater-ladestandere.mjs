// Opdaterer ladestandere.json med offentlige ladesteder i Danmark fra Monta
// (AFIR-data, DATEX II, via Vejdirektoratets Dataudveksler – datasæt 1092).
//
// Køres af .github/workflows/opdater-ladestandere.yml hver 6. time og kan
// startes manuelt under Actions. Ingen hemmeligheder her: Montas nøgler ligger
// i Cloudflare, og vd-proxy leverer 100 ladesteder ad gangen (/lade/side).
//
//   1. Hent side 1, 2, 3 … indtil alle ladesteder er hentet
//   2. Kontrollér resultatet. Fejler en kontrol, skrives intet, og jobbet
//      fejler, så GitHub sender en mail — den gamle fil bliver stående.
//   3. Skriv kun filen, hvis ladestederne faktisk har ændret sig.

import fs from "node:fs";

const KILDE   = "https://vd-proxy.danmarkskortet.workers.dev/lade/side";
const FIL     = "ladestandere.json";
const MAKS_SIDER = 200;   // 20.000 ladesteder — langt over Montas nuværende 3.400

const vent = ms => new Promise(res => setTimeout(res, ms));

async function hentSide(side) {
  for (let forsoeg = 1; forsoeg <= 6; forsoeg++) {
    try {
      const r = await fetch(`${KILDE}?page=${side}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    } catch (e) {
      console.warn(`Side ${side}, forsøg ${forsoeg}: ${e.message}`);
      if (forsoeg === 6) throw e;
      // 429 = Monta beder os vente — vent længere end ved andre fejl
      await vent((/429/.test(e.message) ? 15000 : 3000) * forsoeg);
    }
  }
}

// Montas "total" er antal ladesteder (kørsel 12/10-2026: total 3412, hentet
// 3399). Monta kan give en TOM side midt i, når den bremser os — derfor stoppes
// der først, når alle sider ifølge total er gennemgået. En tom side prøves igen
// efter en pause, før vi går videre.
const steder = [];
let total = 0, sider = 0, tommeIStraek = 0;
for (let side = 1; side <= MAKS_SIDER; side++) {
  let j = await hentSide(side);
  if (!j.antal && total && side * 100 < total + 100) {
    console.warn(`Side ${side} var tom — prøver igen om 20 sek.`);
    await vent(20000);
    j = await hentSide(side);
  }
  total = j.total || total;
  sider = side;
  steder.push(...j.steder);
  tommeIStraek = j.antal ? 0 : tommeIStraek + 1;
  if (total ? side * 100 >= total : tommeIStraek >= 2) break;
  await vent(1000);   // skån Monta (for hurtige kald giver 429)
}
console.log(`Hentet ${sider} sider: ${steder.length} ladesteder (Montas "total": ${total}).`);

// Ladesteder, som operatøren selv har markeret som ophørt/nedlagt i navnet
// (fx "Sygehus Lillebælt Middelfart(Ophørt d. 1/1)"), springes over
const OPHOERT = /oph[øo]rt|nedlagt/i;
const aktive = steder.filter(s => !OPHOERT.test(s.navn || ""));
if (aktive.length < steder.length) console.log(`Sprang ${steder.length - aktive.length} ophørte ladesteder over.`);

// Dubletter (samme id) fjernes
const unikke = [...new Map(aktive.map(s => [s.id, s])).values()]
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

// ── Kontrol ───────────────────────────────────────────────────────
const fejl = [];
if (unikke.length < 300) fejl.push(`kun ${unikke.length} ladesteder (forventet flere hundrede)`);
if (total && unikke.length < total * 0.9) fejl.push(`kun ${unikke.length} af ${total} ladesteder hentet`);
const udenforDK = unikke.filter(s => s.lat < 54.4 || s.lat > 57.9 || s.lon < 7.9 || s.lon > 15.3).length;
if (udenforDK > unikke.length * 0.02) fejl.push(`${udenforDK} ladesteder ligger uden for Danmark`);
if (fs.existsSync(FIL)) {
  try {
    const gammel = JSON.parse(fs.readFileSync(FIL, "utf8"));
    const n = gammel.steder?.length || 0;
    if (n && unikke.length < n * 0.7) fejl.push(`faldet fra ${n} til ${unikke.length} ladesteder`);
  } catch (e) { /* ødelagt gammel fil: overskrives */ }
}
if (fejl.length) {
  console.error("Kontrol fejlede — filen ændres ikke:\n  " + fejl.join("\n  "));
  process.exit(1);
}

// ── Skriv kun ved ændringer ───────────────────────────────────────
const nyStederJson = JSON.stringify(unikke);
if (fs.existsSync(FIL)) {
  try {
    const gammel = JSON.parse(fs.readFileSync(FIL, "utf8"));
    if (JSON.stringify(gammel.steder) === nyStederJson) {
      console.log(`Ingen ændringer (${unikke.length} ladesteder).`);
      process.exit(0);
    }
  } catch (e) { /* skriv ny fil */ }
}
const ud = {
  opdateret: new Date().toISOString(),
  kilde: "Monta (AFIR, via Vejdirektoratets Dataudveksler) – CC BY 4.0",
  antal: unikke.length,
  steder: unikke,
};
fs.writeFileSync(FIL, JSON.stringify(ud));
const punkter = unikke.reduce((n, s) => n + s.punkter.length, 0);
console.log(`Skrev ${FIL}: ${unikke.length} ladesteder, ${punkter} ladepunkter.`);

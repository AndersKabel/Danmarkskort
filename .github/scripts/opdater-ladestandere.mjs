// Opdaterer ladestandere.json med offentlige ladesteder i Danmark fra to
// AFIR-kilder (DATEX II, via Vejdirektoratets Dataudveksler):
//   - Monta (datasæt 1092): Norlys, EWII, NRGi, Uno-X m.fl.
//   - Eco-Movement (datasæt 1170): Clever, IONITY, Lidl, Eviny, Fastned m.fl.
//
// Køres af .github/workflows/opdater-ladestandere.yml hver 6. time og kan
// startes manuelt under Actions. Ingen hemmeligheder her: nøglerne ligger
// i Cloudflare. vd-proxy leverer Monta 100 ladesteder ad gangen (/lade/side)
// og sender Eco-Movements sider på op til 1.000 ladesteder uændret videre
// (/lade/eco) — de skrumpes her, fordi workeren kun har 10 ms CPU.
//
//   1. Hent alle sider fra begge kilder
//   2. Kontrollér resultatet. Fejler en kontrol, skrives intet, og jobbet
//      fejler, så GitHub sender en mail — den gamle fil bliver stående.
//   3. Skriv kun filen, hvis ladestederne faktisk har ændret sig.

import fs from "node:fs";

const KILDE   = "https://vd-proxy.danmarkskortet.workers.dev/lade/side";
const ECO     = "https://vd-proxy.danmarkskortet.workers.dev/lade/eco";
const ECO_MAKS_SIDER = 50;   // 50.000 ladesteder
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

// ── Eco-Movement ──────────────────────────────────────────────────
const dxTekst = v => v?.values?.[0]?.value || "";

// Samme regel som i vd-proxy: én realistisk kWh-pris inkl. moms.
// Eco-Movement skriver momsen som 0.25, Monta som 25.
function dxPris(rates) {
  for (const rate of rates || []) {
    for (const p of rate?.energyPrice || []) {
      const t = p.priceType?.value || "";
      const v = Number(p.value);
      if ((t === "basePrice" || t === "pricePerKWh") && v >= 0.5 && v <= 15) {
        const sats = Number(p.taxRate) || 25;
        const inkl = p.taxIncluded ? v : v * (1 + (sats < 1 ? sats : sats / 100));
        return Math.round(inkl * 100) / 100;
      }
    }
  }
  return null;
}

// Eco-Movements ladested -> samme form som Montas i ladestandere.json
function ecoKompakt(site) {
  const loc = site.entrance?.[0]?.locAreaLocation || site.locationReference?.locPointLocation || {};
  const k = loc.coordinatesForDisplay || loc.pointByCoordinates?.pointCoordinates || {};
  const a = loc.locLocationExtensionG?.FacilityLocation?.address || {};
  const vej = (a.addressLine || []).map(l => dxTekst(l.text)).filter(Boolean)[0] || "";
  const punkter = [];
  let stationsOperatoer = "";
  for (const st of site.energyInfrastructureStation || []) {
    stationsOperatoer = stationsOperatoer || dxTekst(st.energyDistributor?.afacAnOrganisation?.name);
    for (const rp of st.refillPoint || []) {
      const cp = rp.aegiElectricChargingPoint || rp;
      const evse = cp.idG || (cp.connector || []).flatMap(c => c.externalIdentifier || [])
        .map(e => e.identifier).find(Boolean) || "";
      const stik = (cp.connector || []).map(c => ({
        type: c.connectorType?.value || "",
        kw: c.maxPowerAtSocket ? Math.round(c.maxPowerAtSocket / 100) / 10 : null,
      }));
      const kw = Math.max(0, ...stik.map(x => x.kw || 0),
        ...(cp.availableChargingPower || []).map(w => Math.round(Number(w) / 100) / 10 || 0));
      const rates = (cp.energyProduct || []).flatMap(e => e?.aegiElectricEnergy?.energyRate || []);
      if (evse) punkter.push({ evse, kw, stik, dc: cp.currentType?.value === "dc" || kw >= 50, pris: dxPris(rates) });
    }
  }
  return {
    id: site.idG,
    kilde: "eco",
    navn: dxTekst(site.name) || dxTekst(site.brand),
    lat: Math.round(Number(k.latitude) * 1e6) / 1e6,
    lon: Math.round(Number(k.longitude) * 1e6) / 1e6,
    adresse: [vej, [a.postcode, dxTekst(a.city)].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    operatoer: dxTekst(site.operator?.afacAnOrganisation?.name)
      || dxTekst(site.energyDistributor?.afacAnOrganisation?.name) || stationsOperatoer,
    punkter,
  };
}

async function hentEcoSide(offset) {
  for (let forsoeg = 1; forsoeg <= 6; forsoeg++) {
    try {
      const r = await fetch(`${ECO}?offset=${offset}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      return { j, naeste: /rel="?next"?/.test(r.headers.get("link") || "") };
    } catch (e) {
      console.warn(`Eco-Movement offset ${offset}, forsøg ${forsoeg}: ${e.message}`);
      if (forsoeg === 6) throw e;
      await vent((/429/.test(e.message) ? 15000 : 3000) * forsoeg);
    }
  }
}

const ecoSteder = [];
let ecoSider = 0;
for (let offset = 0; ecoSider < ECO_MAKS_SIDER; offset += 1000) {
  const { j, naeste } = await hentEcoSide(offset);
  ecoSider++;
  const sites = (j?.aegiEnergyInfrastructureTablePublication?.energyInfrastructureTable || [])
    .flatMap(t => t.energyInfrastructureSite || []);
  ecoSteder.push(...sites.map(ecoKompakt)
    .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon) && x.punkter.length));
  if (!naeste || !sites.length) break;
  await vent(1000);
}
console.log(`Eco-Movement: hentet ${ecoSider} sider, ${ecoSteder.length} ladesteder.`);

// Ladesteder, som operatøren selv har markeret som ophørt/nedlagt i navnet
// (fx "Sygehus Lillebælt Middelfart(Ophørt d. 1/1)"), springes over
const OPHOERT = /oph[øo]rt|nedlagt/i;
const aktive = steder.filter(s => !OPHOERT.test(s.navn || ""));
if (aktive.length < steder.length) console.log(`Sprang ${steder.length - aktive.length} ophørte ladesteder over.`);
const ecoAktive = ecoSteder.filter(s => !OPHOERT.test(s.navn || ""));
if (ecoAktive.length < ecoSteder.length) console.log(`Sprang ${ecoSteder.length - ecoAktive.length} ophørte Eco-Movement-ladesteder over.`);

// Dubletter (samme id) fjernes inden for hver kilde. Monta først, så Eco-Movement.
const sorter = l => [...new Map(l.map(s => [s.id, s])).values()]
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));
const montaUnikke = sorter(aktive);
const ecoUnikke   = sorter(ecoAktive);
const unikke = [...montaUnikke, ...ecoUnikke];

// ── Kontrol ───────────────────────────────────────────────────────
const fejl = [];
if (montaUnikke.length < 300) fejl.push(`kun ${montaUnikke.length} ladesteder fra Monta (forventet flere hundrede)`);
if (total && montaUnikke.length < total * 0.9) fejl.push(`kun ${montaUnikke.length} af ${total} ladesteder hentet fra Monta`);
if (ecoUnikke.length < 300) fejl.push(`kun ${ecoUnikke.length} ladesteder fra Eco-Movement (forventet flere hundrede)`);
const udenforDK = unikke.filter(s => s.lat < 54.4 || s.lat > 57.9 || s.lon < 7.9 || s.lon > 15.3).length;
if (udenforDK > unikke.length * 0.02) fejl.push(`${udenforDK} ladesteder ligger uden for Danmark`);
if (fs.existsSync(FIL)) {
  try {
    const gammel = JSON.parse(fs.readFileSync(FIL, "utf8"));
    // Hver kilde for sig, så et udfald hos den ene ikke gemmer sig i totalen
    const nEco   = (gammel.steder || []).filter(s => s.kilde === "eco").length;
    const nMonta = (gammel.steder?.length || 0) - nEco;
    if (nMonta && montaUnikke.length < nMonta * 0.7) fejl.push(`Monta faldet fra ${nMonta} til ${montaUnikke.length} ladesteder`);
    if (nEco && ecoUnikke.length < nEco * 0.7) fejl.push(`Eco-Movement faldet fra ${nEco} til ${ecoUnikke.length} ladesteder`);
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
  kilde: "Monta og Eco-Movement (AFIR, via Vejdirektoratets Dataudveksler) – CC BY 4.0",
  antal: unikke.length,
  steder: unikke,
};
fs.writeFileSync(FIL, JSON.stringify(ud));
const punkter = unikke.reduce((n, s) => n + s.punkter.length, 0);
console.log(`Skrev ${FIL}: ${unikke.length} ladesteder (Monta ${montaUnikke.length}, Eco-Movement ${ecoUnikke.length}), ${punkter} ladepunkter.`);

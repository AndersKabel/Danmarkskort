// Opdaterer kommuner.geojson og postnumre.geojson fra DAGI (Datafordeleren).
//
// Køres af .github/workflows/opdater-graenser.yml den 1. i hver måned og kan
// startes manuelt under Actions. Samme logik som det snippet filerne første
// gang blev dannet med (4. oktober 2026):
//   1. Hent fulde grænser fra DAGI via vd-proxy (/daf/query, nøglen ligger
//      i Cloudflare — ingen hemmeligheder her)
//   2. Omregn UTM32 -> WGS84 og forenkl til ca. 25 m
//   3. Klip postnumre til land (kommunerne) og find den kommune, der dækker
//      mest af hvert postnummer
//   4. Kontrollér resultatet. Fejler en kontrol, skrives intet, og jobbet
//      fejler, så GitHub sender en mail — de gamle filer bliver stående.
//   5. Skriv kun filerne, hvis indholdet faktisk har ændret sig.

import fs from "node:fs";
import * as turf from "@turf/turf";
import proj4 from "proj4";
import wellknown from "wellknown";

const DAF  = "https://vd-proxy.danmarkskortet.workers.dev/daf";
const TOL  = 0.0003;                 // forenkling, ca. 20–30 m
const FIL_K = "kommuner.geojson";
const FIL_P = "postnumre.geojson";

proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

async function hentAlle(navn, felter) {
  const nu = new Date().toISOString();
  let alle = [], efter = null, side = 0;
  do {
    let svar = null;
    for (let forsoeg = 1; forsoeg <= 3 && !svar; forsoeg++) {
      try {
        const r = await fetch(`${DAF}/query?register=flexibleCurrent&version=v3`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query($t: DafDateTime!, $a: String) {
              ${navn}(first: 1000, after: $a, virkningstid: $t) {
                nodes { ${felter} geometri { wkt } }
                pageInfo { hasNextPage endCursor }
              }
            }`,
            variables: { t: nu, a: efter }
          }),
          signal: AbortSignal.timeout(120000)
        });
        const j = await r.json();
        if (!r.ok || !j?.data?.[navn]) throw new Error(`HTTP ${r.status} ${JSON.stringify(j?.errors || "").slice(0, 200)}`);
        svar = j.data[navn];
      } catch (e) {
        console.warn(`${navn} side ${side + 1}, forsøg ${forsoeg}: ${e.message}`);
        if (forsoeg === 3) throw e;
        await new Promise(res => setTimeout(res, 10000 * forsoeg));
      }
    }
    alle = alle.concat(svar.nodes);
    side++;
    efter = svar.pageInfo?.hasNextPage ? svar.pageInfo.endCursor : null;
  } while (efter && side < 10);
  return alle;
}

const tilWgs = g => ({
  type: "MultiPolygon",
  coordinates: (g.type === "Polygon" ? [g.coordinates] : g.coordinates)
    .map(p => p.map(r => r.map(([x, y]) => proj4("EPSG:25832", "EPSG:4326", [x, y]))))
});

// Fjern ringe/polygoner, som forenklingen har gjort for små, og afrund til ~1 m
const rens = f => {
  const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
    .map(p => p.filter(r => r.length >= 4))
    .filter(p => p.length && p[0].length >= 4)
    .map(p => p.map(r => r.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5])));
  f.geometry = { type: "MultiPolygon", coordinates: polys };
  return f;
};

const forenkl = f => {
  try { return turf.simplify(f, { tolerance: TOL, highQuality: false, mutate: true }); }
  catch (e) { return f; }
};

// turf 7 tager en FeatureCollection, turf 6 to features
const skaer = (a, b) => turf.intersect.length >= 2
  ? turf.intersect(a, b)
  : turf.intersect(turf.featureCollection([a, b]));

const overlap = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

function fejl(tekst) {
  console.error("STOP: " + tekst);
  console.error("Filerne er IKKE ændret.");
  process.exit(1);
}

console.log("Henter kommuner …");
const kn = await hentAlle("DAGI_Kommuneinddeling", "kommunekode navn");
const kommuner = kn.map(n => rens(forenkl({
  type: "Feature",
  properties: { kode: n.kommunekode, navn: n.navn },
  geometry: tilWgs(wellknown.parse(n.geometri.wkt))
}))).filter(f => f.geometry.coordinates.length)
  .sort((a, b) => a.properties.kode.localeCompare(b.properties.kode));

console.log("Henter postnumre …");
const pn = await hentAlle("DAGI_Postnummerinddeling", "postnummer navn");

console.log("Klipper postnumre til land og finder kommune …");
const kb = kommuner.map(k => ({ k, b: turf.bbox(k) }));
let uklippet = 0;
const postnumre = pn.map(p => {
  const f  = forenkl({ type: "Feature", properties: {}, geometry: tilWgs(wellknown.parse(p.geometri.wkt)) });
  const pb = turf.bbox(f);
  const stykker = []; let kommune = null, max = 0;
  for (const { k, b } of kb) {
    if (!overlap(pb, b)) continue;
    try {
      const s = skaer(f, k);
      if (!s) continue;
      const A = turf.area(s);
      stykker.push(s);
      if (A > max) { max = A; kommune = k.properties.kode; }
    } catch (e) { /* ugyldig geometri: springes over */ }
  }
  if (stykker.length) {
    f.geometry = { type: "MultiPolygon", coordinates: stykker.flatMap(s =>
      s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates) };
  } else uklippet++;
  f.properties = { nr: p.postnummer, navn: p.navn, kommune };
  return rens(f);
}).filter(f => f.geometry.coordinates.length)
  .sort((a, b) => a.properties.nr.localeCompare(b.properties.nr));

// ── Kontrol, før noget skrives ──────────────────────────────────
const iDK = (lat, lon) => kommuner.some(k => turf.booleanPointInPolygon(turf.point([lon, lat]), k));
if (kommuner.length < 95 || kommuner.length > 105) fejl(`${kommuner.length} kommuner (forventet ca. 99)`);
if (postnumre.length < 1000 || postnumre.length > 1300) fejl(`${postnumre.length} postnumre (forventet ca. 1090)`);
if (!iDK(55.709, 9.536))  fejl("Vejle ligger ikke i en kommune");
if (iDK(54.785, 9.437))   fejl("Flensborg ligger i en dansk kommune");
if (iDK(56.6, 11.3))      fejl("Kattegat ligger i en dansk kommune");
if (postnumre.find(p => p.properties.nr === "7100")?.properties.kommune !== "0630") fejl("7100 hører ikke til kommune 0630");
const utenKommune = postnumre.filter(p => !p.properties.kommune).length;
if (utenKommune > 20) fejl(`${utenKommune} postnumre uden kommune`);

// ── Skriv kun ved ændringer ─────────────────────────────────────
const idag = new Date().toISOString().slice(0, 10);
function skrivHvisAendret(fil, kilde, features) {
  let gammel = null;
  try { gammel = JSON.parse(fs.readFileSync(fil, "utf8")); } catch (e) { /* ny fil */ }
  if (gammel && JSON.stringify(gammel.features) === JSON.stringify(features)) {
    console.log(`${fil}: uændret (${features.length} stk)`);
    return false;
  }
  fs.writeFileSync(fil, JSON.stringify({ type: "FeatureCollection", kilde, hentet: idag, features }));
  console.log(`${fil}: OPDATERET (${features.length} stk, ${(fs.statSync(fil).size / 1024).toFixed(0)} kB)`);
  return true;
}
const k = skrivHvisAendret(FIL_K, "DAGI via Datafordeleren, forenklet", kommuner);
const p = skrivHvisAendret(FIL_P, "DAGI via Datafordeleren, forenklet og klippet til land", postnumre);
console.log(k || p ? "Der er ændringer — workflowet committer dem." : "Ingen ændringer.");

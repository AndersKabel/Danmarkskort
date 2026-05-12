/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

// Cloudflare proxy til VD-reference
const VD_PROXY = "https://vd-proxy.anderskabel8.workers.dev";

/*
 * OpenRouteService integration
 *
 * For at tilføje ruteplanlægning baseret på OpenStreetMap-data har vi
 * integreret OpenRouteService (ORS). ORS tilbyder en gratis plan med
 * 2.000 ruteopslag pr. dag og 40 pr. minut. Før du kan
 * anvende tjenesten skal du oprette en gratis konto og hente en API-nøgle.
 * Besøg https://openrouteservice.org/, opret en konto og generér en nøgle
 * under sektionen "API Keys" i din brugerprofil. Indsæt nøglen i
 * konstanten ORS_API_KEY nedenfor.
 */

// TODO: Indsæt din ORS API-nøgle her
const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImU2ZTA5ODhhNDE5MDQ1MjNiY2QwM2QyZjcyNWViZmU5IiwiaCI6Im11cm11cjY0In0=";

// Lag til at vise ruter fra ORS. Tilføjes til overlayMaps senere.
var routeLayer = L.layerGroup();

/**
 * Udtræk et repræsentativt punkt fra en vejgeometri
 * (beholdt som hjælper hvis du senere vil lave ruter ud fra vej-geometrier)
 */
function getRepresentativeCoordinate(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  let coords = geometry.coordinates;
  let firstLine = Array.isArray(coords[0]) ? coords[0] : null;
  if (!firstLine || firstLine.length === 0) return null;
  let firstCoord = firstLine[0];
  if (!firstCoord || firstCoord.length < 2) return null;
  let x = firstCoord[0];
  let y = firstCoord[1];
  if (Math.abs(x) > 90 || Math.abs(y) > 90) {
    let [lat, lon] = convertToWGS84(x, y);
    return [lat, lon];
  }
  return [firstCoord[1], firstCoord[0]];
}

/**
 * Hjælper: opdater "Start"-knappen med ORS-remaining
 */
function updateORSQuotaIndicator(remaining, limit) {
  const btn = document.getElementById("planRouteBtn");
  if (!btn) return;

  // Gem original tekst første gang
  if (!btn.dataset.baseText) {
    btn.dataset.baseText = btn.textContent.trim() || "Start";
  }
  const baseText = btn.dataset.baseText;

  if (remaining == null) {
    // Hvis vi ikke kan læse headeren, rør ikke ved teksten
    return;
  }

  const rem = parseInt(remaining, 10);
  if (isNaN(rem)) return;

  // Opdater knaptekst og tooltip
  btn.textContent = `${baseText} (${rem})`;
  if (limit != null) {
    const lim = parseInt(limit, 10);
    if (!isNaN(lim)) {
      btn.title = `ORS Directions: ${rem}/${lim} kald tilbage i denne periode`;
    } else {
      btn.title = `ORS Directions: ${rem} kald tilbage i denne periode`;
    }
  } else {
    btn.title = `ORS Directions: ${rem} kald tilbage i denne periode`;
  }
}
/**
 * Hjælper: opdater Udland/Geocode-tæller ved søgefeltet
 * Bruges af ORS Geocode Search / Reverse.
 */
function updateORSGeocodeQuotaIndicator(remaining, limit, reset) {
  const span = document.getElementById("orsGeocodeQuota");
  if (!span) return;

  // Vis kun tælleren, når Udland-checkboxen er slået til
  if (typeof foreignSearchToggle !== "undefined" && foreignSearchToggle && !foreignSearchToggle.checked) {
    span.style.display = "none";
    return;
  }

  if (remaining == null) {
    // Hvis vi ikke kan læse headeren, ryd teksten
    span.textContent = "";
    span.title = "";
    return;
  }

  const rem = parseInt(remaining, 10);
  const lim = limit != null ? parseInt(limit, 10) : null;
  if (isNaN(rem)) return;

  // Sørg for at tælleren er synlig, når vi har gyldige data
  span.style.display = "inline";

  // Kun tal – ingen "Geo"
  if (!isNaN(lim) && lim > 0) {
    span.textContent = `${rem}/${lim}`;
  } else {
    span.textContent = `${rem}`;
  }

  let tooltip = "OpenRouteService geocoding – resterende kald i denne periode";
  if (!isNaN(lim) && lim > 0) {
    tooltip += `: ${rem}/${lim}`;
  } else {
    tooltip += `: ${rem}`;
  }

  // Forsøg at udlede hvornår kvoten fornyes ud fra x-ratelimit-reset (hvis eksisterer)
  if (reset != null) {
    const resetNum = parseInt(reset, 10);
    if (!isNaN(resetNum) && resetNum > 0) {
      let resetDate;
      if (resetNum > 1e12) {
        // Millisekund Unix-timestamp
        resetDate = new Date(resetNum);
      } else if (resetNum > 1e9) {
        // Sekund Unix-timestamp
        resetDate = new Date(resetNum * 1000);
      } else {
        // Antal sekunder fra nu
        resetDate = new Date(Date.now() + resetNum * 1000);
      }
      const hh = String(resetDate.getHours()).padStart(2, "0");
      const mm = String(resetDate.getMinutes()).padStart(2, "0");
      tooltip += ` (fornyes ca. kl. ${hh}:${mm})`;
    }
  }

  span.title = tooltip;
}

/**
 * Hjælper: opdater Udland-tæller (geocode) ved søgefeltet
 * Bruger ORS' egne rate-limit headers, når de er tilgængelige.
 */
function updateORSGeocodeIndicator(remaining, limit, reset) {
  const el = document.getElementById("orsGeocodeQuota");
  if (!el) return;

  if (remaining == null) {
    el.textContent = "";
    el.title = "";
    return;
  }

  const rem = parseInt(remaining, 10);
  const lim = limit != null ? parseInt(limit, 10) : null;

  if (isNaN(rem)) {
    el.textContent = "";
    el.title = "";
    return;
  }

  if (!isNaN(lim)) {
    el.textContent = `${rem}/${lim}`;
    el.title = `ORS Geocode: ${rem}/${lim} kald tilbage i denne periode`;
  } else {
    el.textContent = `${rem}`;
    el.title = `ORS Geocode: ${rem} kald tilbage i denne periode`;
  }

  // Valgfrit: vis hvornår kvoten nulstilles, hvis ORS sender en reset-header
  if (reset != null && reset !== "") {
    const resetNum = parseInt(reset, 10);
    if (!isNaN(resetNum)) {
      const resetDate = new Date(resetNum * 1000);
      el.title += `\nNulstilles ca.: ${resetDate.toLocaleString()}`;
    }
  }
}

/**
 * Hjælper: kald ORS Directions API som GeoJSON
 * coordinates: array af [lon, lat]
 * profile: fx "driving-car", "cycling-regular"
 * preference: fx "fastest", "shortest", "recommended"
 * Returnerer { coords: [ [lon,lat], ... ], distance, duration }
 */
async function requestORSRoute(coordsArray, profile, preference) {
  const usedProfile =
    profile ||
    (document.getElementById("routeProfile")?.value || "driving-car");

  const url = `https://api.openrouteservice.org/v2/directions/${usedProfile}/geojson`;

  const bodyObj = { coordinates: coordsArray };
  if (preference) {
    bodyObj.preference = preference;
  } else {
    const prefSel = document.getElementById("routePreference");
    if (prefSel && prefSel.value) {
      bodyObj.preference = prefSel.value;
    }
  }

  const headers = {
    "Accept": "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
    "Authorization": ORS_API_KEY,
    "Content-Type": "application/json; charset=utf-8"
  };

  const body = JSON.stringify(bodyObj);

  const resp = await fetch(url, {
    method: "POST",
    headers: headers,
    body: body
  });

  // Forsøg at læse rate-limit headers til tæller på "Start"
  try {
    const remaining = resp.headers.get("x-ratelimit-remaining");
    const limit = resp.headers.get("x-ratelimit-limit");
    if (remaining != null) {
      updateORSQuotaIndicator(remaining, limit);
    }
  } catch (e) {
    console.warn("Kunne ikke læse ORS rate-limit headers:", e);
  }

  if (!resp.ok) {
    throw new Error(`ORS-fejl: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  if (!data.features || data.features.length === 0) {
    throw new Error("ORS returnerede ingen rute.");
  }

  const feature = data.features[0];
  const geom = feature.geometry;
  if (!geom || !Array.isArray(geom.coordinates)) {
    throw new Error("ORS returnerede ukendt geometri.");
  }

  const props = feature.properties || {};
  let distance = 0;
  let duration = 0;

  if (Array.isArray(props.segments) && props.segments.length > 0) {
    props.segments.forEach(seg => {
      if (typeof seg.distance === "number") distance += seg.distance;
      if (typeof seg.duration === "number") duration += seg.duration;
    });
  } else if (props.summary) {
    if (typeof props.summary.distance === "number") distance = props.summary.distance;
    if (typeof props.summary.duration === "number") duration = props.summary.duration;
  }

  return {
    coords: geom.coordinates, // [lon,lat]
    distance: distance,
    duration: duration
  };
}

/**
 * Hjælper: ORS geocoding (første resultat) til rute-felter
 */
async function geocodeORSFirst(text) {
  if (!ORS_API_KEY || ORS_API_KEY.includes("YOUR_ORS_API_KEY")) return null;
  try {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}&size=1`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("ORS geocode fejl:", resp.status, resp.statusText);
      return null;
    }

    try {
      const remaining = resp.headers.get("x-ratelimit-remaining");
      const limit = resp.headers.get("x-ratelimit-limit");
      const reset = resp.headers.get("x-ratelimit-reset");
      if (remaining != null) {
        updateORSGeocodeIndicator(remaining, limit, reset);
      }
    } catch (e) {
      console.warn("Kunne ikke læse ORS geocode rate-limit headers (geocodeORSFirst):", e);
    }

    const data = await resp.json();
    if (!data.features || data.features.length === 0) return null;
    const feat = data.features[0];
    const coords = feat.geometry && feat.geometry.coordinates;
    if (!coords || coords.length < 2) return null;
    const lon = coords[0];
    const lat = coords[1];
    return [lat, lon];
  } catch (err) {
    console.error("Fejl i geocodeORSFirst:", err);
    return null;
  }
}

/**
 * Hjælper: ORS geocoding til søgelisten (kun udenlandske adresser)
 */
/**
 * Hjælper: ORS geocoding til søgelisten (kun udenlandske adresser)
 */
async function geocodeORSForSearch(query) {
  if (!ORS_API_KEY || ORS_API_KEY.includes("YOUR_ORS_API_KEY")) return [];
  try {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}&size=5`;
    const resp = await fetch(url);

    // Opdater geocode-tæller ud fra headers (hvis de findes)
    try {
      const remaining = resp.headers.get("x-ratelimit-remaining");
      const limit = resp.headers.get("x-ratelimit-limit");
      const reset = resp.headers.get("x-ratelimit-reset");
      if (remaining != null) {
        updateORSGeocodeQuotaIndicator(remaining, limit, reset);
      }
    } catch (e) {
      console.warn("Kunne ikke læse ORS geocode rate-limit headers (search):", e);
    }

    if (!resp.ok) {
      console.error("ORS geocode (search) fejl:", resp.status, resp.statusText);
      return [];
    }
    const data = await resp.json();
    if (!data.features || data.features.length === 0) return [];

    return data.features
      .filter(feat => {
        const p = feat.properties || {};
        const country = (p.country || p.country_a || "").toString().toLowerCase();
        return country && !["danmark", "denmark", "dk", "dnk"].includes(country);
      })
      .map(feat => {
        const p = feat.properties || {};
        const coords = feat.geometry && feat.geometry.coordinates;
        const lon = coords?.[0];
        const lat = coords?.[1];
        let label =
          p.label ||
          `${p.street || p.name || ""} ${p.housenumber || ""}, ${p.postalcode || ""} ${p.locality || p.region || p.country || ""}`
            .replace(/\s+/g, " ")
            .trim();
        return {
          type: "ors_foreign",
          label,
          lat,
          lon,
          feature: feat
        };
      });
  } catch (err) {
    console.error("Fejl i geocodeORSForSearch:", err);
    return [];
  }
}

/**
 * Hjælper: ORS reverse geocoding (til klik i udlandet)
 */
/**
 * Hjælper: ORS reverse geocoding (til klik i udlandet)
 */
async function reverseGeocodeORS(lat, lon) {
  if (!ORS_API_KEY || ORS_API_KEY.includes("YOUR_ORS_API_KEY")) return null;
  try {
    const url = `https://api.openrouteservice.org/geocode/reverse?api_key=${ORS_API_KEY}&point.lat=${lat}&point.lon=${lon}&size=1`;
    const resp = await fetch(url);

    // Opdater geocode-tæller ud fra headers (hvis de findes)
    try {
      const remaining = resp.headers.get("x-ratelimit-remaining");
      const limit = resp.headers.get("x-ratelimit-limit");
      const reset = resp.headers.get("x-ratelimit-reset");
      if (remaining != null) {
        updateORSGeocodeQuotaIndicator(remaining, limit, reset);
      }
    } catch (e) {
      console.warn("Kunne ikke læse ORS geocode rate-limit headers (reverse):", e);
    }

    if (!resp.ok) {
      console.error("ORS reverse geocode fejl:", resp.status, resp.statusText);
      return null;
    }
    const data = await resp.json();
    if (!data.features || data.features.length === 0) return null;
    return data.features[0];
  } catch (err) {
    console.error("Fejl i reverseGeocodeORS:", err);
    return null;
  }
}

/**
 * Hjælper: er koordinat i DK (ca. bounding box)
 */
function isInDenmark(lat, lon) {
  return lat >= 54.3 && lat <= 58.0 && lon >= 7.5 && lon <= 15.5;
}
function isInDenmarkByPolygon(lat, lon) {
  if (!kommuneGeoJSON || !kommuneGeoJSON.features) {
    // Fallback til simpel bounding box, hvis kommunedata ikke er klar endnu
    return isInDenmark(lat, lon);
  }
  try {
    var point = turf.point([lon, lat]);
    for (var i = 0; i < kommuneGeoJSON.features.length; i++) {
      var feat = kommuneGeoJSON.features[i];
      if (turf.booleanPointInPolygon(point, feat)) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Fejl i isInDenmarkByPolygon:", e);
    return isInDenmark(lat, lon);
  }
}

/**
 * Hjælper: find koordinater (lat,lon) for en adresse-tekst
 * Bruger evt. allerede gemte koordinater, ellers Dataforsyningen
 * og falder tilbage til ORS geocoding for udenlandske adresser.
 */
async function resolveRouteCoord(text, cachedCoord) {
  if (cachedCoord && Array.isArray(cachedCoord) && cachedCoord.length === 2) {
    return cachedCoord;
  }
  if (!text || text.trim().length === 0) return null;

  try {
    const url = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(text)}&per_side=1`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!Array.isArray(data) || data.length === 0 || !data[0].adgangsadresse?.id) {
      // Fald tilbage til ORS, hvis DF ikke finder noget
      const orsCoord = await geocodeORSFirst(text);
      if (orsCoord) return orsCoord;
      return null;
    }

    const id = data[0].adgangsadresse.id;
    const detailResp = await fetch(`https://api.dataforsyningen.dk/adgangsadresser/${id}`);
    const detail = await detailResp.json();
    const coords = detail.adgangspunkt?.koordinater;
    if (!coords || coords.length < 2) return null;
    const lon = coords[0];
    const lat = coords[1];
    return [lat, lon];
  } catch (err) {
    console.error("Fejl i resolveRouteCoord:", err);
    // Sidste fallback: ORS
    const orsCoord = await geocodeORSFirst(text);
    if (orsCoord) return orsCoord;
    return null;
  }
}

/**
 * Planlæg rute ud fra rute-felterne (Fra / Til / Via)
 * Bruger OpenRouteService og tegner ruten på routeLayer.
 */
async function planRouteORS() {
  if (!ORS_API_KEY || ORS_API_KEY.includes("YOUR_ORS_API_KEY")) {
    alert("ORS API-nøgle mangler. Indsæt din nøgle i konstanten ORS_API_KEY i script.js.");
    return;
  }

  try {
    const fromText = routeFromInput ? routeFromInput.value.trim() : "";
    const toText   = routeToInput   ? routeToInput.value.trim()   : "";
    const viaText  = routeViaInput  ? routeViaInput.value.trim()  : "";

    if (!fromText || !toText) {
      alert("Angiv både 'Fra' og 'Til' adresse.");
      return;
    }

    const fromCoord = await resolveRouteCoord(fromText, routeFromCoord);
    const toCoord   = await resolveRouteCoord(toText, routeToCoord);
    let viaCoord    = null;
    if (viaText) {
      viaCoord = await resolveRouteCoord(viaText, routeViaCoord);
    }

    if (!fromCoord || !toCoord) {
      alert("Kunne ikke finde koordinater for en eller flere adresser.");
      return;
    }

    // Koordinater i ORS-format [lon, lat]
    const coordsArray = [];
    coordsArray.push([fromCoord[1], fromCoord[0]]);
    if (viaCoord) coordsArray.push([viaCoord[1], viaCoord[0]]);
    coordsArray.push([toCoord[1], toCoord[0]]);

    // Profil + præference fra dropdowns
    const profileSel = document.getElementById("routeProfile");
    const prefSel    = document.getElementById("routePreference");
    const profile    = profileSel ? profileSel.value : "driving-car";
    const preference = prefSel ? prefSel.value : "recommended";

    const routeInfo = await requestORSRoute(coordsArray, profile, preference);

    // Tegn ruten
    routeLayer.clearLayers();
    const latLngs = routeInfo.coords.map(c => [c[1], c[0]]);
    const poly = L.polyline(latLngs, {
      color: "blue",
      weight: 5,
      opacity: 1.7
    }).addTo(routeLayer);

    if (!map.hasLayer(routeLayer)) {
      routeLayer.addTo(map);
    }
    map.fitBounds(poly.getBounds());

    const routeSummaryEl = document.getElementById("routeSummary");
    if (routeSummaryEl) {
      let parts = [];
      if (routeInfo.distance != null) {
        const km = routeInfo.distance / 1000;
        parts.push(`Længde: ${km.toFixed(1)} km`);
      }
      if (routeInfo.duration != null) {
        const min = Math.round(routeInfo.duration / 60);
        parts.push(`Tid: ca. ${min} min`);
      }
      routeSummaryEl.textContent = parts.join(" | ");
    }
  } catch (err) {
    console.error("ORS ruteplanlægningsfejl:", err);
    alert("Der opstod en fejl ved beregning af ruten. Se konsollen (F12) for detaljer.");
  }
}

function convertToWGS84(x, y) {
  let result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  console.log("convertToWGS84 output:", result);
  return [result[1], result[0]];
}
// ── Custom Places ─────────────────────────────────────────────────
// Indlæses fra repo-filen "CustomPlaces.json" (hvis den findes)
// + lokalt gemte steder i localStorage
var customPlaces = [];

function _cpLoadLocal() {
  try {
    const raw = localStorage.getItem("customPlaces");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _cpSaveLocal(places) {
  localStorage.setItem("customPlaces", JSON.stringify(places));
}

// Tilføj et custom place (kaldes fra søgeresultat-UI)
// ── Custom Places: gem direkte til GitHub ────────────────────────
// Repo-info udledes automatisk fra URL (f.eks. anderskabel.github.io/Danmarkskort/)
const _cpOwner = window.location.hostname.split(".")[0];
const _cpRepo  = window.location.pathname.split("/").filter(Boolean)[0] || "Danmarkskort";
const _cpFile  = "CustomPlaces.json";
const _cpApi   = `https://api.github.com/repos/${_cpOwner}/${_cpRepo}/contents/${_cpFile}`;

function _cpGetToken() {
  let t = localStorage.getItem("gh_cp_token");
  if (!t) {
    t = prompt(
      "Første gang: indtast et GitHub Personal Access Token\n" +
      "(github.com → Settings → Developer settings → Fine-grained tokens\n" +
      " → Contents: Read and write på " + _cpRepo + ")"
    );
    if (t) localStorage.setItem("gh_cp_token", t.trim());
  }
  return t ? t.trim() : null;
}

async function _cpSaveToRepo(place) {
  const token = _cpGetToken();
  if (!token) return false;

  const headers = {
    "Authorization": "token " + token,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };

  try {
    // Hent nuværende fil + SHA
    const getResp = await fetch(_cpApi, { headers });
    let sha = null;
    let existing = [];

    if (getResp.ok) {
      const info = await getResp.json();
      sha = info.sha;
      // GitHub returnerer base64 – decode korrekt (UTF-8)
      const bytes = Uint8Array.from(atob(info.content.replace(/\n/g, "")), c => c.charCodeAt(0));
      existing = JSON.parse(new TextDecoder().decode(bytes));
    } else if (getResp.status === 401) {
      localStorage.removeItem("gh_cp_token");
      alert("Ugyldigt token — prøv igen.");
      return false;
    }

    // Tjek for dubletter på navn
    if (existing.some(p => p.navn?.toLowerCase() === place.navn?.toLowerCase())) {
      alert(`"${place.navn}" findes allerede i CustomPlaces.json.`);
      return false;
    }

    // Tilføj nyt sted (bevar template-poster)
    existing.push(place);

    // Encode til base64 (UTF-8 sikker)
    const json    = JSON.stringify(existing, null, 2);
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(json)));

    const putResp = await fetch(_cpApi, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Tilføj sted: ${place.navn}`,
        content: encoded,
        ...(sha ? { sha } : {})
      })
    });

    if (!putResp.ok) {
      const err = await putResp.json();
      if (putResp.status === 401) localStorage.removeItem("gh_cp_token");
      alert("Fejl ved gem: " + (err.message || putResp.status));
      return false;
    }

    return true;
  } catch (e) {
    console.error("GitHub API fejl:", e);
    alert("Netværksfejl — stedet blev ikke gemt.");
    return false;
  }
}

function addCustomPlace(place) {
  // Sæt coords så placeMarkerAndZoom virker ved søgning
  if (!place.coords && place.lat && place.lon) {
    place.coords = [place.lat, place.lon];
  }
  customPlaces = customPlaces.filter(p => p.navn !== place.navn);
  customPlaces.push(place);
  localStorage.removeItem("customPlaces");
  console.log(`✅ Custom place tilføjet i hukommelse: "${place.navn}"`);
}

// Eksportér alle gemte steder som JSON (download)
function exportCustomPlaces() {
  const all = [...customPlaces];
  const local = _cpLoadLocal();
  // Merge: tilføj lokale der ikke allerede er i all
  local.forEach(lp => {
    if (!all.some(p => p.lat === lp.lat && p.lon === lp.lon)) all.push(lp);
  });
  const json = JSON.stringify(all, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "CustomPlaces.json";
  a.click();
}

// Hent fra repo-fil (hvis den findes) og merge med lokale
fetch("CustomPlaces.json")
  .then(response => {
    if (!response.ok) {
      console.warn("CustomPlaces.json ikke fundet (HTTP " + response.status + ")");
      return null;
    }
    return response.text(); // Hent som tekst først så vi kan fange parse-fejl
  })
  .then(text => {
    if (!text) { customPlaces = _cpLoadLocal(); return; }
    let data;
    try {
      data = JSON.parse(text);
    } catch(parseErr) {
      console.error("❌ CustomPlaces.json er ugyldig JSON:", parseErr.message);
      console.error("Fil-indhold (første 200 tegn):", text.slice(0, 200));
      customPlaces = _cpLoadLocal();
      return;
    }
    if (!Array.isArray(data)) { console.error("CustomPlaces.json er ikke et array:", typeof data); return; }
    const fromFile = data.filter(p => !p.template && !p.isTemplate).map(p => {
      if (typeof p.lat === "number" && typeof p.lon === "number") p.coords = [p.lat, p.lon];
      return p;
    });
    const local = _cpLoadLocal();
    const extra = local.filter(lp => !fromFile.some(fp =>
      fp.navn?.toLowerCase() === lp.navn?.toLowerCase() ||
      (Math.abs(fp.lat - lp.lat) < 0.001 && Math.abs(fp.lon - lp.lon) < 0.001)
    ));
    customPlaces = [...fromFile, ...extra];
    console.log("✅ Custom places loadet:", customPlaces.map(p => p.navn));
  })
  .catch(err => console.warn("CustomPlaces netværksfejl:", err.message));

/***************************************************
 * Hjælpefunktion til at kopiere tekst til clipboard
 ***************************************************/
function copyToClipboard(str) {
  let finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr)
    .then(() => {
      console.log("Copied to clipboard:", finalStr);
    })
    .catch(err => {
      console.error("Could not copy text:", err);
    });
}

/***************************************************
 * Funktion til visning af kopieret popup
 ***************************************************/
function showCopyPopup(message) {
  let popup = document.createElement('div');
  popup.textContent = message;
  popup.style.position = "fixed";
  popup.style.top = "20px";
  popup.style.left = "50%";
  popup.style.transform = "translateX(-50%)";
  popup.style.background = "rgba(0,0,0,0.7)";
  popup.style.color = "white";
  popup.style.padding = "10px 15px";
  popup.style.borderRadius = "5px";
  popup.style.zIndex = "1000";
  document.body.appendChild(popup);
  setTimeout(function() {
    if (popup.parentElement) {
      popup.parentElement.removeChild(popup);
    }
  }, 1500);
}

/***************************************************
 * Funktion til beregning af sorteringsprioritet
 ***************************************************/
function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse") {
    text = item.tekst || "";
  } else if (item.type === "stednavn") {
    text = item.navn || "";
  } else if (item.type === "strandpost") {
    text = item.tekst || "";
  } else if (item.type === "navngivenvej") {
    text = item.navn || "";
  } else if (item.type === "custom") {
    text = item.navn || "";
  } else if (item.type === "ors_foreign") {
    text = item.label || "";
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText === lowerQuery) {
    return 0;
  } else if (lowerText.startsWith(lowerQuery)) {
    return 1;
  } else if (lowerText.includes(lowerQuery)) {
    return 2;
  } else {
    return 3;
  }
}

function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const context = this;
    timeoutId = setTimeout(function() {
      fn.apply(context, args);
    }, delay);
  };
}

/***************************************************
 * Funktioner til automatisk dataopdatering (24 timer)
 ***************************************************/
function getLastUpdated() {
  return localStorage.getItem("strandposterLastUpdated");
}

function setLastUpdated() {
  localStorage.setItem("strandposterLastUpdated", Date.now());
}

function shouldUpdateData() {
  const lastUpdated = getLastUpdated();
  if (!lastUpdated) {
    return true;
  }
  return Date.now() - parseInt(lastUpdated, 10) > 86400000;
}

/***************************************************
 * Opret Leaflet-kort og lag
 ***************************************************/
var map = L.map('map', {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '© <a href="https://bykabel.dk" target="_blank">ByKabel</a> | © OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur, © CVR API'
  }
).addTo(map);

var ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  {
    layers: "orto_foraar",
    format: "image/jpeg",
    transparent: false,
    version: "1.1.1",
    attribution: "Ortofoto © Kortforsyningen"
  }
);

/***************************************************
 * Vejrlag – OpenWeatherMap tiles
 * Kræver egen API-nøgle fra https://openweathermap.org/api
 ***************************************************/
// ── Vejrlag ──────────────────────────────────────────────────────
// RainViewer: gratis nedbørsradar, ingen API-nøgle, opdateret hvert 10. min
var rainViewerLayer = null;
var rainViewerTimestamp = null;

async function initRainViewer() {
  try {
    const resp = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    const data = await resp.json();
    const frames = data.radar?.past || [];
    if (!frames.length) return;
    const latest = frames[frames.length - 1];
    rainViewerTimestamp = latest.time;
    rainViewerLayer = L.tileLayer(
      `https://tilecache.rainviewer.com${latest.path}/512/{z}/{x}/{y}/4/1_1.png`,
      { opacity: 0.7, attribution: "Nedbørsradar © RainViewer", tileSize: 512, zoomOffset: -1 }
    );
    // Opdater hvert 10. min automatisk
    setInterval(async () => {
      try {
        const r2 = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        const d2 = await r2.json();
        const f2 = d2.radar?.past || [];
        if (!f2.length) return;
        const last = f2[f2.length - 1];
        if (last.time === rainViewerTimestamp) return;
        rainViewerTimestamp = last.time;
        if (map.hasLayer(rainViewerLayer)) {
          const newLayer = L.tileLayer(
            `https://tilecache.rainviewer.com${last.path}/512/{z}/{x}/{y}/4/1_1.png`,
            { opacity: 0.7, attribution: "Nedbørsradar © RainViewer", tileSize: 512, zoomOffset: -1 }
          );
          map.addLayer(newLayer);
          map.removeLayer(rainViewerLayer);
          rainViewerLayer = newLayer;
        }
      } catch(e) {}
    }, 10 * 60 * 1000);
    console.log("✅ RainViewer nedbørsradar klar");
  } catch(err) {
    console.warn("RainViewer kunne ikke initialiseres:", err.message);
  }
}
initRainViewer();

// OWM temperatur (stadig nyttig som supplement)
const OWM_API_KEY = "71886b99dfc71fdd19c9825cf0b995c1";
var weatherTempLayer = null;
var weatherPrecipLayer = null;
var weatherRainLayer = null;
if (OWM_API_KEY && OWM_API_KEY.trim() !== "") {
  weatherTempLayer = L.tileLayer(
    `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`,
    { opacity: 0.5, attribution: "Temperatur © OpenWeatherMap" }
  );
}

// ── DMI Temperatur ───────────────────────────────────────────────
// Nyt DMI API (dec 2025) — ingen API-nøgle nødvendig!
// Gammelt endpoint (dmigw.govcloud.dk) pensioneres 30. juni 2026

var dmiTempLayer    = L.layerGroup();
var dmiTempInterval = null;

async function loadDmiTemperatur() {
  try {
    // Nyt gratis endpoint uden API-nøgle
    const url = "https://opendataapi.dmi.dk/v2/metObs/collections/observation/items" +
      "?parameterId=temp_dry&period=latest-hour&limit=300";
    const resp = await fetch(url);
    if (!resp.ok) { console.warn("DMI API fejlede:", resp.status); return; }
    const data = await resp.json();

    dmiTempLayer.clearLayers();
    (data.features || []).forEach(f => {
      const temp = f.properties?.value;
      if (temp == null) return;
      const [lon, lat] = f.geometry.coordinates;
      const t = Math.round(temp * 10) / 10;
      const color = t < 0   ? "#6fb3f7" :
                    t < 5   ? "#a8d8ea" :
                    t < 10  ? "#b8e4a1" :
                    t < 15  ? "#f7e27a" :
                    t < 20  ? "#f4a147" : "#e84040";

      L.circleMarker([lat, lon], {
        radius: 14, color: "#fff", weight: 1.5,
        fillColor: color, fillOpacity: 0.9
      })
      .bindTooltip(`${t > 0 ? "+" : ""}${t}°C`, {
        permanent: true, direction: "center",
        className: "dmi-temp-label"
      })
      .addTo(dmiTempLayer);
    });
    console.log(`✅ DMI temperatur opdateret: ${(data.features||[]).length} stationer`);
  } catch(e) {
    console.warn("DMI temperatur fejl:", e.message);
  }
}

// ── Live Trafik (VD GeoJSON) ─────────────────────────────────────
// Data hentes fra VDs eget trafikkort via vd-proxy (CORS fix)
// Ingen API-nøgle nødvendig — samme data som trafikkort.vejdirektoratet.dk
var vdTrafikLayer    = L.layerGroup();
var vdTrafikInterval = null;
var _vdGeoJsonLayers = [];

const VD_TRAFIK_FILER = [
  // Aktuelle hændelser
  { file: "current-blocking-roadwork.line.json", ikon: "🚫", label: "Spærring (linje)",    color: "#c0392b", weight: 5 },
  { file: "current-blocking-roadwork.area.json", ikon: "🚫", label: "Spærring (område)",   color: "#c0392b", weight: 3 },
  { file: "current-roadwork.line.json",          ikon: "🚧", label: "Vejarbejde",          color: "#e67e22", weight: 4 },
  { file: "current-queue.line.json",             ikon: "🚗", label: "Kø/Trængsel",         color: "#e74c3c", weight: 5 },
  // Kommende
  { file: "future-blocking-roadwork.line.json",  ikon: "📅", label: "Kommende spærring",   color: "#8e44ad", weight: 4 },
  { file: "future-roadwork.line.json",           ikon: "📅", label: "Kommende vejarbejde", color: "#9b59b6", weight: 3 },
  // Advarsler
  { file: "dmi-warnings.json",                   ikon: "⚠️", label: "DMI Advarsel",        color: "#2980b9", weight: 3 },
];

async function _fetchVdFil(file) {
  const resp = await fetch(`${VD_PROXY}/trafik/${file}`);
  if (!resp.ok) throw new Error(`${file}: HTTP ${resp.status}`);
  return resp.json();
}

async function loadVdTrafik() {
  vdTrafikLayer.clearLayers();
  _vdGeoJsonLayers = [];

  let total = 0;
  for (const { file, ikon, label, color } of VD_TRAFIK_FILER) {
    try {
      const data = await _fetchVdFil(file);
      if (!data?.features?.length) continue;

      const layer = L.geoJSON(data, {
        style: { color, weight: 4, opacity: 0.8 },
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 8, color, fillColor: color,
          fillOpacity: 0.9, weight: 2
        }),
        onEachFeature: (f, lyr) => {
          const p = f.properties || {};
          const titel  = p.title  || p.Title  || p.name || label;
          const vej    = p.road   || p.Road   || p.vejnavn || "";
          const fra    = p.startDate || p.StartDate || "";
          const til    = p.endDate   || p.EndDate   || "";
          const tekst  = p.description || p.Description || p.text || "";
          lyr.bindPopup(
            `<strong>${ikon} ${titel}</strong>` +
            (vej  ? `<br>📍 ${vej}` : "") +
            (fra  ? `<br>📅 ${fra.slice(0,10)} → ${til.slice(0,10)}` : "") +
            (tekst? `<br>${tekst.slice(0,200)}` : "")
          );
        }
      });
      layer.addTo(vdTrafikLayer);
      _vdGeoJsonLayers.push(layer);
      total += data.features.length;
    } catch(e) {
      console.warn(`VD Trafik ${file}:`, e.message);
    }
  }
  console.log(`✅ VD Trafik: ${total} elementer`);
}

// Start lag-indlæsning ved overlayadd
function _startDmiInterval() {
  loadDmiTemperatur();
  if (!dmiTempInterval) dmiTempInterval = setInterval(loadDmiTemperatur, 10 * 60 * 1000);
}
function _startVdInterval() {
  loadVdTrafik();
  if (!vdTrafikInterval) vdTrafikInterval = setInterval(loadVdTrafik, 5 * 60 * 1000);
}

var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

var rutenummerLayer = L.tileLayer.wms("https://geocloud.vd.dk/VM/wms", {
  layers: "rutenummereret-vejnet",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "© Vejdirektoratet"
});

/***************************************************
 * Falck Ass-lag
 ***************************************************/
var falckAssLayer = L.geoJSON(null, {
  onEachFeature: function(feature, layer) {
    let tekst = feature.properties.tekst || "Falck Ass";
    layer.bindPopup("<strong>" + tekst + "</strong>");
  },
  style: function() {
    return { color: "orange" };
  }
});

fetch("FalckStationer_data.json")
  .then(response => response.json())
  .then(data => {
    falckAssLayer.addData(data);
    console.log("Falck Ass data loaded", data);
  })
  .catch(err => console.error("Fejl ved hentning af Falck Ass data:", err));

/***************************************************
 * Kommunegrænser
 ***************************************************/
var kommunegrænserLayer = L.geoJSON(null, {
  style: function() {
    return {
      color: "#3388ff",
      weight: 2,
      fillOpacity: 0
    };
  }
});
var kommuneGeoJSON = null;

fetch("https://api.dataforsyningen.dk/kommuner?format=geojson")
  .then(response => response.json())
  .then(data => {
    kommunegrænserLayer.addData(data);
    kommuneGeoJSON = data;
    console.log("Kommunegrænser hentet:", data);
    initLeverandoerModul();
  })
  .catch(err => console.error("Fejl ved hentning af kommunegrænser:", err));

/***************************************************
 * Lagkontrol / overlays
 ***************************************************/
var dbSmsLayer     = L.layerGroup();
var dbJournalLayer = L.layerGroup();
var border25Layer  = L.layerGroup();
var chargeMapLayer = L.layerGroup();

// NYT: lag til at samle ekstra markører, når "Behold markører" er slået til
var keepMarkersLayer   = L.layerGroup();
var keepMarkersEnabled = false;

// Global reference til "seneste" markør (bruges bl.a. til radius)
var currentMarker;

var originalBorderCoords = [];
fetch("dansk-tysk-grænse.geojson")
  .then(r => r.json())
  .then(g => {
    originalBorderCoords = g.features[0].geometry.coordinates;
    var offsetCoords = originalBorderCoords.map(function(coord) {
      var lon = coord[0], lat = coord[1];
      var [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
      y -= 25000;
      var [lon2, lat2] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
      return [lat2, lon2];
    });
    L.polyline(offsetCoords, {
      color: 'red',
      weight: 2,
      dashArray: '5,5'
    }).addTo(border25Layer);
  });

fetch("svensk-grænse.geojson")
  .then(r => r.json())
  .then(g => {
    var coords = g.features[0].geometry.coordinates;
    var swOffset = coords.map(function(coord) {
      var lon = coord[0], lat = coord[1];
      var [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
      y += 25000;
      var [lon2, lat2] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
      return [lat2, lon2];
    });
    L.polyline(swOffset, {
      color: 'red',
      weight: 2,
      dashArray: '5,5'
    }).addTo(border25Layer);
  });

const baseMaps = {
  "OpenStreetMap": osmLayer,
  "Satellit": ortofotoLayer
};

const overlayMaps = {
  "Strandposter": redningsnrLayer,
  "Falck Ass": falckAssLayer,
  "Kommunegrænser": kommunegrænserLayer,
  "DB SMS kort": dbSmsLayer,
  "DB Journal": dbJournalLayer,
  "25 km grænse": border25Layer,
  "Ladestandere": chargeMapLayer,
  "Rutenummereret vejnet": rutenummerLayer,
  // NYT: overlay til at beholde markører
  "Behold markører": keepMarkersLayer
};
// Tilføj vejrlag, hvis API-nøgle er sat
// RainViewer tilføjes når det er loadet (async)
if (weatherTempLayer) overlayMaps["Temperatur (OWM)"] = weatherTempLayer;
overlayMaps["🌡 Temperatur (DMI)"] = dmiTempLayer;
overlayMaps["🚦 Live Trafik (VD)"] = vdTrafikLayer;

const _rvInterval = setInterval(() => {
  if (rainViewerLayer) {
    clearInterval(_rvInterval);
    overlayMaps["🌧 Nedbørsradar"] = rainViewerLayer;
    if (typeof layerControl !== "undefined") {
      layerControl.addOverlay(rainViewerLayer, "🌧 Nedbørsradar");
    }
  }
}, 500);
const layerControl = L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

// ── Custom Place knap ────────────────────────────────────────────
document.getElementById("cpOpenBtn").addEventListener("click", _cpOpenModal);

// ── Custom Place modal-logik ──────────────────────────────────────
let _cpPickMode = false;

function _cpOpenModal() {
  document.getElementById("cpModal").style.display = "flex";
  document.getElementById("cpError").style.display = "none";
  document.getElementById("cpPickHint").style.display = "none";
}

document.getElementById("cpModalClose").addEventListener("click", _cpCloseModal);
const _cpClose2 = document.getElementById("cpModalClose2");
if (_cpClose2) _cpClose2.addEventListener("click", _cpCloseModal);
const _cpHintCancel = document.getElementById("cpMapHintCancel");
if (_cpHintCancel) _cpHintCancel.addEventListener("click", function() { _cpSetPickMode(false); });
document.getElementById("cpModal").addEventListener("click", function(e) {
  if (e.target === this) _cpCloseModal();
});

function _cpCloseModal() {
  _cpPickMode = false;
  document.getElementById("cpModal").style.display    = "none";
  const hint = document.getElementById("cpMapHint");
  if (hint) hint.style.display = "none";
  map.getContainer().style.cursor = "";
}

// Klik-på-kort til koordinater
document.getElementById("cpPickBtn").addEventListener("click", function() {
  _cpSetPickMode(!_cpPickMode);
});

function _cpSetPickMode(on) {
  _cpPickMode = on;
  document.getElementById("cpModal").style.display = on ? "none" : "flex";
  const hint = document.getElementById("cpMapHint");
  if (hint) hint.style.display = on ? "block" : "none";
  map.getContainer().style.cursor = on ? "crosshair" : "";
}

map.on("click", function(e) {
  if (!_cpPickMode) return;
  document.getElementById("cpLat").value = e.latlng.lat.toFixed(6);
  document.getElementById("cpLon").value = e.latlng.lng.toFixed(6);
  _cpSetPickMode(false); // Viser modal + skjuler hint
});

// Gem sted
document.getElementById("cpGem").addEventListener("click", async function() {
  const navn     = document.getElementById("cpNavn").value.trim();
  const kategori = document.getElementById("cpKategori").value;
  const lat      = parseFloat(document.getElementById("cpLat").value);
  const lon      = parseFloat(document.getElementById("cpLon").value);
  const errEl    = document.getElementById("cpError");

  if (!navn) { errEl.textContent = "Navn er påkrævet."; errEl.style.display = "block"; return; }
  if (isNaN(lat) || isNaN(lon)) { errEl.textContent = "Koordinater mangler — brug 📍 Klik på kort."; errEl.style.display = "block"; return; }
  errEl.style.display = "none";

  const place = {
    id: navn.toLowerCase().replace(/[^a-z0-9æøå]/g, "_") + "_" + Date.now(),
    kategori, navn, kortnavn: navn, lat, lon, adresse: ""
  };

  const gemBtn = document.getElementById("cpGem");
  gemBtn.textContent = "⏳ Gemmer…";
  gemBtn.disabled = true;

  const ok = await _cpSaveToRepo(place);
  gemBtn.textContent = "⭐ Gem sted";
  gemBtn.disabled = false;

  if (ok) {
    addCustomPlace(place);
    ["cpNavn","cpLat","cpLon"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("cpKategori").value = "sevaerdighed";
    _cpCloseModal();
    const toast = document.createElement("div");
    toast.textContent = `✅ "${place.navn}" er gemt i repo'et`;
    toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#27ae60;color:#fff;padding:10px 22px;border-radius:8px;z-index:9999;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }
});



map.on('overlayadd', function(e) {
  if (e.layer === dbSmsLayer) {
    window.open('https://kort.dyrenesbeskyttelse.dk/db/dvc.nsf/kort', '_blank');
    // setTimeout: undgår Leaflet bug hvor sync removeLayer forstyrrer layer control state
    setTimeout(() => map.removeLayer(dbSmsLayer), 50);
  } else if (e.layer === dbJournalLayer) {
    window.open('https://dvc.dyrenesbeskyttelse.dk/db/dvc.nsf/Efter%20journalnr?OpenView', '_blank');
    setTimeout(() => map.removeLayer(dbJournalLayer), 50);
  } else if (e.name === "Strandposter" || e.layer === redningsnrLayer) {
    if (allStrandposter.length === 0) fetchAllStrandposter();
  } else if (e.layer === dmiTempLayer) {
    _startDmiInterval();
  } else if (e.layer === vdTrafikLayer) {
    _startVdInterval();
  } else if (e.layer === chargeMapLayer) {
    if (!selectedRadius) {
      alert("Vælg radius først");
      chargeMapLayer.clearLayers();
      return;
    }

    chargeMapLayer.clearLayers();
    const center = currentMarker.getLatLng();
    const lat = center.lat, lon = center.lng;
    const distKm = selectedRadius / 1000;

    fetch(
      'https://api.openchargemap.io/v3/poi/?output=json' +
      '&countrycode=DK' +
      '&maxresults=10000' +
      `&latitude=${lat}` +
      `&longitude=${lon}` +
      `&distance=${distKm}` +
      `&distanceunit=KM` +
      '&key=3c33b286-7067-426b-8e46-a727dd12f6f3'
    )
    .then(r => r.json())
    .then(data => {
      data.forEach(point => {
        const lat = point.AddressInfo?.Latitude;
        const lon = point.AddressInfo?.Longitude;
        if (lat && lon && currentMarker &&
            map.distance(currentMarker.getLatLng(), L.latLng(lat, lon)) <= selectedRadius) {
          L.circleMarker([lat, lon], {
            radius: 8,
            color: 'yellow',
            fillColor: 'yellow',
            fillOpacity: 1
          })
          .bindPopup(/* din popup-kode her */)
          .addTo(chargeMapLayer);
        }
      });
    })
    .catch(err => console.error('Fejl ved hentning af ladestandere:', err));
  } else if (e.layer === keepMarkersLayer) {
    // Når "Behold markører" slås til, går vi i multi-markør-tilstand
    keepMarkersEnabled = true;

    // Hvis der allerede findes en aktuel markør, flyttes den over i laget
    if (currentMarker) {
      if (map.hasLayer(currentMarker)) {
        map.removeLayer(currentMarker);
      }
      keepMarkersLayer.addLayer(currentMarker);
    }
  }
});

// Når overlayet "Behold markører" slås FRA, rydder vi alle ekstra markører
map.on('overlayremove', function(e) {
  if (e.layer === keepMarkersLayer) {
    keepMarkersEnabled = false;
    keepMarkersLayer.clearLayers();
    if (currentMarker && map.hasLayer(currentMarker)) {
      map.removeLayer(currentMarker);
    }
    currentMarker = null;
  } else if (e.layer === dmiTempLayer) {
    if (dmiTempInterval) { clearInterval(dmiTempInterval); dmiTempInterval = null; }
    dmiTempLayer.clearLayers();
  } else if (e.layer === vdTrafikLayer) {
    if (vdTrafikInterval) { clearInterval(vdTrafikInterval); vdTrafikInterval = null; }
    vdTrafikLayer.clearLayers();
  }
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

/***************************************************
 * Kommune­data hentet fra "Kommuner.xlsx"
 ***************************************************/
let kommuneInfo = {};

fetch("kommunedata.json")
  .then(r => r.json())
  .then(data => {
    kommuneInfo = data;
    console.log("Kommunedata indlæst:", kommuneInfo);
  })
  .catch(err => console.error("Fejl ved hentning af kommunedata:", err));

/***************************************************
 * Nulstil / sæt koordinatboks
 ***************************************************/
function resetCoordinateBox() {
  const coordinateBox = document.getElementById("coordinateBox");
  coordinateBox.textContent = "";
  coordinateBox.style.display = "none";
}

function setCoordinateBox(lat, lon) {
  const coordinateBox = document.getElementById("coordinateBox");
  let latFixed = lat.toFixed(6);
  let lonFixed = lon.toFixed(6);
  coordinateBox.innerHTML = `
    Koordinater: 
    <span id="latVal">${latFixed}</span>, 
    <span id="lonVal">${lonFixed}</span>
  `;
  coordinateBox.style.display = "block";
  const latSpan = document.getElementById("latVal");
  const lonSpan = document.getElementById("lonVal");
  function handleCoordClick() {
    latSpan.style.color = "red";
    lonSpan.style.color = "red";
    const coordsToCopy = `${latFixed},${lonFixed}`;
    navigator.clipboard.writeText(coordsToCopy)
      .then(() => {
        console.log("Copied coords:", coordsToCopy);
      })
      .catch(err => console.error("Could not copy coords:", err));
    setTimeout(() => {
      latSpan.style.color = "";
      lonSpan.style.color = "";
    }, 1000);
  }
  latSpan.addEventListener("click", handleCoordClick);
  lonSpan.addEventListener("click", handleCoordClick);
}

/***************************************************
 * Hjælper: opret/opdater "aktuel markør"
 * Respekterer keepMarkersEnabled / keepMarkersLayer
 ***************************************************/
function createSelectionMarker(lat, lon) {
  if (!keepMarkersEnabled) {
    // Normal tilstand: kun én markør – fjern den gamle
    if (currentMarker && map.hasLayer(currentMarker)) {
      map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);
  } else {
    // Multi-markør-tilstand: behold alle markører i keepMarkersLayer
    const m = L.marker([lat, lon]);
    keepMarkersLayer.addLayer(m);
    currentMarker = m;
  }
  return currentMarker;
}

/***************************************************
 * Strandposter – global cache
 ***************************************************/
var allStrandposter = [];
var strandposterReady = false;
function fetchAllStrandposter() {
  const localUrl = "Strandposter";
  console.log("Henter alle strandposter fra lokal fil:", localUrl);
  return fetch(localUrl)
    .then(resp => resp.json())
    .then(geojson => {
      if (geojson.features) {
        allStrandposter = geojson.features;
        strandposterReady = true;
        console.log("Alle strandposter hentet fra lokal fil:", allStrandposter);
        setLastUpdated();
      } else {
        console.warn("Ingen strandposter modtaget fra lokal fil.");
      }
    })
    .catch(err => {
      console.error("Fejl ved hentning af lokal strandposter-fil:", err);
    });
}
// Strandposter-logik håndteres i overlayadd-handleren ovenfor

/***************************************************
 * Klik på kort => reverse geocoding
 ***************************************************/
map.on('click', function(e) {
  if (_cpPickMode) return; // Koordinat-valg aktiv
  let lat = e.latlng.lat;
  let lon = e.latlng.lng;

  // Brug fælles helper, så den respekterer "Behold markører"
  createSelectionMarker(lat, lon);

  setCoordinateBox(lat, lon);

  if (isInDenmarkByPolygon(lat, lon)) {
    // DK: Dataforsyningen
    let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
    fetch(revUrl)
      .then(r => r.json())
      .then(data => {
        updateInfoBox(data, lat, lon);
        fillRouteFieldsFromClick(data, lat, lon);
      })
      .catch(err => console.error("Reverse geocoding fejl:", err));
  } else {
    // Udland: ORS reverse geocoding
    reverseGeocodeORS(lat, lon)
      .then(feature => {
        if (!feature) return;

        updateInfoBoxForeign(feature, lat, lon);

        const p = feature.properties || {};
        const norm = {
          vejnavn: p.street || p.name || "",
          husnr: p.housenumber || "",
          postnr: p.postalcode || "",
          postnrnavn: p.locality || p.region || p.country || ""
        };
        fillRouteFieldsFromClick(norm, lat, lon);
      })
      .catch(err => console.error("ORS reverse geocoding fejl:", err));
  }
});

/***************************************************
 * updateInfoBox for danske adresser
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");
  const overlay        = document.getElementById("kommuneOverlay");
  
  let adresseStr, vejkode, kommunekode;
  let evaFormat, notesFormat;
  
  if (data.adgangsadresse) {
    adresseStr = data.adgangsadresse.adressebetegnelse || 
                 `${data.adgangsadresse.vejnavn || ""} ${data.adgangsadresse.husnr || ""}, ${data.adgangsadresse.postnr || ""} ${data.adgangsadresse.postnrnavn || ""}`;
    evaFormat   = `${data.adgangsadresse.vejnavn || ""},${data.adgangsadresse.husnr || ""},${data.adgangsadresse.postnr || ""}`;
    notesFormat = `${data.adgangsadresse.vejnavn || ""} ${data.adgangsadresse.husnr || ""}, ${data.adgangsadresse.postnr || ""} ${data.adgangsadresse.postnrnavn || ""}`;
    vejkode     = data.adgangsadresse.vejkode || "?";
    kommunekode = data.adgangsadresse.kommunekode || "?";
  } else if (data.adressebetegnelse) {
    adresseStr  = data.adressebetegnelse;
    evaFormat   = "?, ?, ?";
    notesFormat = "?, ?, ?";
    vejkode     = data.vejkode     || "?";
    kommunekode = data.kommunekode || "?";
  } else {
    adresseStr  = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
    evaFormat   = `${data.vejnavn || ""},${data.husnr || ""},${data.postnr || ""}`;
    notesFormat = `${data.vejnavn || ""} ${data.husnr || ""}, ${data.postnr || ""} ${data.postnrnavn || ""}`;
    vejkode     = data.vejkode     || "?";
    kommunekode = data.kommunekode || "?";
  }
  
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = adresseStr;

  extraInfoEl.innerHTML = "";
  extraInfoEl.insertAdjacentHTML(
    "beforeend",
    `
    <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
    &nbsp;
    <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>`
  );
  
  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "inline";
  skråfotoLink.onclick = function(e) {
    e.preventDefault();
    copyToClipboard(adresseStr);
    let msg = document.createElement("div");
    msg.textContent = "Adressen er kopieret til udklipsholder.";
    msg.style.position = "fixed";
    msg.style.top = "20px";
    msg.style.left = "50%";
    msg.style.transform = "translateX(-50%)";
    msg.style.background = "rgba(0,0,0,0.7)";
    msg.style.color = "white";
    msg.style.padding = "10px 15px";
    msg.style.borderRadius = "5px";
    msg.style.zIndex = "1000";
    document.body.appendChild(msg);
    setTimeout(function() {
      document.body.removeChild(msg);
      window.open(skråfotoLink.href, '_blank');
    }, 1000);
  };

  overlay.textContent = `Kommunekode: ${kommunekode} | Vejkode: ${vejkode}`;
  overlay.style.display = "block";

  if (resultsList) resultsList.innerHTML = "";
  if (vej1List)    vej1List.innerHTML    = "";
  if (vej2List)    vej2List.innerHTML    = "";

  // Start kommuneinfo-fetch parallelt med statsvej-kald (kommunekode kendes allerede)
  const komFetchPromise = kommunekode !== "?"
    ? fetch(`https://api.dataforsyningen.dk/kommuner/${kommunekode}`).catch(() => null)
    : Promise.resolve(null);

  // Statsvej-data
  let statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");

  const admNr       = statsvejData?.ADM_NR       ?? statsvejData?.adm_nr       ?? null;
  const forgrening  = statsvejData?.FORGRENING   ?? statsvejData?.forgrening   ?? null;
  const betegnelse  = statsvejData?.BETEGNELSE   ?? statsvejData?.betegnelse   ?? null;
  const bestyrer    = statsvejData?.BESTYRER     ?? statsvejData?.bestyrer     ?? null;
  const vejtype     = statsvejData?.VEJTYPE      ?? statsvejData?.vejtype      ?? null;
  const beskrivelse = statsvejData?.BESKRIVELSE  ?? statsvejData?.beskrivelse  ?? null;
  const vejstatus   = statsvejData?.VEJSTATUS    ?? statsvejData?.vejstatus    ?? statsvejData?.VEJ_STATUS ?? statsvejData?.status ?? null;
  const vejmynd     = statsvejData?.VEJMYNDIGHED ?? statsvejData?.vejmyndighed ?? statsvejData?.VEJMYND     ?? statsvejData?.vejmynd ?? null;
  
  const hasStatsvej = admNr != null || forgrening != null || (betegnelse && String(betegnelse).trim() !== "") || (vejtype && String(vejtype).trim() !== "");
  const showStatsBox = hasStatsvej || vejstatus || vejmynd;

  if (showStatsBox) {
    let html = "";
    if (hasStatsvej) {
      html += `<strong>Administrativt nummer:</strong> ${admNr || "Ukendt"}<br>`;
      html += `<strong>Forgrening:</strong> ${forgrening || "Ukendt"}<br>`;
      html += `<strong>Vejnavn:</strong> ${betegnelse || "Ukendt"}<br>`;
      html += `<strong>Bestyrer:</strong> ${bestyrer || "Ukendt"}<br>`;
      html += `<strong>Vejtype:</strong> ${vejtype || "Ukendt"}`;
    }

    if (vejstatus) {
      html += `<br><strong>Vejstatus:</strong> ${vejstatus}`;
    }
    if (vejmynd) {
      html += `<br><strong>Vejmyndighed:</strong> ${vejmynd}`;
    }
    statsvejInfoEl.innerHTML = html;

    if (hasStatsvej) {
      const kmText = await getKmAtPoint(lat, lon, statsvejData);
      if (kmText) {
        statsvejInfoEl.innerHTML += `<br><strong>Km:</strong> ${kmText}`;
      }
    }
    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }
  document.getElementById("infoBox").style.display = "block";
  
  // Kommuneinfo – bruger komFetchPromise som allerede er startet parallelt med statsvej-kaldet
  if (kommunekode !== "?") {
    try {
      let komResp = await komFetchPromise;
      if (komResp && komResp.ok) {
        let komData = await komResp.json();
        let kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          let info      = kommuneInfo[kommunenavn];
          let doedeDyr  = info["Døde dyr"];
          let gaderVeje = info["Gader og veje"];
          let link      = info.gemLink;
          if (link) {
            extraInfoEl.innerHTML += `<br><span style="font-size:16px;">Kommune: <a href="${link}" target="_blank">${kommunenavn}</a> | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}</span>`;
          } else {
            extraInfoEl.innerHTML += `<br><span style="font-size:16px;">Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}</span>`;
          }
        }
      }
    } catch (e) {
      console.error("Kunne ikke hente kommuneinfo:", e);
    }
  }
  
  const politikredsNavn = data.politikredsnavn
    ?? data.adgangsadresse?.politikredsnavn
    ?? null;
  const politikredsKode = data.politikredskode
    ?? data.adgangsadresse?.politikredskode
    ?? null;
  if (politikredsNavn || politikredsKode) {
    const polititekst = politikredsKode ? `${politikredsNavn || ""} (${politikredsKode})` : `${politikredsNavn}`;
    extraInfoEl.innerHTML += `<br><span style="font-size:16px;">Politikreds: ${polititekst}</span>`;
  }
}

/***************************************************
 * updateInfoBoxForeign – ORS-adresser i udlandet
 ***************************************************/
function updateInfoBoxForeign(feature, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");
  const overlay        = document.getElementById("kommuneOverlay");
  const statsvejInfoEl = document.getElementById("statsvejInfo");
  const statsvejBox    = document.getElementById("statsvejInfoBox");

  const p = feature.properties || {};
  const vejnavn = p.street || p.name || "";
  const husnr   = p.housenumber || "";
  const postnr  = p.postalcode || "";
  const by      = p.locality || p.region || p.country || "";

  const label =
    p.label ||
    `${vejnavn} ${husnr}, ${postnr} ${by}`.replace(/\s+/g, " ").trim();

  const evaFormat   = `${vejnavn},${husnr},${postnr}`;
  const notesFormat = `${vejnavn} ${husnr}, ${postnr} ${by}`;

  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = label;

  extraInfoEl.innerHTML = `
    <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
    &nbsp;
    <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
  `;

  // Ingen skråfoto / kommune / statsvej i udlandet
  skråfotoLink.style.display = "none";
  overlay.style.display = "none";
  statsvejInfoEl.innerHTML = "";
  statsvejBox.style.display = "none";

  document.getElementById("infoBox").style.display = "block";

  if (resultsList) resultsList.innerHTML = "";
  if (vej1List)    vej1List.innerHTML    = "";
  if (vej2List)    vej2List.innerHTML    = "";
}

/***************************************************
 * Søgefelter og lister
 ***************************************************/
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");
var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Checkbox til at styre udenlandsk søgning
var foreignSearchToggle =
  document.getElementById("enableForeignSearch") ||
  document.getElementById("foreignSearchToggle") ||
  document.getElementById("foreignSearch");

var orsGeocodeQuotaSpan = document.getElementById("orsGeocodeQuota");

// NYT: lille infoboks når "Udland" vælges
var foreignInfoBox   = document.getElementById("foreignInfoBox");
var foreignInfoClose = document.getElementById("foreignInfoClose");

// Initiel visning af quota-tekst og infoboks
if (orsGeocodeQuotaSpan) {
  orsGeocodeQuotaSpan.style.display =
    (foreignSearchToggle && foreignSearchToggle.checked) ? "inline" : "none";
}
if (foreignInfoBox) {
  foreignInfoBox.style.display =
    (foreignSearchToggle && foreignSearchToggle.checked) ? "block" : "none";
}

// Når man slår "Udland" til/fra
if (foreignSearchToggle) {
  foreignSearchToggle.addEventListener("change", function () {
    if (orsGeocodeQuotaSpan) {
      orsGeocodeQuotaSpan.style.display = this.checked ? "inline" : "none";
    }
    if (foreignInfoBox) {
      foreignInfoBox.style.display = this.checked ? "block" : "none";
    }
  });
}

// Luk-kryds i infoboksen
if (foreignInfoClose && foreignInfoBox) {
  foreignInfoClose.addEventListener("click", function () {
    foreignInfoBox.style.display = "none";
  });
}

// Rute-felter
var routeFromInput = document.getElementById("routeFrom");
var routeToInput   = document.getElementById("routeTo");
var routeViaInput  = document.getElementById("routeVia");
var routeFromList  = document.getElementById("results-route-from");
var routeToList    = document.getElementById("results-route-to");
var routeViaList   = document.getElementById("results-route-via");

// Koordinater til rute
var routeFromCoord = null;
var routeToCoord   = null;
var routeViaCoord  = null;

function addClearButton(inputElement, listElement) {
  let btn = document.createElement("span");
  btn.innerHTML = "&times;";
  btn.classList.add("clear-button");
  inputElement.parentElement.appendChild(btn);

  // Vis/skjul krydset afhængigt af om der står noget i feltet
  inputElement.addEventListener("input", function () {
    btn.style.display = inputElement.value.length > 0 ? "inline" : "none";
  });

  // Klik på kryds = ryd felt, resultatliste, bokse og markør
  btn.addEventListener("click", function () {
    inputElement.value = "";
    listElement.innerHTML = "";
    listElement.style.display = "none";
    btn.style.display = "none";
    resetCoordinateBox();

    // Skjul info-bokse og kommune-overlay
    document.getElementById("infoBox").style.display = "none";
    document.getElementById("statsvejInfoBox").style.display = "none";
    document.getElementById("kommuneOverlay").style.display = "none";

    // Fjern markør – med respekt for "Behold markører"
    if (!keepMarkersEnabled && currentMarker) {
      map.removeLayer(currentMarker);
      currentMarker = null;
    }
  });

  // Backspace: når feltet er ved at blive tomt (0 tegn efter tast),
  // rydder vi resultater, bokse og markør – uden ekstra tryk
  inputElement.addEventListener("keydown", function (e) {
    if (e.key === "Backspace") {
      const currentLength = inputElement.value.length; // længde før tegnet slettes
      if (currentLength <= 1) {
        listElement.innerHTML = "";
        listElement.style.display = "none";
        resetCoordinateBox();

        document.getElementById("infoBox").style.display = "none";
        document.getElementById("statsvejInfoBox").style.display = "none";
        document.getElementById("kommuneOverlay").style.display = "none";

        if (!keepMarkersEnabled && currentMarker) {
          map.removeLayer(currentMarker);
          currentMarker = null;
        }
      }
    }
  });

  btn.style.display = "none";
}

addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);
// Clear-knapper til rute-felter
if (routeFromInput && routeFromList) addClearButton(routeFromInput, routeFromList);
if (routeToInput && routeToList)     addClearButton(routeToInput, routeToList);
if (routeViaInput && routeViaList)   addClearButton(routeViaInput, routeViaList);

/***************************************************
 * Globale arrays til piletaster
 ***************************************************/
var searchItems = [];
var searchCurrentIndex = -1;
var vej1Items = [];
var vej1CurrentIndex = -1;
var vej2Items = [];
var vej2CurrentIndex = -1;

// Piletaster til rute-felter
var routeFromItems = [];
var routeFromIndex = -1;
var routeToItems   = [];
var routeToIndex   = -1;
var routeViaItems  = [];
var routeViaIndex  = -1;

/***************************************************
 * Route-panel toggling
 ***************************************************/
var routePanel = document.getElementById("routePanel");
var routeToggleBtn = document.getElementById("routeToggleBtn");
if (routeToggleBtn && routePanel) {
  routeToggleBtn.addEventListener("click", function() {
    routePanel.classList.toggle("hidden");
  });
}

/***************************************************
 * Hjælper: udfyld rute-felter ved klik på kort
 ***************************************************/
function fillRouteFieldsFromClick(data, lat, lon) {
  if (!routePanel || routePanel.classList.contains("hidden")) return;

  const vejnavn = data?.adgangsadresse?.vejnavn || data.vejnavn || "";
  const husnr   = data?.adgangsadresse?.husnr   || data.husnr   || "";
  const postnr  = data?.adgangsadresse?.postnr  || data.postnr  || "";
  const postnavn = data?.adgangsadresse?.postnrnavn || data.postnrnavn || "";

  if (!vejnavn && !postnr && !postnavn) return;

  const addrText = `${vejnavn} ${husnr}, ${postnr} ${postnavn}`.trim();

  if (routeFromInput && !routeFromInput.value) {
    routeFromInput.value = addrText;
    routeFromCoord = [lat, lon];
  } else if (routeToInput && !routeToInput.value) {
    routeToInput.value = addrText;
    routeToCoord = [lat, lon];
  } else if (routeViaInput) {
    routeViaInput.value = addrText;
    routeViaCoord = [lat, lon];
  }
}

/***************************************************
 * Hoved-søg (#search) => doSearch
 ***************************************************/
const debouncedMainSearch = debounce(function(queryText) {
  doSearch(queryText, resultsList);
}, 350);
searchInput.addEventListener("input", function() {
  // Ny søgning: skjul info-bokse, marker mv.
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  if (!keepMarkersEnabled && currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  resetCoordinateBox();

  const txt = searchInput.value.trim();

  // Hvis brugeren skriver koordinater "lat, lon"
  const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
  if (coordRegex.test(txt)) {
    const match = txt.match(coordRegex);
    const latNum = parseFloat(match[1]);
    const lonNum = parseFloat(match[2]);
    let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl)
      .then(r => r.json())
      .then(data => {
        resultsList.innerHTML = "";
        resultsList.style.display = "none";
        placeMarkerAndZoom(
          [latNum, lonNum],
          `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`
        );
        setCoordinateBox(latNum, lonNum);
        updateInfoBox(data, latNum, lonNum);
      })
      .catch(err => console.error("Reverse geocoding fejl:", err));
    return;
  }

  // Tomt felt => ryd alt
  if (txt.length === 0) {
    clearBtn.style.display = "none";
    resultsList.innerHTML = "";
    resultsList.style.display = "none";
    document.getElementById("infoBox").style.display = "none";
    searchItems = [];
    return;
  }

  // Hvis Strandposter-laget er aktivt, laver vi en lokal søgning
  // uden debounce og uden min. længde
  if (map.hasLayer(redningsnrLayer)) {
    quickStrandSearch(txt);
  }

  // For at skåne eksterne API'er beholder vi stadig
  // min. 3 tegn + debounce for de almindelige søgninger
  if (txt.length < 3) {
    clearBtn.style.display = "inline";
    return;
  }

  clearBtn.style.display = "inline";
  debouncedMainSearch(txt);
});
  
searchInput.addEventListener("keydown", function(e) {
  if (e.key === "ArrowDown") {
    if (searchItems.length === 0) return;
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex + 1) % searchItems.length;
    highlightSearchItem();
  } else if (e.key === "ArrowUp") {
    if (searchItems.length === 0) return;
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex + searchItems.length - 1) % searchItems.length;
    highlightSearchItem();
  } else if (e.key === "Enter") {
    if (searchItems.length === 0) return;
    e.preventDefault();
    const idx = searchCurrentIndex >= 0 ? searchCurrentIndex : 0;
    const target = searchItems[idx];
    if (target) {
      // Click handler sidder på span (labelSpan) inde i li'en
      const span = target.querySelector("span");
      if (span) span.click(); else target.click();
    }
  } else if (e.key === "Backspace") {
    // Når feltet bliver tømt med backspace, skal resultatliste, markør og infobokse væk
    const currentLength = searchInput.value.length; // længde før tegnet slettes
    if (currentLength <= 1) {
      resultsList.innerHTML = "";
      resultsList.style.display = "none";
      searchItems = [];
      searchCurrentIndex = -1;

      document.getElementById("infoBox").style.display = "none";
      document.getElementById("statsvejInfoBox").style.display = "none";
      document.getElementById("kommuneOverlay").style.display = "none";
      resetCoordinateBox();

      if (!keepMarkersEnabled && currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
      }
    }
  }
});

function highlightSearchItem() {
  searchItems.forEach(li => li.classList.remove("highlight"));
  if (searchCurrentIndex >= 0 && searchCurrentIndex < searchItems.length) {
    searchItems[searchCurrentIndex].classList.add("highlight");
  }
}

clearBtn.addEventListener("click", function() {
  searchInput.value = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  resetCoordinateBox();
  resetInfoBox();
  searchInput.focus();
  if (!keepMarkersEnabled && currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  resultsList.innerHTML = "";
  resultsList.style.display = "none";
  document.getElementById("kommuneOverlay").style.display = "none";
});

/***************************************************
 * Vej1 / Vej2
 ***************************************************/
const debouncedVej1Search = debounce(function(searchText) {
  doSearchRoad(searchText, vej1List, vej1Input, "vej1");
}, 350);

const debouncedVej2Search = debounce(function(searchText) {
  doSearchRoad(searchText, vej2List, vej2Input, "vej2");
}, 350);
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 3) {
    vej1List.innerHTML = "";
    vej1List.style.display = "none";
    vej1Items = [];
    return;
  }
  debouncedVej1Search(txt);
});

vej1Input.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") {
    document.getElementById("infoBox").style.display = "none";
  }
  if (vej1Items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    vej1CurrentIndex = (vej1CurrentIndex + 1) % vej1Items.length;
    highlightVej1Item();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    vej1CurrentIndex = (vej1CurrentIndex + vej1Items.length - 1) % vej1Items.length;
    highlightVej1Item();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (vej1CurrentIndex >= 0) {
      vej1Items[vej1CurrentIndex].click();
    }
  }
});
function highlightVej1Item() {
  vej1Items.forEach(li => li.classList.remove("highlight"));
  if (vej1CurrentIndex >= 0 && vej1CurrentIndex < vej1Items.length) {
    vej1Items[vej1CurrentIndex].classList.add("highlight");
  }
}

vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 3) {
    vej2List.innerHTML = "";
    vej2List.style.display = "none";
    vej2Items = [];
    return;
  }
  debouncedVej2Search(txt);
});
vej2Input.addEventListener("keydown", function(e) {
  document.getElementById("infoBox").style.display = "none";
  if (vej2Items.length === 0) {
    if (e.key === "Backspace" && vej2Input.value.length === 0) {
      resetCoordinateBox();
      vej2List.innerHTML = "";
      vej2List.style.display = "none";
    }
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    vej2CurrentIndex = (vej2CurrentIndex + 1) % vej2Items.length;
    highlightVej2Item();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    vej2CurrentIndex = (vej2CurrentIndex + vej2Items.length - 1) % vej2Items.length;
    highlightVej2Item();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (vej2CurrentIndex >= 0) {
      vej2Items[vej2CurrentIndex].click();
    }
  } else if (e.key === "Backspace") {
    if (vej2Input.value.length === 0) {
      resetCoordinateBox();
      vej2List.innerHTML = "";
      vej2List.style.display = "none";
    }
  }
});
function highlightVej2Item() {
  vej2Items.forEach(li => li.classList.remove("highlight"));
  if (vej2CurrentIndex >= 0 && vej2CurrentIndex < vej2Items.length) {
    vej2Items[vej2CurrentIndex].classList.add("highlight");
  }
}

function resetInfoBox() {
  document.getElementById("extra-info").textContent = "";
  document.getElementById("skraafotoLink").style.display = "none";
}

vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej1Input.value = "";
  vej1List.innerHTML = "";
  vej1List.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  resetCoordinateBox();
});

vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej2Input.value = "";
  vej2List.innerHTML = "";
  vej2List.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  resetCoordinateBox();
});

/***************************************************
 * Rute-felter: søgning i Dataforsyningen
 ***************************************************/
function doRouteSearch(query, listElement, type) {
  let url = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(url)
    .then(response => response.json())
    .then(data => {
      listElement.innerHTML = "";

      let itemsArray;
      if (type === "from") {
        routeFromItems = [];
        routeFromIndex = -1;
        itemsArray = routeFromItems;
      } else if (type === "to") {
        routeToItems = [];
        routeToIndex = -1;
        itemsArray = routeToItems;
      } else {
        routeViaItems = [];
        routeViaIndex = -1;
        itemsArray = routeViaItems;
      }

      data.forEach(item => {
        let li = document.createElement("li");
        li.textContent = item.tekst;
        li.addEventListener("click", function() {
          selectRouteSuggestion(item, type, listElement);
        });
        listElement.appendChild(li);
        itemsArray.push(li);
      });
      listElement.style.display = data.length > 0 ? "block" : "none";
    })
    .catch(err => console.error("Fejl i doRouteSearch:", err));
}

function selectRouteSuggestion(item, type, listElement) {
  const input = type === "from" ? routeFromInput : type === "to" ? routeToInput : routeViaInput;
  input.value = item.tekst || "";
  listElement.innerHTML = "";
  listElement.style.display = "none";

  const adgangsId = item.adgangsadresse && item.adgangsadresse.id;
  if (!adgangsId) {
    console.error("Ingen adgangsadresse.id for rute-forslag");
    return;
  }
  const detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}`;
  fetch(detailUrl)
    .then(r => r.json())
    .then(addr => {
      let coords = addr.adgangspunkt?.koordinater;
      if (!coords || coords.length < 2) return;
      const lon = coords[0];
      const lat = coords[1];
      if (type === "from") {
        routeFromCoord = [lat, lon];
      } else if (type === "to") {
        routeToCoord = [lat, lon];
      } else {
        routeViaCoord = [lat, lon];
      }
    })
    .catch(err => console.error("Fejl i selectRouteSuggestion:", err));
}

function highlightRouteItem(type) {
  let items, idx;
  if (type === "from") {
    items = routeFromItems;
    idx = routeFromIndex;
  } else if (type === "to") {
    items = routeToItems;
    idx = routeToIndex;
  } else {
    items = routeViaItems;
    idx = routeViaIndex;
  }
  if (!items) return;
  items.forEach(li => li.classList.remove("highlight"));
  if (idx >= 0 && idx < items.length) {
    items[idx].classList.add("highlight");
  }
}

function setupRouteInputHandlers(inputElement, listElement, type) {
  if (!inputElement || !listElement) return;

  const debouncedRouteSearch = debounce(function(searchText) {
    doRouteSearch(searchText, listElement, type);
  }, 350);

  inputElement.addEventListener("input", function() {
    const txt = inputElement.value.trim();
    if (txt.length < 3) {
      listElement.innerHTML = "";
      listElement.style.display = "none";
      if (type === "from") {
        routeFromItems = [];
        routeFromIndex = -1;
        routeFromCoord = null;
      } else if (type === "to") {
        routeToItems = [];
        routeToIndex = -1;
        routeToCoord = null;
      } else {
        routeViaItems = [];
        routeViaIndex = -1;
        routeViaCoord = null;
      }
      return;
    }
    debouncedRouteSearch(txt);
  });

  inputElement.addEventListener("keydown", function(e) {
    let items;
    if (type === "from") {
      items = routeFromItems;
    } else if (type === "to") {
      items = routeToItems;
    } else {
      items = routeViaItems;
    }
    if (!items || items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (type === "from") {
        routeFromIndex = (routeFromIndex + 1) % items.length;
      } else if (type === "to") {
        routeToIndex = (routeToIndex + 1) % items.length;
      } else {
        routeViaIndex = (routeViaIndex + 1) % items.length;
      }
      highlightRouteItem(type);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (type === "from") {
        routeFromIndex = (routeFromIndex + items.length - 1) % items.length;
      } else if (type === "to") {
        routeToIndex = (routeToIndex + items.length - 1) % items.length;
      } else {
        routeViaIndex = (routeViaIndex + items.length - 1) % items.length;
      }
      highlightRouteItem(type);
    } else if (e.key === "Enter") {
      e.preventDefault();
      let idx;
      if (type === "from") idx = routeFromIndex;
      else if (type === "to") idx = routeToIndex;
      else idx = routeViaIndex;

      if (idx >= 0 && idx < items.length) {
        items[idx].click();
      }
    }
  });
}

setupRouteInputHandlers(routeFromInput, routeFromList, "from");
setupRouteInputHandlers(routeToInput,   routeToList,   "to");
setupRouteInputHandlers(routeViaInput,  routeViaList,  "via");

/***************************************************
 * Globale variabler til at gemme valgte veje (Find X)
 ***************************************************/
var selectedRoad1 = null;
var selectedRoad2 = null;

/***************************************************
 * doSearchRoad => bruges af vej1/vej2
 ***************************************************/
function doSearchRoad(query, listElement, inputField, which) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(addrUrl)
    .then(response => response.json())
    .then(data => {
      listElement.innerHTML = "";
      if (which === "vej1") {
        vej1Items = [];
        vej1CurrentIndex = -1;
      } else {
        vej2Items = [];
        vej2CurrentIndex = -1;
      }
      data.sort((a, b) => a.tekst.localeCompare(b.tekst));
      const unique = new Set();
      data.forEach(item => {
        let vejnavn   = item.adgangsadresse?.vejnavn || "Ukendt vej";
        let kommune   = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
        let postnr    = item.adgangsadresse?.postnr || "?";
        let adgangsId = item.adgangsadresse?.id || null;
        let key = `${vejnavn}-${postnr}`;
        if (unique.has(key)) return;
        unique.add(key);
        let li = document.createElement("li");
        li.textContent = `${vejnavn}, ${kommune} (${postnr})`;
        li.addEventListener("click", function() {
          inputField.value = vejnavn;
          listElement.innerHTML = "";
          listElement.style.display = "none";
          if (!adgangsId) {
            console.error("Ingen adgangsadresse.id => kan ikke slå vejkode op");
            return;
          }
          let detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
          fetch(detailUrl)
            .then(r => r.json())
            .then(async detailData => {
              let roadSelection = {
                vejnavn: vejnavn,
                kommunekode: detailData.kommunekode,
                vejkode: detailData.vejkode,
                husnummerId: detailData.id
              };
              let geometry = await getNavngivenvejKommunedelGeometry(detailData.id);
              roadSelection.geometry = geometry;
              if (inputField.id === "vej1") {
                selectedRoad1 = roadSelection;
              } else if (inputField.id === "vej2") {
                selectedRoad2 = roadSelection;
              }
            })
            .catch(err => {
              console.error("Fejl i fetch /adgangsadresser/{id}:", err);
            });
        });
        listElement.appendChild(li);
        if (which === "vej1") {
          vej1Items.push(li);
        } else {
          vej2Items.push(li);
        }
      });
      listElement.style.display = data.length > 0 ? "block" : "none";
    })
    .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * doSearchStrandposter => klient-side søgning
 ***************************************************/
function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise((resolve) => {
    function filterAndMap() {
      let results = allStrandposter.filter(feature => {
        let rednr = (feature.properties.StrandNr || "").toLowerCase();
        return rednr.indexOf(query) !== -1;
      }).map(feature => {
        let rednr = feature.properties.StrandNr;
        let tekst = `Redningsnummer: ${rednr}`;
        let coords = feature.geometry.coordinates;
        let lat, lon;
        if (coords[0] > 90 || coords[1] > 90) {
          let converted = convertToWGS84(coords[0], coords[1]);
          lat = converted[0];
          lon = converted[1];
        } else {
          lon = coords[0];
          lat = coords[1];
        }
        return {
          type: "strandpost",
          tekst: tekst,
          lat: lat,
          lon: lon,
          feature: feature
        };
      });
      resolve(results);
    }
    if (allStrandposter.length === 0) {
      fetchAllStrandposter().then(filterAndMap).catch(err => {
        console.error("Fejl ved hentning af strandposter:", err);
        resolve([]);
      });
    } else {
      filterAndMap();
    }
  });
}

/***************************************************
 * Hurtig søgning kun i strandposter (uden debounce)
 * Bruges når "Strandposter"-laget er tændt
 ***************************************************/
function handleStrandpostClick(obj, listElement) {
  setCoordinateBox(obj.lat, obj.lon);
  placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);

  listElement.innerHTML = "";
  listElement.style.display = "none";

  let marker = currentMarker;
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`;

  fetch(revUrl)
    .then(r => r.json())
    .then(revData => {
      const vejnavn     = revData?.adgangsadresse?.vejnavn     || revData?.vejnavn || "?";
      const husnr       = revData?.adgangsadresse?.husnr       || revData?.husnr   || "";
      const postnr      = revData?.adgangsadresse?.postnr      || revData?.postnr  || "?";
      const postnrnavn  = revData?.adgangsadresse?.postnrnavn  || revData?.postnrnavn || "";
      const adresseStr  = `${vejnavn} ${husnr}, ${postnr} ${postnrnavn}`;
      const evaFormat   = `${vejnavn},${husnr},${postnr}`;
      const notesFormat = `${vejnavn} ${husnr}, ${postnr} ${postnrnavn}`;

      if (marker) {
        marker.bindPopup(`
          <strong>${obj.tekst}</strong><br>
          ${adresseStr}<br>
          <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
          &nbsp;
          <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
        `).openPopup();

        marker.on("popupclose", function () {
          map.removeLayer(marker);
          currentMarker = null;
          document.getElementById("infoBox").style.display = "none";
          document.getElementById("statsvejInfoBox").style.display = "none";
          resetCoordinateBox();
          resultsList.innerHTML = "";
          resultsList.style.display = "none";
        });
      }
    })
    .catch(err => {
      console.error("Reverse geocoding for strandpost fejlede:", err);
      if (marker) {
        marker.bindPopup(`<strong>${obj.tekst}</strong><br>(Reverse geocoding fejlede)`).openPopup();
      }
    });
}

function quickStrandSearch(query) {
  // Skal kun bruges når Strandposter-laget er aktivt
  if (!map.hasLayer(redningsnrLayer)) return;

  doSearchStrandposter(query)
    .then(strandResults => {
      resultsList.innerHTML = "";
      searchItems = [];
      searchCurrentIndex = -1;

      strandResults.forEach(obj => {
        const li = document.createElement("li");
        li.innerHTML = `🛟 ${obj.tekst}`;
        li.addEventListener("click", function() {
          handleStrandpostClick(obj, resultsList);
        });
        resultsList.appendChild(li);
        searchItems.push(li);
      });

      resultsList.style.display = strandResults.length > 0 ? "block" : "none";
    })
    .catch(err => {
      console.error("Fejl i quickStrandSearch:", err);
    });
}

/***************************************************
 * doSearch => kombinerer adresser, stednavne, specialsteder,
 * navngivne veje, strandposter og udenlandske ORS-adresser
 ***************************************************/
function doSearch(query, listElement) {
  console.log("doSearch:", JSON.stringify(query), "| customPlaces:", customPlaces.length, customPlaces.map(p=>p.navn));
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=50`;
  let stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=50&token=a63a88838c24fc85d47f32cde0ec0144`;
  const queryWithWildcard = query.trim().split(/\s+/).map(w => w + "*").join(" ");
  let roadUrl = `https://api.dataforsyningen.dk/navngivneveje?q=${encodeURIComponent(queryWithWildcard)}&per_side=20`;

  // Strandposter (kun når laget er tændt og data er klar)
  let strandPromiseBase = (map.hasLayer(redningsnrLayer) && strandposterReady)
    ? doSearchStrandposter(query)
    : Promise.resolve([]);
  
  // Evt. egne special-steder
  let lowerQuery = query.toLowerCase();
  let customResults = customPlaces
    .filter(function(p) {
      let navnMatch     = p.navn && p.navn.toLowerCase().includes(lowerQuery);
      let adresseMatch  = p.adresse && p.adresse.toLowerCase().includes(lowerQuery);
      let kortnavnMatch = p.kortnavn && p.kortnavn.toLowerCase().includes(lowerQuery);
      return navnMatch || adresseMatch || kortnavnMatch;
    })
    .map(function(p) {
      return {
        type: "custom",
        navn: p.navn || "",
        adresse: p.adresse || "",
        coords: p.coords,
        data: p
      };
    });

  // Vis custom places ØJEBLIKKELIGT (inden DAWA svarer)
  if (customResults.length > 0) {
    listElement.innerHTML = "";
    searchItems = [];
    customResults.forEach(function(obj) {
      let li = document.createElement("li");
      li.style.cssText = "display:flex;align-items:center;gap:6px;";
      let labelSpan = document.createElement("span");
      labelSpan.style.flex = "1";
      let extra = obj.adresse ? " – " + obj.adresse : "";
      labelSpan.innerHTML = `⭐ ${obj.navn}${extra}`;
      labelSpan.addEventListener("click", function() {
        searchInput.value = obj.navn;
        listElement.innerHTML = "";
        listElement.style.display = "none";
        searchItems = [];
        if (obj.coords) {
          let [lat, lon] = obj.coords;
          placeMarkerAndZoom([lat, lon], obj.navn);
        }
      });
      li.appendChild(labelSpan);
      listElement.appendChild(li);
      searchItems.push(li);
    });
    listElement.style.display = "block";
  }

  // Udlands-tilstand styres af checkboxen (Udland)
  const foreignToggleEl =
    foreignSearchToggle ||
    document.getElementById("enableForeignSearch") ||
    document.getElementById("foreignSearchToggle") ||
    document.getElementById("foreignSearch");
  const foreignOnly = !!(foreignToggleEl && foreignToggleEl.checked);

  // Promises til de forskellige datakilder
  let addrPromise;
  let stedPromise;
  let roadPromise;
  let strandPromise;
  let orsPromise;

  if (foreignOnly) {
    // Når "Udland" er slået til:
    //  - ingen Dataforsyningen-søgninger
    //  - kun ORS (udenlandske adresser)
    addrPromise   = Promise.resolve([]);
    stedPromise   = Promise.resolve({});
    roadPromise   = Promise.resolve([]);
    strandPromise = Promise.resolve([]);
    orsPromise    = geocodeORSForSearch(query);
  } else {
    // Normal tilstand: kun danske kilder, ingen ORS
    addrPromise = fetch(addrUrl)
      .then(r => r.json())
      .catch(err => { console.error("Adresser fejl:", err); return []; });

    stedPromise = fetch(stedUrl)
      .then(r => r.json())
      .catch(err => { console.error("Stednavne fejl:", err); return {}; });

    roadPromise = fetch(roadUrl)
      .then(r => r.json())
      .catch(err => { console.error("Navngivne veje fejl:", err); return []; });

    strandPromise = strandPromiseBase;

    // ORS skal ikke kaldes, når Udland ikke er valgt
    orsPromise = Promise.resolve([]);
  }

  Promise.all([
    addrPromise,
    stedPromise,
    roadPromise,
    strandPromise,
    orsPromise
  ])
  .then(([addrData, stedData, roadData, strandData, orsData]) => {
    listElement.innerHTML = "";
    searchItems = [];
    searchCurrentIndex = -1;

    // Adresser (Dataforsyningen)
    let addrResults = (addrData || []).map(item => ({
      type: "adresse",
      tekst: item.tekst,
      adgangsadresse: item.adgangsadresse
    }));

    // Stednavne
    let stedResults = [];
    if (stedData) {
      if (Array.isArray(stedData.results)) {
        stedResults = stedData.results.map(result => ({
          type: "stednavn",
          navn: result.visningstekst || result.navn,
          bbox: result.bbox || null,
          geometry: result.geometry
        }));
      } else if (Array.isArray(stedData)) {
        stedResults = stedData.map(result => ({
          type: "stednavn",
          navn: result.visningstekst || result.skrivemaade_officiel,
          bbox: result.bbox || null,
          geometry: result.geometri
        }));
      }
    }

    // Navngivne veje
    let roadResults = (roadData || []).map(item => ({
      type: "navngivenvej",
      navn: item.navn || item.adresseringsnavn || "",
      id: item.id,
      visualCenter: item.visueltcenter,
      bbox: item.bbox,
      postnumre: item.postnumre || []
    }));

    // Udenlandske adresser fra ORS
    let orsResults = (orsData || []).map(o => o);

    // Samlet liste
    let combined;
    if (foreignOnly) {
      // Når "Udland" er slået til: KUN udenlandske adresser
      combined = [
        ...orsResults
      ];
    } else {
      // Normal tilstand: danske kilder + evt. egne steder
      combined = [
        ...addrResults,
        ...stedResults,
        ...roadResults,
        ...(strandData || []),
        ...customResults,
        ...orsResults
      ];
    }

    // Sortering
    combined.sort((a, b) => {
      const aIsName = (a.type === "stednavn" || a.type === "navngivenvej" || a.type === "custom" || a.type === "ors_foreign");
      const bIsName = (b.type === "stednavn" || b.type === "navngivenvej" || b.type === "custom" || b.type === "ors_foreign");
      if (aIsName && !bIsName) return -1;
      if (!aIsName && bIsName) return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });

    // Byg liste-elementer
    combined.forEach(obj => {
      let li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.justifyContent = "space-between";
      li.style.gap = "6px";

      let labelSpan = document.createElement("span");
      labelSpan.style.flex = "1";

      if (obj.type === "strandpost") {
        labelSpan.innerHTML = `🛟 ${obj.tekst}`;
      } else if (obj.type === "adresse") {
        labelSpan.innerHTML = `🏠 ${obj.tekst}`;
      } else if (obj.type === "navngivenvej") {
        const pnrTekst = (obj.postnumre || []).map(p => p.nr + " " + p.navn).join(" · ");
        labelSpan.innerHTML = `🛣️ ${obj.navn}${pnrTekst ? ` <span style="color:#888;font-size:11px">(${pnrTekst})</span>` : ""}`;
      } else if (obj.type === "stednavn") {
        labelSpan.innerHTML = `📍 ${obj.navn}`;
      } else if (obj.type === "custom") {
        let extra = obj.adresse ? " – " + obj.adresse : "";
        labelSpan.innerHTML = `⭐ ${obj.navn}${extra}`;
      } else if (obj.type === "ors_foreign") {
        labelSpan.innerHTML = `🌍 ${obj.label}`;
      }
      li.appendChild(labelSpan);

      // ⭐ Gem-knap på adresser og stednavne (ikke custom, strandpost, vej)
      if (obj.type === "adresse" || obj.type === "stednavn") {
        const gemBtn = document.createElement("button");
        gemBtn.title = "Gem som custom place";
        gemBtn.innerHTML = "⭐";
        gemBtn.style.cssText = "background:none;border:none;cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0;opacity:0.5;";
        gemBtn.addEventListener("mouseenter", () => gemBtn.style.opacity = "1");
        gemBtn.addEventListener("mouseleave", () => gemBtn.style.opacity = "0.5");
        gemBtn.addEventListener("click", async function(e) {
          e.stopPropagation();
          const navn = prompt("Navn til custom place:", obj.tekst || obj.navn || "");
          if (!navn) return;
          let lat = null, lon = null, adresse = "";
          if (obj.type === "adresse" && obj.adgangsadresse?.id) {
            try {
              const d = await fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`).then(r => r.json());
              [lon, lat] = d.adgangspunkt.koordinater;
              adresse = obj.tekst || "";
            } catch {}
          } else if (obj.type === "stednavn" && obj.geometry?.coordinates) {
            const coords = obj.geometry.coordinates;
            if (Array.isArray(coords) && coords.length === 2) { lon = coords[0]; lat = coords[1]; }
            adresse = "";
          }
          if (!lat || !lon) { alert("Kunne ikke hente koordinater."); return; }
          addCustomPlace({ navn, adresse, lat, lon });
        });
        li.appendChild(gemBtn);
      }

      labelSpan.addEventListener("click", function() {
                if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              let [lon, lat] = addressData.adgangspunkt.koordinater;
              setCoordinateBox(lat, lon);
              placeMarkerAndZoom([lat, lon], obj.tekst);

              let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
              fetch(revUrl)
                .then(r => r.json())
                .then(reverseData => {
                  updateInfoBox(reverseData, lat, lon);
                  resultsList.innerHTML = "";
                  resultsList.style.display = "none";
                  vej1List.innerHTML = "";
                  vej2List.innerHTML = "";
                })
                .catch(err => {
                  console.error("Reverse geocoding fejl:", err);
                  updateInfoBox(addressData, lat, lon);
                  resultsList.innerHTML = "";
                  resultsList.style.display = "none";
                  vej1List.innerHTML = "";
                  vej2List.innerHTML = "";
                });
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        } else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0] && obj.bbox.coordinates[0].length > 0) {
          let [x, y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([x, y], obj.navn);
          listElement.innerHTML = "";
          listElement.style.display = "none";
        } else if (obj.type === "stednavn" && obj.geometry && obj.geometry.coordinates) {
          let coordsArr = Array.isArray(obj.geometry.coordinates[0])
                          ? obj.geometry.coordinates[0]
                          : obj.geometry.coordinates;
          placeMarkerAndZoom(coordsArr, obj.navn);
          listElement.innerHTML = "";
          listElement.style.display = "none"; 
                } else if (obj.type === "strandpost") {
          handleStrandpostClick(obj, listElement);
        } else if (obj.type === "custom") {
          let [lat, lon] = obj.coords;
          setCoordinateBox(lat, lon);
          placeMarkerAndZoom([lat, lon], obj.navn);
          let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
          fetch(revUrl)
            .then(r => r.json())
            .then(revData => {
              updateInfoBox(revData, lat, lon);
            })
            .catch(err => console.error("Reverse geocoding fejl for specialsted:", err));
          listElement.innerHTML = "";
          listElement.style.display = "none";
        } else if (obj.type === "navngivenvej") {
          let lat, lon;
          if (Array.isArray(obj.visualCenter) && obj.visualCenter.length === 2) {
            lon = obj.visualCenter[0];
            lat = obj.visualCenter[1];
          } else if (Array.isArray(obj.bbox) && obj.bbox.length === 4) {
            const [minLon, minLat, maxLon, maxLat] = obj.bbox;
            lon = (minLon + maxLon) / 2;
            lat = (minLat + maxLat) / 2;
          } else {
            return;
          }
          setCoordinateBox(lat, lon);
          placeMarkerAndZoom([lat, lon], obj.navn);
          let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
          fetch(revUrl)
            .then(r => r.json())
            .then(revData => {
              updateInfoBox(revData, lat, lon);
            })
            .catch(err => console.error("Reverse geocoding fejl for navngiven vej:", err));
          listElement.innerHTML = "";
          listElement.style.display = "none";
        } else if (obj.type === "ors_foreign") {
          // Udenlandsk adresse fra ORS
          const lat = obj.lat;
          const lon = obj.lon;
          setCoordinateBox(lat, lon);
          placeMarkerAndZoom([lat, lon], obj.label);
          updateInfoBoxForeign(obj.feature, lat, lon);

          // Udfyld rute-felter
          const p = obj.feature.properties || {};
          const norm = {
            vejnavn: p.street || p.name || "",
            husnr: p.housenumber || "",
            postnr: p.postalcode || "",
            postnrnavn: p.locality || p.region || p.country || ""
          };
          fillRouteFieldsFromClick(norm, lat, lon);

          listElement.innerHTML = "";
          listElement.style.display = "none";
        }
      });

      listElement.appendChild(li);
      searchItems.push(li);
    });

    listElement.style.display = combined.length > 0 ? "block" : "none";
  })
  .catch(err => console.error("Fejl i doSearch:", err));
}

/***************************************************
 * getNavngivenvejKommunedelGeometry
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  let url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  try {
    let r = await fetch(url);
    let data = await r.json();
    if (Array.isArray(data) && data.length > 0) {
      let first = data[0];
      if (first.navngivenVej && first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje) {
        let wktString = first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje;
        let geojson = wellknown.parse(wktString);
        return geojson;
      }
    }
  } catch (err) {
    console.error("Fejl i getNavngivenvejKommunedelGeometry:", err);
  }
  return null;
}

/***************************************************
 * placeMarkerAndZoom – bruger createSelectionMarker
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  if (coords[0] > 90 || coords[1] > 90) {
    let converted = convertToWGS84(coords[0], coords[1]);
    coords = converted;
  }
  let lat = coords[0], lon = coords[1];

  // Brug fælles helper, så den respekterer "Behold markører"
  createSelectionMarker(lat, lon);

  map.setView([lat, lon], 16);
  document.getElementById("address").textContent = displayText;
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display = "block";
}

// ── Statsvej-cache og abort-controller ───────────────────────────
const _statsvejCache     = new Map();
let   _statsvejAbortCtrl = null;

/***************************************************
 * checkForStatsvej
 ***************************************************/
async function checkForStatsvej(lat, lon) {
  // 1. Cache-opslag — samme ~100m-område returnerer øjeblikkeligt
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (_statsvejCache.has(cacheKey)) return _statsvejCache.get(cacheKey);

  // 2. Afbryd evt. igangværende kald (gentagne klik)
  if (_statsvejAbortCtrl) _statsvejAbortCtrl.abort();
  _statsvejAbortCtrl = new AbortController();
  const signal = _statsvejAbortCtrl.signal;

  const testOffsets = [
    { dx: 0,  dy: 0 },
    { dx: -3, dy: 0 },
    { dx: 3,  dy: 0 },
    { dx: 0,  dy: -3 },
    { dx: 0,  dy: 3 },
    { dx: -6, dy: 0 },
    { dx: 6,  dy: 0 },
    { dx: 0,  dy: -6 },
    { dx: 0,  dy: 6 },
    { dx: -3, dy: -3 },
    { dx: 3,  dy: -3 },
    { dx: -3, dy: 3 },
    { dx: 3,  dy: 3 },
    { dx: -10, dy: 0 },
    { dx: 10, dy: 0 },
    { dx: 0,  dy: -10 },
    { dx: 0,  dy: 10 },
    { dx: -6, dy: -6 },
    { dx: 6,  dy: -6 },
    { dx: -6, dy: 6 },
    { dx: 6,  dy: 6 }
  ];

  function normalizeStatsvejProps(props) {
    if (!props || typeof props !== "object") return {};

    return {
      ...props,
      ADM_NR: props.ADM_NR ?? props.adm_nr ?? null,
      FORGRENING: props.FORGRENING ?? props.forgrening ?? null,
      BETEGNELSE: props.BETEGNELSE ?? props.betegnelse ?? null,
      BESTYRER: props.BESTYRER ?? props.bestyrer ?? null,
      VEJTYPE: props.VEJTYPE ?? props.vejtype ?? null,
      BESKRIVELSE: props.BESKRIVELSE ?? props.beskrivelse ?? null,
      VEJSTATUS: props.VEJSTATUS ?? props.vejstatus ?? props.VEJ_STATUS ?? props.status ?? null,
      VEJMYNDIGHED: props.VEJMYNDIGHED ?? props.vejmyndighed ?? props.VEJMYND ?? props.vejmynd ?? null
    };
  }

  function isNonEmpty(value) {
    return value != null && String(value).trim() !== "";
  }

  function scoreStatsvejCandidate(props) {
    const p = normalizeStatsvejProps(props);
    let score = 0;

    if (isNonEmpty(p.ADM_NR)) score += 100;
    if (isNonEmpty(p.FORGRENING)) score += 40;
    if (isNonEmpty(p.BETEGNELSE)) score += 20;
    if (isNonEmpty(p.BESTYRER)) score += 10;
    if (isNonEmpty(p.VEJTYPE)) score += 10;
    if (isNonEmpty(p.VEJSTATUS)) score += 5;
    if (isNonEmpty(p.VEJMYNDIGHED)) score += 5;

    return score;
  }

  function hasUsableStatsvejData(props) {
    const p = normalizeStatsvejProps(props);
    return scoreStatsvejCandidate(p) >= 100;
  }

  async function fetchStatsvejCandidatesAtUtm(testUtmX, testUtmY) {
    let buffer = 100;
    let bbox = `${testUtmX - buffer},${testUtmY - buffer},${testUtmX + buffer},${testUtmY + buffer}`;

    let url =
      'https://geocloud.vd.dk/CVF/wms?' +
      'SERVICE=WMS&' +
      'VERSION=1.1.1&' +
      'REQUEST=GetFeatureInfo&' +
      'INFO_FORMAT=application/json&' +
      'FEATURE_COUNT=200&' +
      'TRANSPARENT=true&' +
      'LAYERS=CVF:veje&' +
      'QUERY_LAYERS=CVF:veje&' +
      'SRS=EPSG:25832&' +
      'WIDTH=101&' +
      'HEIGHT=101&' +
      `BBOX=${bbox}&` +
      'X=50&' +
      'Y=50';

    let response = await fetch(url, { signal });
    let textData = await response.text();

    if (!textData || !textData.trim()) {
      return [];
    }

    if (textData.startsWith("Results")) {
      let extractedData = parseTextResponse(textData);
      return extractedData && Object.keys(extractedData).length > 0
        ? [normalizeStatsvejProps(extractedData)]
        : [];
    }

    let jsonData;
    try {
      jsonData = JSON.parse(textData);
    } catch (parseError) {
      console.warn("Kunne ikke parse statsvej-svar som JSON:", parseError, textData);
      return [];
    }

    if (jsonData.features && Array.isArray(jsonData.features) && jsonData.features.length > 0) {
      return jsonData.features
        .map(feature => normalizeStatsvejProps(feature?.properties || {}))
        .filter(props => Object.keys(props).length > 0);
    }

    return [];
  }

  try {
    let [utmX, utmY] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);

    // 3. Tidlig exit: returner så snart vi har et brugbart svar — vent ikke på alle 21
    const result = await new Promise((resolve) => {
      let bestCandidate = null;
      let bestScore     = -1;
      let remaining     = testOffsets.length;

      testOffsets.forEach(offset => {
        fetchStatsvejCandidatesAtUtm(utmX + offset.dx, utmY + offset.dy)
          .then(candidates => {
            if (signal.aborted) return;
            for (const c of candidates) {
              const score = scoreStatsvejCandidate(c);
              if (score > bestScore) { bestScore = score; bestCandidate = c; }
            }
            if (bestCandidate && hasUsableStatsvejData(bestCandidate)) resolve(bestCandidate);
          })
          .catch(() => {})
          .finally(() => { if (--remaining === 0) resolve(bestCandidate || {}); });
      });
    });

    // 4. Gem i cache (udløber efter 5 min)
    if (!signal.aborted) {
      _statsvejCache.set(cacheKey, result);
      setTimeout(() => _statsvejCache.delete(cacheKey), 5 * 60 * 1000);
    }
    return result;
  } catch (error) {
    console.error("Fejl ved hentning af vejdata:", error);
    return {};
  }
}

function parseTextResponse(text) {
  let lines = text.split("\n");
  let data = {};
  lines.forEach(line => {
    let parts = line.split(" = ");
    if (parts.length === 2) {
      let key = parts[0].trim();
      let value = parts[1].trim();
      data[key] = value;
    }
  });
  return data;
}

/***************************************************
 * getKmAtPoint – henter km via Cloudflare-worker
 * Genbruger allerede hentede statsvej-data, hvis de er sendt med
 ***************************************************/
async function getKmAtPoint(lat, lon, statsvejData = null) {
  try {
    const [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);

    const stats = statsvejData || await checkForStatsvej(lat, lon);
    const roadNumber = stats?.ADM_NR ?? stats?.adm_nr ?? null;
    const roadPart   = stats?.FORGRENING ?? stats?.forgrening ?? 0;

    if (!roadNumber) return "";

    const url =
      `${VD_PROXY}/reference` +
      `?geometry=POINT(${x}%20${y})` +
      `&srs=EPSG:25832` +
      `&roadNumber=${roadNumber}` +
      `&roadPart=${roadPart}` +
      `&format=json`;

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      return "";
    }

    const data = await resp.json();
    console.log("🔍 VD reference svar:", JSON.stringify(data).slice(0, 500));
    const props =
      data?.properties ??
      data?.feature?.properties ??
      data?.features?.[0]?.properties ??
      data;

    const from = props?.from ?? props?.FROM ?? props?.fra ?? props?.at ?? null;
    const to   = props?.to   ?? props?.TO   ?? props?.til ?? null;

    const kmtText =
      from?.kmtText ?? from?.KMTTEXT ?? from?.Kmt ?? from?.KMT ?? from?.kmt ??
      to?.kmtText   ?? to?.KMTTEXT   ?? to?.Kmt   ?? to?.TilKmt ?? to?.TILKMT ??
      props?.kmtText ?? props?.KMTEKST ?? props?.kmtekst ??
      props?.KM_TEXT ?? props?.km_text ?? props?.kmtegn ??
      props?.Kmt ?? props?.KMT ?? props?.kmt ??
      props?.TilKmt ?? props?.TILKMT ??
      null;

    if (kmtText) return String(kmtText);

    const km = (from?.km ?? props?.km ?? props?.KM ?? null);
    const m  = (from?.m  ?? props?.m  ?? props?.M  ?? props?.km_meter ?? null);

    if (km != null && m != null) {
      return `${km}/${String(m).padStart(4, "0")}`;
    }

    return "";
  } catch (e) {
    console.error("getKmAtPoint fejl:", e);
    return "";
  }
}

/***************************************************
 * Statsvej / info-bokse close-knapper
 ***************************************************/
const statsvejInfoBox = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn = document.getElementById("statsvejCloseBtn");
statsvejCloseBtn.addEventListener("click", function() {
  statsvejInfoBox.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  resetCoordinateBox();
  if (!keepMarkersEnabled && currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});
const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  if (!keepMarkersEnabled && currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  resetCoordinateBox();
  resultsList.innerHTML = "";
  resultsList.style.display = "none";
  document.getElementById("kommuneOverlay").style.display = "none";
});

/***************************************************
 * "Find X"-knap => find intersection med Turf.js
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async function() {
  if (!selectedRoad1 || !selectedRoad2) {
    alert("Vælg venligst to veje først.");
    return;
  }
  if (!selectedRoad1.geometry || !selectedRoad2.geometry) {
    alert("Geometri ikke tilgængelig for en eller begge veje.");
    return;
  }
  let line1 = turf.multiLineString(selectedRoad1.geometry.coordinates);
  let line2 = turf.multiLineString(selectedRoad2.geometry.coordinates);
  let intersection = turf.lineIntersect(line1, line2);
  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];
    for (let i = 0; i < intersection.features.length; i++) {
      let feat = intersection.features[i];
      let coords = feat.geometry.coordinates;
      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      latLngs.push([wgsLat, wgsLon]);
      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      let marker = L.marker([wgsLat, wgsLon]).addTo(map);
      try {
        let resp = await fetch(revUrl);
        let revData = await resp.json();
        let addressStr = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
        let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
        let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}, ${revData.postnr || ""} ${revData.postnrnavn || ""}`;
        marker.bindPopup(`
          ${addressStr}<br>
          <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
          &nbsp;
          <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
        `).openPopup();
      } catch (err) {
        console.error("Reverse geocoding fejl ved vejkryds:", err);
        marker.bindPopup(`(${wgsLat.toFixed(6)}, ${wgsLon.toFixed(6)})<br>Reverse geocoding fejlede.`).openPopup();
      }
      setCoordinateBox(wgsLat, wgsLon);
      marker.on("popupclose", function() {
        map.removeLayer(marker);
      });
    }
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 16);
    } else {
      map.fitBounds(latLngs);
    }
  }
});

/***************************************************
 * Distance Options – cirkler
 ***************************************************/
var currentCircle = null;
var selectedRadius = null;
function toggleCircle(radius) {
  selectedRadius = radius;
  if (!currentMarker) {
    alert("Vælg venligst en adresse eller klik på kortet først.");
    return;
  }
  let latLng = currentMarker.getLatLng();
  if (currentCircle && currentCircle.getRadius() === radius) {
    map.removeLayer(currentCircle);
    currentCircle = null;
    selectedRadius = null;
    if (map.hasLayer(chargeMapLayer)) {
      map.removeLayer(chargeMapLayer);
    }
  } else {
    if (currentCircle) {
      map.removeLayer(currentCircle);
    }
    currentCircle = L.circle(latLng, {
      radius: radius,
      color: "blue",
      fillOpacity: 0.2
    }).addTo(map);
    if (map.hasLayer(chargeMapLayer)) {
      map.fire('overlayadd', { layer: chargeMapLayer });
    }
  }
}
document.getElementById("btn10").addEventListener("click", function() {
  selectedRadius = 10000;
  toggleCircle(10000);
});
document.getElementById("btn25").addEventListener("click", function() {
  selectedRadius = 25000;
  toggleCircle(25000);
});
document.getElementById("btn50").addEventListener("click", function() {
  selectedRadius = 50000;
  toggleCircle(50000);
});
document.getElementById("btn100").addEventListener("click", function() {
  selectedRadius = 100000;
  toggleCircle(100000);
});

/***************************************************
 * DOMContentLoaded
 ***************************************************/
document.addEventListener("DOMContentLoaded", function() {
  const s = document.getElementById("search");

  // Sæt tilfældig autocomplete-værdi på ALLE søgefelter ved hvert sideload.
  // Chrome kan ikke opbygge historik for et felt der hedder noget nyt hver gang.
  const rnd = () => "x-" + Math.random().toString(36).slice(2);
  ["search","routeFrom","routeTo","routeVia","vej1","vej2"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("autocomplete", rnd());
  });

  // Auto-fokus ved sideload
  s.focus();

  const planBtn = document.getElementById("planRouteBtn");
  if (planBtn) {
    planBtn.addEventListener("click", function() {
      planRouteORS();
    });
  }

  const clearRouteBtn = document.getElementById("clearRouteBtn");
  if (clearRouteBtn) {
    clearRouteBtn.addEventListener("click", function() {
      if (routeFromInput) routeFromInput.value = "";
      if (routeToInput)   routeToInput.value   = "";
      if (routeViaInput)  routeViaInput.value  = "";
      routeFromCoord = null;
      routeToCoord   = null;
      routeViaCoord  = null;

      if (routeFromList) {
        routeFromList.innerHTML = "";
        routeFromList.style.display = "none";
      }
      if (routeToList) {
        routeToList.innerHTML = "";
        routeToList.style.display = "none";
      }
      if (routeViaList) {
        routeViaList.innerHTML = "";
        routeViaList.style.display = "none";
      }

      const routeSummaryEl = document.getElementById("routeSummary");
      if (routeSummaryEl) {
        routeSummaryEl.textContent = "";
      }

      routeLayer.clearLayers();

      // Ryd kun markør, hvis vi IKKE er i "Behold markører"-tilstand
      if (!keepMarkersEnabled && currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
      }
      resetCoordinateBox();
    });
  }

    // Deaktivér "Udland"-søgning hvis ORS-nøgle mangler
  if (foreignSearchToggle && (!ORS_API_KEY || ORS_API_KEY.includes("YOUR_ORS_API_KEY"))) {
    foreignSearchToggle.checked = false;
    foreignSearchToggle.disabled = true;
    foreignSearchToggle.title = "Udland-søgning kræver en gyldig OpenRouteService API-nøgle";

    // Sørg for at infoboksen ikke vises, hvis Udland ikke kan bruges
    if (foreignInfoBox) {
      foreignInfoBox.style.display = "none";
    }
  }

  // Auto-opdater rute når profil/præference ændres – men kun hvis der allerede er en rute
  const routeProfileSel    = document.getElementById("routeProfile");
  const routePreferenceSel = document.getElementById("routePreference");

  function autoRecalculateRoute() {
    if (!routeLayer) return;
    const hasRoute = routeLayer.getLayers().length > 0;
    if (hasRoute) {
      planRouteORS();
    }
  }

  if (routeProfileSel) {
    routeProfileSel.addEventListener("change", autoRecalculateRoute);
  }
  if (routePreferenceSel) {
    routePreferenceSel.addEventListener("change", autoRecalculateRoute);
  }
});

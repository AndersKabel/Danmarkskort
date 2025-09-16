/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

// Cloudflare proxy til VD-reference
const VD_PROXY = "https://vd-proxy.anderskabel8.workers.dev";

function convertToWGS84(x, y) {
  let result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  return [result[1], result[0]];
}

/***************************************************
 * Hjælpefunktion til at kopiere tekst til clipboard
 ***************************************************/
function copyToClipboard(str) {
  let finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr)
    .catch(err => console.error("Could not copy text:", err));
}

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
  setTimeout(() => popup.remove(), 1500);
}

/***************************************************
 * Funktion til beregning af sorteringsprioritet
 ***************************************************/
function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse") text = item.tekst || "";
  else if (item.type === "stednavn") text = item.navn || "";
  else if (item.type === "strandpost") text = item.tekst || "";

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText === lowerQuery) return 0;
  if (lowerText.startsWith(lowerQuery)) return 1;
  if (lowerText.includes(lowerQuery)) return 2;
  return 3;
}

/***************************************************
 * Opret Leaflet-kort og lag
 ***************************************************/
var map = L.map('map', { center: [56, 10], zoom: 7, zoomControl: false });

var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: "© OpenStreetMap contributors" }
).addTo(map);

var ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  { layers: "orto_foraar", format: "image/jpeg", version: "1.1.1", attribution: "Ortofoto © Kortforsyningen" }
);

var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer", format: "image/png", transparent: true, version: "1.3.0"
});

const baseMaps = { "OpenStreetMap": osmLayer, "Satellit": ortofotoLayer };
const overlayMaps = { "Strandposter": redningsnrLayer };

L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Strandposter-søgning setup
 ***************************************************/
var allStrandposter = [];
var strandposterReady = false;

function fetchAllStrandposter() {
  return fetch("Strandposter")
    .then(resp => resp.json())
    .then(geojson => {
      if (geojson.features) {
        allStrandposter = geojson.features;
        strandposterReady = true;
      }
    })
    .catch(err => console.error("Fejl ved hentning af strandposter:", err));
}

map.on("overlayadd", function(event) {
  if (event.name === "Strandposter") {
    if (allStrandposter.length === 0) {
      fetchAllStrandposter();
    }
  }
});

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
          [lat, lon] = convertToWGS84(coords[0], coords[1]);
        } else {
          lon = coords[0]; lat = coords[1];
        }
        return { type: "strandpost", tekst, lat, lon, feature };
      });
      resolve(results);
    }
    if (allStrandposter.length === 0) {
      fetchAllStrandposter().then(filterAndMap).catch(() => resolve([]));
    } else {
      filterAndMap();
    }
  });
}

/***************************************************
 * doSearch => kombinerer adresser, stednavne og strandposter
 ***************************************************/
function doSearch(query, listElement) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  let stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;

  let strandPromise = (map.hasLayer(redningsnrLayer) && strandposterReady)
    ? doSearchStrandposter(query)
    : Promise.resolve([]);

  Promise.all([
    fetch(addrUrl).then(r => r.json()).catch(() => []),
    fetch(stedUrl).then(r => r.json()).catch(() => {}),
    strandPromise
  ])
  .then(([addrData, stedData, strandData]) => {
    listElement.innerHTML = "";
    let addrResults = (addrData || []).map(item => ({
      type: "adresse", tekst: item.tekst, adgangsadresse: item.adgangsadresse
    }));

    let stedResults = [];
    if (stedData) {
      if (Array.isArray(stedData.results)) {
        stedResults = stedData.results.map(result => ({
          type: "stednavn", navn: result.visningstekst || result.navn,
          bbox: result.bbox || null, geometry: result.geometry
        }));
      } else if (Array.isArray(stedData)) {
        stedResults = stedData.map(result => ({
          type: "stednavn", navn: result.visningstekst || result.skrivemaade_officiel,
          bbox: result.bbox || null, geometry: result.geometri
        }));
      }
    }

    let combined = [...addrResults, ...stedResults, ...strandData];
    combined.sort((a, b) => getSortPriority(a, query) - getSortPriority(b, query));

    combined.forEach(obj => {
      let li = document.createElement("li");
      li.innerHTML = obj.type === "strandpost" ? `🛟 ${obj.tekst}` :
                     obj.type === "adresse" ? `🏠 ${obj.tekst}` :
                     `📍 ${obj.navn}`;
      li.addEventListener("click", () => {
        if (obj.type === "strandpost") {
          setCoordinateBox(obj.lat, obj.lon);
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
        }
        // (her indsætter du din eksisterende klik-logik for adresser/stednavne/strandposter)
        listElement.innerHTML = "";
        listElement.style.display = "none";
      });
      listElement.appendChild(li);
    });

    listElement.style.display = combined.length > 0 ? "block" : "none";
  });
}

/***************************************************
 * Hjælpefunktioner til marker & koordinater
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  if (coords[0] > 90 || coords[1] > 90) coords = convertToWGS84(coords[0], coords[1]);
  let lat = coords[0], lon = coords[1];
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);
  document.getElementById("address").textContent = displayText;
}

function setCoordinateBox(lat, lon) {
  const coordinateBox = document.getElementById("coordinateBox");
  coordinateBox.innerHTML = `Koordinater: <span>${lat.toFixed(6)}</span>, <span>${lon.toFixed(6)}</span>`;
  coordinateBox.style.display = "block";
}

function resetCoordinateBox() {
  const coordinateBox = document.getElementById("coordinateBox");
  coordinateBox.textContent = "";
  coordinateBox.style.display = "none";
}

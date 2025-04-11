/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(easting, northing) {
  // proj4 konverterer [easting, northing] til [lon, lat]
  let result = proj4("EPSG:25832", "EPSG:4326", [easting, northing]);
  console.log("convertToWGS84:", easting, northing, "=>", result);
  return [result[1], result[0]]; // Returner [lat, lon] til Leaflet
}

/***************************************************
 * Hjælpefunktion til at kopiere tekst til clipboard
 ***************************************************/
function copyToClipboard(str) {
  let finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr)
    .then(() => console.log("Copied to clipboard:", finalStr))
    .catch(err => console.error("Could not copy text:", err));
}

/***************************************************
 * Funktion til beregning af sorteringsprioritet
 ***************************************************/
function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse") text = item.tekst || "";
  else if (item.type === "stednavn") text = item.navn || "";
  else if (item.type === "strandpost") text = item.tekst || "";
  let lowerText = text.toLowerCase();
  let lowerQuery = query.toLowerCase();
  if (lowerText === lowerQuery) return 0;
  if (lowerText.startsWith(lowerQuery)) return 1;
  if (lowerText.includes(lowerQuery)) return 2;
  return 3;
}

/***************************************************
 * Dataopdatering (24 timer) for strandposter
 ***************************************************/
function getLastUpdated() { return localStorage.getItem("strandposterLastUpdated"); }
function setLastUpdated() { localStorage.setItem("strandposterLastUpdated", Date.now()); }
function shouldUpdateData() {
  let lastUpdated = getLastUpdated();
  if (!lastUpdated) return true;
  return (Date.now() - parseInt(lastUpdated, 10) > 86400000);
}

/***************************************************
 * Opret Leaflet-kort og lag
 ***************************************************/
var map = L.map("map", {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur" }
).addTo(map);

var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

var baseMaps = { "OpenStreetMap": osmLayer };
var overlayMaps = { "Strandposter": redningsnrLayer };

L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Kommune-info
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Strandposter-hentning
 ***************************************************/
var allStrandposter = [];

function fetchAllStrandposter() {
  let wfsUrl = "https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS" +
               "&version=1.1.0" +
               "&request=GetFeature" +
               "&typeName=nobc:Redningsnummer" +
               "&outputFormat=application/json";
  console.log("Henter alle strandposter fra:", wfsUrl);
  return fetch(wfsUrl)
    .then(resp => resp.json())
    .then(geojson => {
      if (geojson.features) {
        allStrandposter = geojson.features;
        console.log("Alle strandposter hentet:", allStrandposter);
        setLastUpdated();
      } else {
        console.warn("Ingen strandposter modtaget.");
      }
    })
    .catch(err => console.error("Fejl ved hentning af strandposter:", err));
}

map.on("overlayadd", function(e) {
  if (e.name === "Strandposter") {
    console.log("Strandposter laget er tilføjet.");
    if (shouldUpdateData()) {
      console.log("Data er ældre end 24 timer – henter opdaterede strandposter...");
      fetchAllStrandposter();
    } else {
      console.log("Data er opdaterede – ingen hentning nødvendig.");
    }
  }
});

/***************************************************
 * Kort-click => Reverse geocoding
 ***************************************************/
map.on("click", function(e) {
  let lat = e.latlng.lat;
  let lon = e.latlng.lng;
  if (currentMarker) { map.removeLayer(currentMarker); }
  currentMarker = L.marker([lat, lon]).addTo(map);
  document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";

  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
    .then(r => r.json())
    .then(data => { updateInfoBox(data, lat, lon); })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * updateInfoBox => Vis data i den fælles infoBox
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  console.log("updateInfoBox modtager data:", data);
  let streetviewLink = document.getElementById("streetviewLink");
  let addressEl = document.getElementById("address");
  let extraInfoEl = document.getElementById("extra-info");
  let skraaFotoLink = document.getElementById("skraafotoLink");

  // Saml fuld adresse (brug evt. adressebetegnelse, hvis tilgængeligt)
  let fuldAdresse = data.adressebetegnelse || `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
  addressEl.textContent = fuldAdresse;
  // Opdater søgefeltet med fuld adresse
  document.getElementById("search").value = fuldAdresse;

  // StreetView-link
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;

  // Extra info: Kommunekode, Vejkode og koordinater (de vises både i infoBox og overlay hvis ønsket)
  let kk = data.kommunekode || "?";
  let vk = data.vejkode || "?";
  extraInfoEl.textContent = `Kommunekode: ${kk} | Vejkode: ${vk} | Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  
  // Skråfoto-link
  skraaFotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(fuldAdresse)}`;
  skraaFotoLink.style.display = "inline";

  // Vis statsvej-data (hvis tilgængeligt)
  let statsvejData = await checkForStatsvej(lat, lon);
  let statsvejInfoEl = document.getElementById("statsvejInfo");
  if (statsvejData) {
    statsvejInfoEl.innerHTML = `
      <strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
      <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
      <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
      <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
      <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}
    `;
    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }

  // Vis kommuneOverlay med kommunekode og vejkode
  let kommuneOverlay = document.getElementById("kommuneOverlay");
  kommuneOverlay.style.display = "block";
  kommuneOverlay.textContent = `Kommunekode: ${kk} | Vejkode: ${vk}`;

  document.getElementById("infoBox").style.display = "block";

  // Hent yderligere kommuneinfo (døde dyr, gader og veje)
  if (data.kommunekode) {
    try {
      let komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
      let komResp = await fetch(komUrl);
      if (komResp.ok) {
        let komData = await komResp.json();
        let kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          let info = kommuneInfo[kommunenavn];
          let doedeDyr = info["Døde dyr"];
          let gaderVeje = info["Gader og veje"];
          extraInfoEl.innerHTML += `<br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
        }
      }
    } catch (e) {
      console.error("Kunne ikke hente kommuneinfo:", e);
    }
  }
}

/***************************************************
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  console.log("placeMarkerAndZoom kaldt med:", coords, displayText);
  // Hvis koordinaterne er i UTM-format (typisk hvis første værdi > 90), så konverter
  if (coords[0] > 90 || coords[1] > 90) {
    let converted = convertToWGS84(coords[0], coords[1]);
    console.log("Konverteret UTM til lat/lon:", converted);
    coords = converted;
  }
  let lat = coords[0], lon = coords[1];
  if (currentMarker) { map.removeLayer(currentMarker); }
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);
  document.getElementById("address").textContent = displayText;
  document.getElementById("streetviewLink").href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * doSearchStrandposter
 ***************************************************/
function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise((resolve) => {
    function filterAndMap() {
      let results = allStrandposter.filter(feature => {
        let rednr = (feature.properties.StrandNr || "").toLowerCase();
        return rednr.includes(query);
      }).map(feature => {
        let rednr = feature.properties.StrandNr;
        let tekst = `Redningsnummer: ${rednr}`;
        let coords = feature.geometry.coordinates;
        let lat, lon;
        if (coords[0] > 90 || coords[1] > 90) {
          let converted = convertToWGS84(coords[0], coords[1]);
          lat = converted[0];
          lon = converted[1];
        } else { lon = coords[0]; lat = coords[1]; }
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
    } else { filterAndMap(); }
  });
}

/***************************************************
 * doSearch (kombinerer adresser, stednavne og strandposter)
 ***************************************************/
function doSearch(query, listElement) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  // Stednavne (brug f.eks. Dataforsyningen-stednavne via gsearch)
  let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?username=YOUR_USERNAME&password=YOUR_PASSWORD&stednavn=${encodeURIComponent(query+'*')}`;
  let strandPromise = doSearchStrandposter(query);

  Promise.all([
    fetch(addrUrl).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
    fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; }),
    strandPromise
  ])
  .then(([addrData, stedData, strandData]) => {
    console.log("addrData:", addrData);
    console.log("stedData:", stedData);
    console.log("strandData:", strandData);
    listElement.innerHTML = "";
    let searchItems = [];
    
    let addrResults = (addrData || []).map(item => ({
      type: "adresse",
      tekst: item.tekst,
      adgangsadresse: item.adgangsadresse
    }));

    let stedResults = [];
    if (stedData && Array.isArray(stedData.features)) {
      stedData.features.forEach(feature => {
        if (feature.properties && feature.properties.stednavneliste) {
          feature.properties.stednavneliste.forEach(sted => {
            stedResults.push({
              type: "stednavn",
              navn: sted.navn,
              bbox: feature.bbox || null,
              geometry: feature.geometry
            });
          });
        }
      });
    }
    let combined = [...addrResults, ...stedResults, ...strandData];

    // Prioriter: stednavn over adresse
    combined.sort((a, b) => {
      if (a.type === "stednavn" && b.type === "adresse") return -1;
      if (a.type === "adresse" && b.type === "stednavn") return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });

    combined.forEach(obj => {
      let li = document.createElement("li");
      if (obj.type === "strandpost") li.innerHTML = `🛟 ${obj.tekst}`;
      else if (obj.type === "adresse") li.innerHTML = `🏠 ${obj.tekst}`;
      else if (obj.type === "stednavn") li.innerHTML = `📍 ${obj.navn}`;

      li.addEventListener("click", function() {
        if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              let [lon, lat] = addressData.adgangspunkt.koordinater;
              // Sæt fuld adresse i søgefeltet
              document.getElementById("search").value = addressData.adressebetegnelse || `${addressData.vejnavn} ${addressData.husnr}, ${addressData.postnr} ${addressData.postnrnavn}`;
              document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
              document.getElementById("coordinateBox").style.display = "block";
              placeMarkerAndZoom([lat, lon], addressData.adressebetegnelse || obj.tekst);
              updateInfoBox(addressData, lat, lon);
              listElement.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        } else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0].length > 0) {
          let [x, y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([y, x], obj.navn);
        } else if (obj.type === "strandpost") {
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
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
 * doSearchRoad (bruges til vej-søgning)
 ***************************************************/
function doSearchRoad(query, listElement, inputField) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  console.log("doSearchRoad kaldt med query:", query, "=>", addrUrl);
  fetch(addrUrl)
    .then(response => response.json())
    .then(data => {
      listElement.innerHTML = "";
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
          console.log("Valgt vejnavn:", vejnavn, "=> henter detaljer for adgangsadresse:", adgangsId);
          if (!adgangsId) {
            console.error("Ingen adgangsadresse.id => kan ikke slå vejkode op");
            return;
          }
          let detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
          console.log("detailUrl:", detailUrl);
          fetch(detailUrl)
            .then(r => r.json())
            .then(async detailData => {
              console.log("Detaljeret adressedata:", detailData);
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
              } else {
                selectedRoad2 = roadSelection;
              }
              console.log("Selected road:", roadSelection);
            })
            .catch(err => console.error("Fejl i fetch /adgangsadresser/{id}:", err));
        });
        listElement.appendChild(li);
      });
      listElement.style.display = data.length > 0 ? "block" : "none";
    })
    .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * getNavngivenvejKommunedelGeometry
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  let url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  console.log("Henter navngivenvejkommunedel-data:", url);
  try {
    let r = await fetch(url);
    let data = await r.json();
    console.log("Svar fra navngivenvejkommunedel:", data);
    if (Array.isArray(data) && data.length > 0) {
      let first = data[0];
      if (first.navngivenVej && first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje) {
        let wktString = first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje;
        console.log("Fandt WKT streng:", wktString);
        let geojson = wellknown.parse(wktString);
        console.log("Parsed WKT => GeoJSON:", geojson);
        return geojson;
      } else {
        console.warn("Ingen WKT streng for husnummer:", husnummerId);
      }
    } else {
      console.warn("Ingen elementer for husnummer:", husnummerId);
    }
  } catch (err) {
    console.error("Fejl i getNavngivenvejKommunedelGeometry:", err);
  }
  return null;
}

/***************************************************
 * checkForStatsvej (Geocloud)
 ***************************************************/
async function checkForStatsvej(lat, lon) {
  console.log("Koordinater sendt til Geocloud:", lat, lon);
  let [utmX, utmY] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
  let buffer = 100;
  let bbox = `${utmX - buffer},${utmY - buffer},${utmX + buffer},${utmY + buffer}`;
  let url = `https://geocloud.vd.dk/CVF/wms?
SERVICE=WMS&
VERSION=1.1.1&
REQUEST=GetFeatureInfo&
INFO_FORMAT=application/json&
TRANSPARENT=true&
LAYERS=CVF:veje&
QUERY_LAYERS=CVF:veje&
SRS=EPSG:25832&
WIDTH=101&
HEIGHT=101&
BBOX=${bbox}&
X=50&
Y=50`;
  console.log("API-kald til Geocloud:", url);
  try {
    let response = await fetch(url);
    let textData = await response.text();
    console.log("Rå server response:", textData);
    if (textData.startsWith("Results")) {
      console.warn("Modtaget tekstsvar, ikke JSON. Forsøger at parse...");
      return parseTextResponse(textData);
    }
    let jsonData = JSON.parse(textData);
    console.log("JSON-parsed data:", jsonData);
    if (jsonData.features && jsonData.features.length > 0) {
      return jsonData.features[0].properties;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Fejl ved hentning af statsvejdata:", error);
    return null;
  }
}

/***************************************************
 * Luk-knapper
 ***************************************************/
const statsvejCloseBtn = document.getElementById("statsvejCloseBtn");
statsvejCloseBtn.addEventListener("click", function() {
  document.getElementById("statsvejInfoBox").style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

/***************************************************
 * "Find X"-knap (Turf.js intersection)
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
  console.log("Intersection result:", intersection);
  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];
    for (let feat of intersection.features) {
      let coords = feat.geometry.coordinates;
      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      console.log("Reverse geocoding for intersection:", revUrl);
      let revResp = await fetch(revUrl);
      let revData = await revResp.json();
      let popupText = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
      let marker = L.marker([wgsLat, wgsLon]).addTo(map);
      marker.bindPopup(popupText.trim()).openPopup();
      latLngs.push([wgsLat, wgsLon]);
    }
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 16);
    } else {
      map.fitBounds(latLngs);
    }
  }
});

/***************************************************
 * Distance Options – Tegn cirkel
 ***************************************************/
var currentCircle = null;
function toggleCircle(radius) {
  if (!currentMarker) {
    alert("Vælg en adresse eller klik på kortet først.");
    return;
  }
  let latLng = currentMarker.getLatLng();
  if (currentCircle && currentCircle.getRadius() === radius) {
    map.removeLayer(currentCircle);
    currentCircle = null;
  } else {
    if (currentCircle) { map.removeLayer(currentCircle); }
    currentCircle = L.circle(latLng, {
      radius: radius,
      color: "blue",
      fillOpacity: 0.2
    }).addTo(map);
  }
}
document.getElementById("btn10").addEventListener("click", function() { toggleCircle(10000); });
document.getElementById("btn50").addEventListener("click", function() { toggleCircle(50000); });
document.getElementById("btn100").addEventListener("click", function() { toggleCircle(100000); });

/***************************************************
 * DOMContentLoaded
 ***************************************************/
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("search").focus();
});

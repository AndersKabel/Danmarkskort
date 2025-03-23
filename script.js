/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
  let result = proj4("EPSG:25832", "EPSG:4326", [y, x]); // Bytter x og y
  console.log("convertToWGS84 input:", x, y, "=> output:", result);
  return [result[1], result[0]]; // Returnerer lat, lon i korrekt rækkefølge
}

/***************************************************
 * Leaflet-kort
 ***************************************************/
var map = L.map('map', {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

// (A) WMS-lag for Redningsnummer via geoserver
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",      // ifølge <Name> i WMS-laget
  format: "image/png",
  transparent: true,
  version: "1.3.0",              // serveren rapporterer version="1.3.0"
  attribution: "Data: redningsnummer.dk"
});

// OpenStreetMap-lag
var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
  }
).addTo(map);

// Opret base-lag (baggrundskort)
const baseMaps = {
  "OpenStreetMap": osmLayer
};

// Opret overlay-lag (punkter)
const overlayMaps = {
  "Strandposter": redningsnrLayer
};

// Tilføj lagvælgeren
L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Kommunedata hentet fra "Kommuner.xlsx"
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Klik på kort => reverse geocoding (Dataforsyningen)
 ***************************************************/
map.on('click', function(e) {
  var lat = e.latlng.lat;
  var lon = e.latlng.lng;

  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);

  // Opdater koordinatboksen med de klik-koordinerede
  document.getElementById("coordinateBox").textContent =
    `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";

  // Reverse geocoding mod Dataforsyningen
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
    .then(r => r.json())
    .then(data => {
      updateInfoBox(data, lat, lon);
    })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * Opdatering af info boks
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");

  const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
  const ekstraInfoStr = `Kommunekode: ${data.kommunekode || "?"} | Vejkode: ${data.vejkode || "?"}`;

  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = adresseStr;

  if (extraInfoEl) {
    extraInfoEl.textContent = ekstraInfoStr;
  }

  // Opdater Skråfoto-linket
  let eastNorth = convertToWGS84(lat, lon);
  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "block"; // Vis linket

  // Ryd tidligere søgeresultater (hvis nogen)
  if (resultsList) resultsList.innerHTML = "";
  if (vej1List) vej1List.innerHTML = "";
  if (vej2List) vej2List.innerHTML = "";

  // Vent på statsvejsdata
  let statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");

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

  document.getElementById("infoBox").style.display = "block";

  // Hvis der er en kommunekode, så hent kommuneinfo
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
 * Søgefelter, lister
 ***************************************************/
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Tilføj clear-knap til input
function addClearButton(inputElement, listElement) {
  let clearBtn = document.createElement("span");
  clearBtn.innerHTML = "&times;";
  clearBtn.classList.add("clear-button");
  inputElement.parentElement.appendChild(clearBtn);

  inputElement.addEventListener("input", function () {
    clearBtn.style.display = inputElement.value.length > 0 ? "inline" : "none";
  });

  clearBtn.addEventListener("click", function () {
    inputElement.value = "";
    listElement.innerHTML = "";
    clearBtn.style.display = "none";
  });

  inputElement.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && inputElement.value.length === 0) {
      listElement.innerHTML = "";
    }
  });

  clearBtn.style.display = "none";
}

addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

// Piletaster i #search
var items = [];
var currentIndex = -1;

/***************************************************
 * #search => doSearch
 ***************************************************/
searchInput.addEventListener("input", function() {
  const txt = searchInput.value.trim();
  if (txt.length < 2) {
    clearBtn.style.display = "none";
    resultsList.innerHTML = "";
    document.getElementById("infoBox").style.display = "none";
    return;
  }
  clearBtn.style.display = "inline";
  doSearch(txt, resultsList);

  // Tjek om brugeren har tastet koordinater i formatet "lat,lon"
  const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
  if (coordRegex.test(txt)) {
    const match = txt.match(coordRegex);
    const latNum = parseFloat(match[1]);
    const lonNum = parseFloat(match[2]);
    // Reverse geocoding
    let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl)
      .then(r => r.json())
      .then(data => {
        resultsList.innerHTML = "";
        placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
        updateInfoBox(data, latNum, lonNum);
      })
      .catch(err => console.error("Reverse geocoding fejl (koord-søgning):", err));
    return;
  }
});

searchInput.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") {
    document.getElementById("infoBox").style.display = "none";
    document.getElementById("coordinateBox").style.display = "none";
  }
});

vej1Input.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") {
    document.getElementById("infoBox").style.display = "none";
  }
});

vej2Input.addEventListener("keydown", function() {
  document.getElementById("infoBox").style.display = "none";
});

// Piletaster i #search
searchInput.addEventListener("keydown", function(e) {
  if (items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    currentIndex = (currentIndex + 1) % items.length;
    highlightItem();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    currentIndex = (currentIndex + items.length - 1) % items.length;
    highlightItem();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (currentIndex >= 0) {
      items[currentIndex].click();
    }
  }
});

function highlightItem() {
  items.forEach(li => li.classList.remove("highlight"));
  if (currentIndex >= 0 && currentIndex < items.length) {
    items[currentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Klik på kryds => ryd
 ***************************************************/
clearBtn.addEventListener("click", function() {
  searchInput.value = "";
  resultsList.innerHTML = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
});

function resetInfoBox() {
  document.getElementById("extra-info").textContent = "";
  document.getElementById("skraafotoLink").style.display = "none";
}

searchInput.addEventListener("keydown", function(e) {
  if (e.key === "Backspace" && searchInput.value.length === 0) {
    resetInfoBox();
  }
});

clearBtn.addEventListener("click", function() {
  resetInfoBox();
});

vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej1Input.value = "";
  vej1List.innerHTML = "";
  document.getElementById("infoBox").style.display = "none";
});

vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej2Input.value = "";
  vej2List.innerHTML = "";
  document.getElementById("infoBox").style.display = "none";
});

/***************************************************
 * Globale variabler til at gemme valgte veje
 ***************************************************/
var selectedRoad1 = null;
var selectedRoad2 = null;

/***************************************************
 * vej1 => doSearch (autocomplete for vejnavn)
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 2) {
    vej1List.innerHTML = "";
    vej1List.style.display = "none";
    return;
  }
  doSearchRoad(txt, vej1List, vej1Input);
});

/***************************************************
 * vej2 => doSearch (autocomplete for vejnavn)
 ***************************************************/
vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 2) {
    vej2List.innerHTML = "";
    vej2List.style.display = "none";
    return;
  }
  doSearchRoad(txt, vej2List, vej2Input);
});

/***************************************************
 * doSearch => henter addresses + stednavne + STRANDPOSTER
 ***************************************************/
// 1) Ekstra function: søg i Geoserver WFS på redningsnummer-laget
function doSearchStrandposter(query) {
  let cql = `UPPER(redningsnr) LIKE UPPER('%${query}%')`;
  let wfsUrl = `https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS` +
    `&version=1.1.0` +
    `&request=GetFeature` +
    `&typeName=nobc:Redningsnummer` +
    `&outputFormat=application/json` +
    `&cql_filter=${encodeURIComponent(cql)}`;

  console.log("Strandposter WFS URL:", wfsUrl);
  return fetch(wfsUrl)
    .then(resp => resp.json())
    .then(geojson => {
      let arr = [];
      if (geojson.features) {
        geojson.features.forEach(feature => {
          let props = feature.properties;
          let rn = props.redningsnr;
          let tekst = `Redningsnummer: ${rn}`;
          let coords = feature.geometry.coordinates; // [lon, lat]
          let lon = coords[0];
          let lat = coords[1];

          arr.push({
            type: "strandpost",
            tekst: tekst,
            lat: lat,
            lon: lon,
            feature: feature
          });
        });
      }
      return arr;
    })
    .catch(err => {
      console.error("Fejl i doSearchStrandposter:", err);
      return [];
    });
}

// 2) Den eksisterende doSearch, men med Promise.all der også kalder doSearchStrandposter
function doSearch(query, listElement) {
  // Adgangsadresser
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

  // Stednavne (Datafordeler)
  let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?username=NUKALQTAFO&password=Fw62huch!&stednavn=${encodeURIComponent(query + '*')}`;

  // Strandposter
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
      items = [];
      currentIndex = -1;

      // parse addresses => { type: "adresse", tekst, adgangsadresse }
      let addrResults = (addrData || []).map(item => {
        return {
          type: "adresse",
          tekst: item.tekst,
          adgangsadresse: item.adgangsadresse
        };
      });

      // parse stednavne => { type:"stednavn", navn, bbox }
      let stedResults = [];
      if (stedData && stedData.features) {
        stedData.features.forEach(feature => {
          if (feature.properties && feature.properties.stednavneliste) {
            feature.properties.stednavneliste.forEach(sted => {
              stedResults.push({
                type: "stednavn",
                navn: sted.navn,
                bbox: feature.bbox || null
              });
            });
          }
        });
      }

      // Kombiner resultater
      let combined = [...addrResults, ...stedResults, ...strandData];

      combined.forEach(obj => {
        let li = document.createElement("li");
        if (obj.type === "strandpost") {
          li.textContent = obj.tekst;
        } else if (obj.type === "adresse") {
          li.textContent = obj.tekst;
        } else if (obj.type === "stednavn") {
          li.textContent = obj.navn;
        }

        li.addEventListener("click", function() {
          if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
            // fetch /adgangsadresser/{id}
            let detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`;
            fetch(detailUrl)
              .then(r => r.json())
              .then(addressData => {
                let [lon, lat] = addressData.adgangspunkt.koordinater;
                console.log("Placering:", lat, lon);
                placeMarkerAndZoom([lat, lon], obj.tekst);
                // Ryd lister
                resultsList.innerHTML = "";
                vej1List.innerHTML = "";
                vej2List.innerHTML = "";
              })
              .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
          }
          else if (obj.type === "stednavn" && obj.bbox) {
            let [x, y] = [obj.bbox[0], obj.bbox[1]];
            placeMarkerAndZoom([y, x], obj.navn);
          }
          else if (obj.type === "strandpost") {
            placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
            let props = obj.feature.properties;
            let e = document.getElementById("extra-info");
            e.textContent = `Flere data: Parkeringsplads: ${props.ppl} ...?`;
          }
        });

        listElement.appendChild(li);
        if (listElement === resultsList) {
          items.push(li);
        }
      });
    })
    .catch(err => console.error("Fejl i doSearch:", err));
}

/***************************************************
 * vej1 og vej2 => autocomplete (vejnavn + kommune)
 * Vi filtrerer, så kun ét resultat pr. (vejnavn, postnr) vises.
 * Og når en vej vælges, hentes detaljer (kommunekode og vejkode)
 ***************************************************/
function doSearchRoad(query, listElement, inputField) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

  fetch(addrUrl)
    .then(response => response.json())
    .then(data => {
      listElement.innerHTML = "";
      items = [];
      currentIndex = -1;

      data.sort((a, b) => a.tekst.localeCompare(b.tekst));

      const unique = new Set();
      data.forEach(item => {
        let vejnavn = item.adgangsadresse?.vejnavn || "Ukendt vej";
        let kommune = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
        let postnr  = item.adgangsadresse?.postnr || "?";
        let key = `${vejnavn}-${postnr}`;
        if (unique.has(key)) return;
        unique.add(key);

        let li = document.createElement("li");
        li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

        li.addEventListener("click", function() {
          inputField.value = vejnavn;
          listElement.innerHTML = "";
          listElement.style.display = "none";

          // Ekstra fetch til Navngivenvej for at hente kommunekode og vejkode
          let navUrl = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvej?username=NUKALQTAFO&password=Fw62huch!&Format=JSON&status=3&struktur=flad&fritekst=${encodeURIComponent(vejnavn)}`;
          console.log("Fetching navngivenvej detaljer for road:", navUrl);
          fetch(navUrl)
            .then(response => response.json())
            .then(data => {
              if (Array.isArray(data) && data.length > 0) {
                let roadDetails = data[0]; // antag første resultat
                let roadSelection = {
                  vejnavn: vejnavn,
                  kommunekode: roadDetails.kommunekode,
                  vejkode: roadDetails.vejkode
                };
                if (inputField.id === "vej1") {
                  selectedRoad1 = roadSelection;
                } else if (inputField.id === "vej2") {
                  selectedRoad2 = roadSelection;
                }
                console.log("Selected road:", roadSelection);
              } else {
                console.error("Ingen navngivne vej detaljer fundet for", vejnavn);
              }
            })
            .catch(err => console.error("Fejl i fetch af navngivenvej detaljer:", err));
        });

        listElement.appendChild(li);
        items.push(li);
      });

      listElement.style.display = data.length > 0 ? "block" : "none";
    })
    .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom([lat, lon], displayText) {
  console.log("placeMarkerAndZoom kaldt med:", lat, lon, displayText);
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);

  document.getElementById("address").textContent = displayText;
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  console.log("HTML-elementer:",
    document.getElementById("address"),
    document.getElementById("streetviewLink"),
    document.getElementById("infoBox")
  );
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej => henter statsvej (Geocloud)
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
      console.warn("Modtaget et tekstsvar, ikke JSON. Prøver at udtrække data...");
      let extractedData = parseTextResponse(textData);
      return extractedData;
    }

    let jsonData = JSON.parse(textData);
    console.log("JSON-parsed data:", jsonData);

    if (jsonData.features && jsonData.features.length > 0) {
      return jsonData.features[0].properties;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Fejl ved hentning af vejdata:", error);
    return null;
  }
}

// Funktion til at parse tekstsvar
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
  console.log("Parsed tekstbaserede data:", data);
  return data;
}

/***************************************************
 * Statsvej / info-bokse
 ***************************************************/
const statsvejInfoBox   = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn  = document.getElementById("statsvejCloseBtn");

// Klik på kryds => luk statsvejInfoBox
statsvejCloseBtn.addEventListener("click", function() {
  statsvejInfoBox.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";

  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

// Luk-knap til #infoBox
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
 * Hent vejgeometri fra Datafordeler (Navngivenvej)
 * (Til Find X, hvis du vil bruge)
 ***************************************************/
async function getRoadGeometry(kommunekode, vejkode) {
  // Bemærk: URL med parametre for status=3, geometri=fuld og Format=JSON
  let url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvej?username=NUKALQTAFO&password=Fw62huch!&Format=JSON&status=3&kommunekode=${kommunekode}&vejkode=${vejkode}&struktur=flad&geometri=fuld`;
  console.log("Henter vejgeometri (Datafordeler):", url);

  try {
    let r = await fetch(url);
    let data = await r.json();
    console.log("getRoadGeometry data:", data);

    if (Array.isArray(data) && data.length > 0 && data[0].geometri) {
      // Forvent at data[0].geometri er en MultiLineString
      return data[0].geometri;
    }
  } catch (err) {
    console.error("Fejl i getRoadGeometry:", err);
  }
  return null;
}

/***************************************************
 * "Find X"-knap => find intersection med Turf.js
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async function() {
  // Tjek om begge veje er valgt
  if (!selectedRoad1 || !selectedRoad2) {
    alert("Vælg venligst to veje først.");
    return;
  }

  // Hent geometri for vej1
  let geom1 = await getRoadGeometry(selectedRoad1.kommunekode, selectedRoad1.vejkode);
  // Hent geometri for vej2
  let geom2 = await getRoadGeometry(selectedRoad2.kommunekode, selectedRoad2.vejkode);

  if (!geom1 || !geom2) {
    alert("Kunne ikke hente geometri for en eller begge veje.");
    return;
  }

  // Omdan til Turf-geometrier (antager MultiLineString)
  let line1 = turf.multiLineString(geom1.coordinates);
  let line2 = turf.multiLineString(geom2.coordinates);

  // Find eventuelle kryds
  let intersection = turf.lineIntersect(line1, line2);
  console.log("Intersection result:", intersection);

  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    alert(`Fundet ${intersection.features.length} kryds!`);
    intersection.features.forEach((feat, idx) => {
      let coords = feat.geometry.coordinates; // [lon, lat]
      let latlng = [coords[1], coords[0]];
      let marker = L.marker(latlng).addTo(map);
      marker.bindPopup(`Kryds #${idx + 1}`).openPopup();
    });
  }
});

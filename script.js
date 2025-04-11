/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
  // Forvent, at input x,y er UTM-koordinater (x = easting, y = northing)
  let result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  // Returnér [lat, lon] til Leaflet
  return [result[1], result[0]];
}

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

/***************************************************
 * Dataopdatering (24 timer)
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
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
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

var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

const baseMaps = { 
  "OpenStreetMap": osmLayer,
  "Satellit": ortofotoLayer
};
const overlayMaps = { 
  "Strandposter": redningsnrLayer
};

L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Kommunedata (fra Kommuner.xlsx)
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Global variabel til Strandposter-søgning
 ***************************************************/
var allStrandposter = [];

function fetchAllStrandposter() {
  let wfsUrl = `https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS` +
               `&version=1.1.0&request=GetFeature&typeName=nobc:Redningsnummer&outputFormat=application/json`;
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
         .catch(err => {
           console.error("Fejl ved hentning af strandposter:", err);
         });
}

map.on("overlayadd", function(event) {
  if (event.name === "Strandposter") {
    console.log("Strandposter laget er tilføjet.");
    if (shouldUpdateData()) {
      console.log("Data er ældre end 24 timer – henter opdaterede strandposter...");
      fetchAllStrandposter();
    } else {
      console.log("Data er opdaterede – ingen hentning nødvendig.");
    }
  }
});

function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise((resolve) => {
    function filterAndMap() {
      let results = allStrandposter.filter(feature => {
        let rednr = (feature.properties.StrandNr || "").toLowerCase();
        console.log("Sammenligner:", rednr, "med query:", query);
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
      console.log("Filtrerede strandposter:", results);
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
 * Klik på kort => reverse geocoding
 ***************************************************/
map.on('click', function(e) {
  let lat = e.latlng.lat;
  let lon = e.latlng.lng;
  if (currentMarker) { map.removeLayer(currentMarker); }
  currentMarker = L.marker([lat, lon]).addTo(map);
  document.getElementById("coordinateBox").textContent =
    `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
    .then(r => r.json())
    .then(data => { updateInfoBox(data, lat, lon); })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * Opdatering af info boks (én samlet boks)
 * – Her vises den fulde adresse (fra det detaljerede kald) samt Eva.Net/Notes-kopieringer.
 * – Koordinater vises ikke her; de vises kun i coordinateBox.
 * – Kommunekode og vejkode flyttes til overlay (#kommuneOverlay)
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");

  // Hvis data kommer fra reverse geocoding, er strukturen: data.vejnavn, data.husnr, m.m.
  // Hvis data kommer fra detaljekaldet, skal vi bruge data.adgangsadresse.x/y og fulde felter.
  // For at få den fulde adresse, tjekker vi, om data.adgangsadresse findes:
  let fullAddress = "";
  if (data.adgangsadresse) {
    // Brug de opdaterede felter fra detaljekaldet
    fullAddress = data.adgangsadresse.vejnavn + " " +
                  data.adgangsadresse.husnr + ", " +
                  data.adgangsadresse.postnr + " " +
                  data.adgangsadresse.postnrnavn;
    // Opdatér søgefeltet med den fulde adresse
    document.getElementById("search").value = fullAddress;
    // Brug koordinaterne fra detaljekaldet
    lat = parseFloat(data.adgangsadresse.y);
    lon = parseFloat(data.adgangsadresse.x);
  } else {
    // Hvis ikke, brug de felter vi har
    fullAddress = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
  }
  
  // Opdater infoBox – sæt kun adressen og Eva.Net/Notes-links
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = fullAddress;
  
  // Nulstil extraInfoEl, som kun skal indeholde Eva.Net/Notes-links (eventuelt ekstra info hvis ønsket)
  extraInfoEl.textContent = "";
  let evaFormat = `${data.vejnavn || ""},${data.husnr || ""},${data.postnr || ""}`;
  let notesFormat = `${data.vejnavn || ""} ${data.husnr || ""}\\n${data.postnr || ""} ${data.postnrnavn || ""}`;
  extraInfoEl.innerHTML += `<a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> | <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>`;
  
  // Fjern kommunekode & vejkode info fra extraInfoEl – den placeres i overlay
  // Vis skråfoto-link
  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(fullAddress)}`;
  skråfotoLink.style.display = "block";
  
  document.getElementById("infoBox").style.display = "block";
  
  // Hent og vis ekstra kommune-information (Kommune:, Døde dyr, Gader og veje)
  if (data.adgangsadresse && data.adgangsadresse.kommunekode) {
    try {
      let komUrl = `https://api.dataforsyningen.dk/kommuner/${data.adgangsadresse.kommunekode}`;
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
  
  // Opdater overlay for Kommunekode/Vejkode – vises nederst i venstre hjørne
  let kk = data.adgangsadresse ? data.adgangsadresse.kommunekode : (data.kommunekode || "");
  let vk = data.adgangsadresse ? data.adgangsadresse.vejkode : (data.vejkode || "");
  let overlay = document.getElementById("kommuneOverlay");
  if (kk || vk) {
    overlay.style.display = "block";
    overlay.textContent = `Kommunekode: ${kk} | Vejkode: ${vk}`;
  } else {
    overlay.style.display = "none";
  }
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

function addClearButton(inputElement, listElement) {
  let btn = document.createElement("span");
  btn.innerHTML = "&times;";
  btn.classList.add("clear-button");
  inputElement.parentElement.appendChild(btn);
  inputElement.addEventListener("input", function () {
    btn.style.display = inputElement.value.length > 0 ? "inline" : "none";
  });
  btn.addEventListener("click", function () {
    inputElement.value = "";
    listElement.innerHTML = "";
    btn.style.display = "none";
  });
  inputElement.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && inputElement.value.length === 0) {
      listElement.innerHTML = "";
    }
  });
  btn.style.display = "none";
}

addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

/***************************************************
 * Globale arrays til piletaster
 ***************************************************/
var searchItems = [];
var searchCurrentIndex = -1;
var vej1Items = [];
var vej1CurrentIndex = -1;
var vej2Items = [];
var vej2CurrentIndex = -1;

/***************************************************
 * #search => doSearch (resultater gemmes i searchItems)
 ***************************************************/
searchInput.addEventListener("input", function() {
  const txt = searchInput.value.trim();
  if (txt.length < 2) {
    clearBtn.style.display = "none";
    resultsList.innerHTML = "";
    document.getElementById("infoBox").style.display = "none";
    searchItems = [];
    return;
  }
  clearBtn.style.display = "inline";
  doSearch(txt, resultsList);
  
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
        placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
        updateInfoBox(data, latNum, lonNum);
      })
      .catch(err => console.error("Reverse geocoding fejl:", err));
    return;
  }
});

searchInput.addEventListener("keydown", function(e) {
  console.log("Search input keydown event, key:", e.key);
  if (searchItems.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex + 1) % searchItems.length;
    highlightSearchItem();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex + searchItems.length - 1) % searchItems.length;
    highlightSearchItem();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (searchCurrentIndex >= 0) {
      console.log("Enter pressed – klik på searchItems index:", searchCurrentIndex);
      searchItems[searchCurrentIndex].click();
    }
  }
});

function highlightSearchItem() {
  console.log("Highlight search item, currentIndex:", searchCurrentIndex);
  searchItems.forEach(li => li.classList.remove("highlight"));
  if (searchCurrentIndex >= 0 && searchCurrentIndex < searchItems.length) {
    searchItems[searchCurrentIndex].classList.add("highlight");
  }
}

searchInput.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") {
    document.getElementById("infoBox").style.display = "none";
  }
});

/***************************************************
 * Vej1 => doSearchRoad + piletaster
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 2) {
    vej1List.innerHTML = "";
    vej1List.style.display = "none";
    vej1Items = [];
    return;
  }
  doSearchRoad(txt, vej1List, vej1Input, "vej1");
});

vej1Input.addEventListener("keydown", function(e) {
  console.log("Vej1 input keydown event, key:", e.key);
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
      console.log("Enter pressed in vej1, index:", vej1CurrentIndex);
      vej1Items[vej1CurrentIndex].click();
    }
  }
});

function highlightVej1Item() {
  console.log("Highlight vej1 item, currentIndex:", vej1CurrentIndex);
  vej1Items.forEach(li => li.classList.remove("highlight"));
  if (vej1CurrentIndex >= 0 && vej1CurrentIndex < vej1Items.length) {
    vej1Items[vej1CurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Vej2 => doSearchRoad + piletaster
 ***************************************************/
vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 2) {
    vej2List.innerHTML = "";
    vej2List.style.display = "none";
    vej2Items = [];
    return;
  }
  doSearchRoad(txt, vej2List, vej2Input, "vej2");
});

vej2Input.addEventListener("keydown", function(e) {
  console.log("Vej2 input keydown event, key:", e.key);
  document.getElementById("infoBox").style.display = "none";
  if (vej2Items.length === 0) return;
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
      console.log("Enter pressed in vej2, index:", vej2CurrentIndex);
      vej2Items[vej2CurrentIndex].click();
    }
  }
});

function highlightVej2Item() {
  console.log("Highlight vej2 item, currentIndex:", vej2CurrentIndex);
  vej2Items.forEach(li => li.classList.remove("highlight"));
  if (vej2CurrentIndex >= 0 && vej2CurrentIndex < vej2Items.length) {
    vej2Items[vej2CurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Klik på clear-knap => ryd
 ***************************************************/
clearBtn.addEventListener("click", function() {
  searchInput.value = "";
  resultsList.innerHTML = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  searchInput.focus();
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
 * doSearchRoad => bruges af vej1/vej2
 ***************************************************/
function doSearchRoad(query, listElement, inputField, which) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  console.log("doSearchRoad kaldt med query:", query, " => ", addrUrl);
  fetch(addrUrl)
    .then(response => response.json())
    .then(data => {
      console.log("Modtaget data fra /adgangsadresser/autocomplete:", data);
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
        let vejnavn = item.adgangsadresse?.vejnavn || "Ukendt vej";
        let kommune = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
        let postnr = item.adgangsadresse?.postnr || "?";
        let adgangsId = item.adgangsadresse?.id || null;
        let key = `${vejnavn}-${postnr}`;
        if (unique.has(key)) return;
        unique.add(key);
        let li = document.createElement("li");
        li.textContent = `${vejnavn}, ${kommune} (${postnr})`;
        li.addEventListener("click", function() {
          // Når en adresse vælges fra resultatsøgningen:
          // Hent detaljeoplysninger og brug data fra "adgangsadresse"
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`)
            .then(r => r.json())
            .then(addressData => {
              console.log("Detaljeret adressedata:", addressData);
              // Ekstrakt koordinater fra detaljekaldet – brug adgangsadresse.x og .y
              let lon = parseFloat(addressData.adgangsadresse.x);
              let lat = parseFloat(addressData.adgangsadresse.y);
              console.log("Brugte koordinater:", lat, lon);
              // Opdater søgefeltet med den fulde adresse
              let fuldAdresse = addressData.adgangsadresse.vejnavn + " " +
                                addressData.adgangsadresse.husnr + ", " +
                                addressData.adgangsadresse.postnr + " " +
                                addressData.adgangsadresse.postnrnavn;
              document.getElementById("search").value = fuldAdresse;
              // Opdater coordinateBox
              document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
              document.getElementById("coordinateBox").style.display = "block";
              placeMarkerAndZoom([lat, lon], fuldAdresse);
              updateInfoBox(addressData, lat, lon);
              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
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
 * doSearchStrandposter => henter strandposter
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
      console.log("Filtrerede strandposter:", results);
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
 * doSearch => kombinerer adresser, stednavne og strandposter
 ***************************************************/
function doSearch(query, listElement) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  let stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;
  let strandPromise = map.hasLayer(redningsnrLayer) ? doSearchStrandposter(query) : Promise.resolve([]);
  
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
    searchItems = [];
    searchCurrentIndex = -1;
    
    let addrResults = (addrData || []).map(item => ({
      type: "adresse",
      tekst: item.tekst,
      adgangsadresse: item.adgangsadresse
    }));
    
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
    
    let combined = [...addrResults, ...stedResults, ...strandData];
    // Prioriter, så stednavne altid kommer øverst
    combined.sort((a, b) => {
      if (a.type === "stednavn" && b.type === "adresse") return -1;
      if (a.type === "adresse" && b.type === "stednavn") return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });
    
    combined.forEach(obj => {
      let li = document.createElement("li");
      if (obj.type === "strandpost") {
        li.innerHTML = `🛟 ${obj.tekst}`;
      } else if (obj.type === "adresse") {
        li.innerHTML = `🏠 ${obj.tekst}`;
      } else if (obj.type === "stednavn") {
        li.innerHTML = `📍 ${obj.navn}`;
      }
      li.addEventListener("click", function() {
        if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}?struktur=mini`)
            .then(r => r.json())
            .then(addressData => {
              // Brug koordinaterne fra detaljekaldet (x og y)
              let lon = parseFloat(addressData.adgangsadresse.x);
              let lat = parseFloat(addressData.adgangsadresse.y);
              console.log("Placering:", lat, lon);
              document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
              document.getElementById("coordinateBox").style.display = "block";
              // Opdatér søgefeltet med den fulde adresse
              let fuldAdresse = addressData.adgangsadresse.vejnavn + " " +
                                addressData.adgangsadresse.husnr + ", " +
                                addressData.adgangsadresse.postnr + " " +
                                addressData.adgangsadresse.postnrnavn;
              document.getElementById("search").value = fuldAdresse;
              placeMarkerAndZoom([lat, lon], fuldAdresse);
              updateInfoBox(addressData, lat, lon);
              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        }
        else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0] && obj.bbox.coordinates[0].length > 0) {
          console.log("Stednavn bbox:", obj.bbox);
          // Bemærk: Hvis koordinaterne i bbox ikke er korrekte, prøv at bytte om
          let [x, y] = obj.bbox.coordinates[0][0];
          console.log("Bruger x:", x, "og y:", y, "og sender:", [y, x]);
          placeMarkerAndZoom([y, x], obj.navn);
        }
        else if (obj.type === "strandpost") {
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          let marker = currentMarker;
          let props = obj.feature.properties;
          let ppl = props.ppl || "N/A";
          let opdateretDato = new Date().toLocaleString();
          marker.bindPopup(`
              <strong>${obj.tekst}</strong><br>
              PPL: ${ppl}<br>
              Opdateret: ${opdateretDato}<br>
              <a href="#" onclick="alert('Se PPL funktion'); return false;">Se PPL</a>
          `).openPopup();
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
 * Hent geometri via navngivenvejkommunedel (WKT => parse)
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
        console.warn("Ingen WKT streng i 'vejnavnebeliggenhed_vejnavnelinje' for husnummer:", husnummerId);
      }
    } else {
      console.warn("Ingen elementer i arrayet for husnummer:", husnummerId);
    }
  } catch (err) {
    console.error("Fejl i getNavngivenvejKommunedelGeometry:", err);
  }
  return null;
}

/***************************************************
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  console.log("placeMarkerAndZoom kaldt med:", coords, displayText);
  if (coords[0] > 90 || coords[1] > 90) {
    let converted = convertToWGS84(coords[0], coords[1]);
    console.log("Konverteret UTM til lat/lon:", converted);
    coords = converted;
  }
  let lat = coords[0], lon = coords[1];
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);
  // Her sættes kun adressen (uden koordinater) ind i infoBox
  document.getElementById("address").textContent = displayText;
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
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
const statsvejInfoBox = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn = document.getElementById("statsvejCloseBtn");
statsvejCloseBtn.addEventListener("click", function() {
  statsvejInfoBox.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
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
  console.log("Intersection result:", intersection);
  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];
    for (let i = 0; i < intersection.features.length; i++) {
      let feat = intersection.features[i];
      let coords = feat.geometry.coordinates;
      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      console.log("Reverse geocoding for intersection:", revUrl);
      let revResp = await fetch(revUrl);
      let revData = await revResp.json();
      let popupText = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
      let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
      let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}\\n${revData.postnr || ""} ${revData.postnrnavn || ""}`;
      popupText += `
        <br>
        <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
        <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
      `;
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
 * NYT: Distance Options – Tegn cirkel med radius 10, 50 eller 100 km
 ***************************************************/
var currentCircle = null;

function toggleCircle(radius) {
  if (!currentMarker) {
    alert("Vælg venligst en adresse eller klik på kortet først.");
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

document.getElementById("btn10").addEventListener("click", function() {
  toggleCircle(10000);
});
document.getElementById("btn50").addEventListener("click", function() {
  toggleCircle(50000);
});
document.getElementById("btn100").addEventListener("click", function() {
  toggleCircle(100000);
});

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("search").focus();
});

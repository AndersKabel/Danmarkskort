/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
  let result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  console.log("convertToWGS84 output:", result);
  return [result[1], result[0]];
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
 * Popup "kopieret"
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
  setTimeout(() => popup.parentElement && popup.parentElement.removeChild(popup), 1500);
}

/***************************************************
 * Sorteringsprioritet for søgeresultater
 ***************************************************/
function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse" || item.type === "strandpost") text = item.tekst || "";
  else if (item.type === "stednavn") text = item.navn || "";
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText === lowerQuery) return 0;
  if (lowerText.startsWith(lowerQuery)) return 1;
  if (lowerText.includes(lowerQuery)) return 2;
  return 3;
}

/***************************************************
 * Automatisk dataopdatering (24 timer)
 ***************************************************/
function getLastUpdated() { return localStorage.getItem("strandposterLastUpdated"); }
function setLastUpdated() { localStorage.setItem("strandposterLastUpdated", Date.now()); }
function shouldUpdateData() {
  const lastUpdated = getLastUpdated();
  if (!lastUpdated) return true;
  return Date.now() - parseInt(lastUpdated, 10) > 86400000;
}

/***************************************************
 * Leaflet-kort og baselag
 ***************************************************/
var map = L.map('map', { center: [56, 10], zoom: 7, zoomControl: false });

var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur,© CVR API" }
).addTo(map);

var ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  { layers: "orto_foraar", format: "image/jpeg", transparent: false, version: "1.1.1", attribution: "Ortofoto © Kortforsyningen" }
);

// Strandposter
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer", format: "image/png", transparent: true, version: "1.3.0", attribution: "Data: redningsnummer.dk"
});

// Falck Ass (GeoJSON lokalt)
var falckAssLayer = L.geoJSON(null, {
  onEachFeature: (feature, layer) => layer.bindPopup("<strong>" + (feature.properties.tekst || "Falck Ass") + "</strong>"),
  style: () => ({ color: "orange" })
});
fetch("FalckStationer_data.json").then(r => r.json()).then(d => falckAssLayer.addData(d)).catch(e => console.error("Falck Ass:", e));

// Kommunegrænser
var kommunegrænserLayer = L.geoJSON(null, { style: () => ({ color: "#3388ff", weight: 2, fillOpacity: 0 }) });
fetch("https://api.dataforsyningen.dk/kommuner?format=geojson")
  .then(r => r.json()).then(d => kommunegrænserLayer.addData(d)).catch(e => console.error("Kommunegrænser:", e));

/***************************************************
 * Øvrige overlays
 ***************************************************/
var dbSmsLayer     = L.layerGroup();
var dbJournalLayer = L.layerGroup();
var border25Layer  = L.layerGroup();
var chargeMapLayer = L.layerGroup();

// 25 km grænser
var originalBorderCoords = [];
fetch("dansk-tysk-grænse.geojson").then(r => r.json()).then(g => {
  originalBorderCoords = g.features[0].geometry.coordinates;
  var offsetCoords = originalBorderCoords.map(function(coord) {
    var [x, y] = proj4("EPSG:4326", "EPSG:25832", [coord[0], coord[1]]);
    y -= 25000;
    var [lon2, lat2] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
    return [lat2, lon2];
  });
  L.polyline(offsetCoords, { color: 'red', weight: 2, dashArray: '5,5' }).addTo(border25Layer);
});
fetch("svensk-grænse.geojson").then(r => r.json()).then(g => {
  var coords = g.features[0].geometry.coordinates;
  var swOffset = coords.map(function(coord) {
    var [x, y] = proj4("EPSG:4326", "EPSG:25832", [coord[0], coord[1]]);
    y += 25000;
    var [lon2, lat2] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
    return [lat2, lon2];
  });
  L.polyline(swOffset, { color: 'red', weight: 2, dashArray: '5,5' }).addTo(border25Layer);
});

// 🔹 NYT: Km-markører overlay (tjek lag-navnet i GetCapabilities og ret hvis nødvendigt)
const kmMarkLayer = L.tileLayer.wms("https://geocloud.vd.dk/CVF/wms", {
  layers: "CVF:KM_MARKORER",     // ← opdater dette hvis navnet afviger
  format: "image/png",
  transparent: true,
  version: "1.1.1",
  attribution: "© Vejdirektoratet / CVF"
});

const baseMaps = { "OpenStreetMap": osmLayer, "Satellit": ortofotoLayer };
const overlayMaps = {
  "Strandposter": redningsnrLayer,
  "Falck Ass": falckAssLayer,
  "Kommunegrænser": kommunegrænserLayer,
  "DB SMS kort": dbSmsLayer,
  "DB Journal": dbJournalLayer,
  "25 km grænse": border25Layer,
  "Ladestandere": chargeMapLayer,
  "Km-markører (CVF)": kmMarkLayer   // ← synlige km-pæle
};

L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

map.on('overlayadd', function(e) {
  if (e.layer === dbSmsLayer) {
    window.open('https://kort.dyrenesbeskyttelse.dk/db/dvc.nsf/kort', '_blank');
    map.removeLayer(dbSmsLayer);
  } else if (e.layer === dbJournalLayer) {
    window.open('https://dvc.dyrenesbeskyttelse.dk/db/dvc.nsf/Efter%20journalnr?OpenView', '_blank');
    map.removeLayer(dbJournalLayer);
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
        const plat = point.AddressInfo?.Latitude;
        const plon = point.AddressInfo?.Longitude;
        if (plat && plon && currentMarker &&
            map.distance(currentMarker.getLatLng(), L.latLng(plat, plon)) <= selectedRadius) {
          L.circleMarker([plat, plon], { radius: 8, color: 'yellow', fillColor: 'yellow', fillOpacity: 1 })
            .bindPopup("Ladestander")
            .addTo(chargeMapLayer);
        }
      });
    })
    .catch(err => console.error('Fejl ved hentning af ladestandere:', err));
  }
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Kommunedata (fra kommunedata.json)
 ***************************************************/
let kommuneInfo = {};
fetch("kommunedata.json").then(r => r.json()).then(d => { kommuneInfo = d; })
  .catch(err => console.error("Kommunedata:", err));

/***************************************************
 * Koordinatboks
 ***************************************************/
function resetCoordinateBox() {
  const el = document.getElementById("coordinateBox");
  el.textContent = "";
  el.style.display = "none";
}
function setCoordinateBox(lat, lon) {
  const el = document.getElementById("coordinateBox");
  let latFixed = lat.toFixed(6), lonFixed = lon.toFixed(6);
  el.innerHTML = `Koordinater: <span id="latVal">${latFixed}</span>, <span id="lonVal">${lonFixed}</span>`;
  el.style.display = "block";
  const latSpan = document.getElementById("latVal");
  const lonSpan = document.getElementById("lonVal");
  function handleCoordClick() {
    latSpan.style.color = "red"; lonSpan.style.color = "red";
    navigator.clipboard.writeText(`${latFixed},${lonFixed}`).finally(() =>
      setTimeout(() => { latSpan.style.color = ""; lonSpan.style.color = ""; }, 1000)
    );
  }
  latSpan.addEventListener("click", handleCoordClick);
  lonSpan.addEventListener("click", handleCoordClick);
}

/***************************************************
 * Strandposter – lazy load ved tændt lag
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
        setLastUpdated();
      } else {
        console.warn("Ingen strandposter modtaget fra lokal fil.");
      }
    })
    .catch(err => console.error("Strandposter:", err));
}
map.on("overlayadd", function(event) {
  if (event.name === "Strandposter" && allStrandposter.length === 0) {
    fetchAllStrandposter();
  }
});

/***************************************************
 * Klik på kort => reverse geocoding => info
 ***************************************************/
map.on('click', function(e) {
  let lat = e.latlng.lat, lon = e.latlng.lng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lon]).addTo(map);
  setCoordinateBox(lat, lon);
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  fetch(revUrl).then(r => r.json()).then(data => updateInfoBox(data, lat, lon))
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * updateInfoBox
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");
  const overlay        = document.getElementById("kommuneOverlay");
  
  let adresseStr, vejkode, kommunekode;
  let evaFormat, notesFormat;
  
  if (data.adgangsadresse){
    adresseStr = data.adgangsadresse.adressebetegnelse ||
      `${data.adgangsadresse.vejnavn || ""} ${data.adgangsadresse.husnr || ""}, ${data.adgangsadresse.postnr || ""} ${data.adgangsadresse.postnrnavn || ""}`;
    evaFormat   = `${data.adgangsadresse.vejnavn || ""},${data.adgangsadresse.husnr || ""},${data.adgangsadresse.postnr || ""}`;
    notesFormat = `${data.adgangsadresse.vejnavn || ""} ${data.adgangsadresse.husnr || ""}, ${data.adgangsadresse.postnr || ""} ${data.adgangsadresse.postnrnavn || ""}`;
    vejkode     = data.adgangsadresse.vejkode || "?";
    kommunekode = data.adgangsadresse.kommunekode || "?";
  } else if (data.adressebetegnelse) {
    adresseStr  = data.adressebetegnelse;  evaFormat = "?, ?, ?"; notesFormat = "?, ?, ?";
    vejkode     = data.vejkode || "?";     kommunekode = data.kommunekode || "?";
  } else {
    adresseStr  = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
    evaFormat   = `${data.vejnavn || ""},${data.husnr || ""},${data.postnr || ""}`;
    notesFormat = `${data.vejnavn || ""} ${data.husnr || ""}, ${data.postnr || ""} ${data.postnrnavn || ""}`;
    vejkode     = data.vejkode || "?";     kommunekode = data.kommunekode || "?";
  }
  
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = adresseStr;

  extraInfoEl.innerHTML = `
    <br>
    <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
    &nbsp;
    <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
  `;

  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "inline";
  skråfotoLink.onclick = function(e) {
    e.preventDefault();
    copyToClipboard(adresseStr);
    let msg = document.createElement("div");
    msg.textContent = "Adressen er kopieret til udklipsholder.";
    msg.style.position = "fixed"; msg.style.top = "20px"; msg.style.left = "50%";
    msg.style.transform = "translateX(-50%)"; msg.style.background = "rgba(0,0,0,0.7)";
    msg.style.color = "white"; msg.style.padding = "10px 15px"; msg.style.borderRadius = "5px"; msg.style.zIndex = "1000";
    document.body.appendChild(msg);
    setTimeout(function() { document.body.removeChild(msg); window.open(skråfotoLink.href, '_blank'); }, 1000);
  };

  overlay.textContent = `Kommunekode: ${kommunekode} | Vejkode: ${vejkode}`;
  overlay.style.display = "block";

  if (resultsList) resultsList.innerHTML = "";
  if (vej1List)    vej1List.innerHTML    = "";
  if (vej2List)    vej2List.innerHTML    = "";

  // Statsvej (CVF WMS GetFeatureInfo)
  let statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");
  if (statsvejData && Object.keys(statsvejData).length > 0) {
    console.log("Statsvej-felter:", Object.keys(statsvejData));
    statsvejInfoEl.innerHTML =
      `<strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
       <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
       <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
       <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
       <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}`;

    // 🔹 Km-position via reference-service
    const kmText = await getKmAtPoint(lat, lon);
    if (kmText) statsvejInfoEl.innerHTML += `<br><strong>Kilometer:</strong> ${kmText}`;

    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }
  document.getElementById("infoBox").style.display = "block";
  
  // Kommuneinfo
  if (kommunekode !== "?") {
    try {
      let komResp = await fetch(`https://api.dataforsyningen.dk/kommuner/${kommunekode}`);
      if (komResp.ok) {
        let komData = await komResp.json();
        let kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          let info = kommuneInfo[kommunenavn];
          let doedeDyr  = info["Døde dyr"];
          let gaderVeje = info["Gader og veje"];
          let link      = info.gemLink;
          if (link) {
            extraInfoEl.innerHTML += `<br>Kommune: <a href="${link}" target="_blank">${kommunenavn}</a> | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
          } else {
            extraInfoEl.innerHTML += `<br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
          }
        }
      }
    } catch (e) { console.error("Kunne ikke hente kommuneinfo:", e); }
  }
}

/***************************************************
 * Søgning / inputs
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
  inputElement.addEventListener("input", () => btn.style.display = inputElement.value.length > 0 ? "inline" : "none");
  btn.addEventListener("click", function () {
    inputElement.value = ""; listElement.innerHTML = ""; btn.style.display = "none"; resetCoordinateBox();
  });
  inputElement.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && inputElement.value.length === 0) { listElement.innerHTML = ""; resetCoordinateBox(); }
  });
  btn.style.display = "none";
}
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

var searchItems = [], searchCurrentIndex = -1;
var vej1Items = [], vej1CurrentIndex = -1;
var vej2Items = [], vej2CurrentIndex = -1;

searchInput.addEventListener("input", function() {
  const txt = searchInput.value.trim();
  if (txt.length < 2) {
    clearBtn.style.display = "none"; resultsList.innerHTML = ""; document.getElementById("infoBox").style.display = "none"; searchItems = []; return;
  }
  clearBtn.style.display = "inline";
  doSearch(txt, resultsList);

  const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
  if (coordRegex.test(txt)) {
    const match = txt.match(coordRegex);
    const latNum = parseFloat(match[1]); const lonNum = parseFloat(match[2]);
    let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl).then(r => r.json()).then(data => {
      resultsList.innerHTML = "";
      placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
      setCoordinateBox(latNum, lonNum);
      updateInfoBox(data, latNum, lonNum);
    });
    return;
  }
});

searchInput.addEventListener("keydown", function(e) {
  if (searchItems.length === 0) return;
  if (e.key === "ArrowDown") { e.preventDefault(); searchCurrentIndex = (searchCurrentIndex + 1) % searchItems.length; highlightSearchItem(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); searchCurrentIndex = (searchCurrentIndex + searchItems.length - 1) % searchItems.length; highlightSearchItem(); }
  else if (e.key === "Enter") { e.preventDefault(); if (searchCurrentIndex >= 0) searchItems[searchCurrentIndex].click(); }
  else if (e.key === "Backspace" && searchInput.value.length === 0) resetCoordinateBox();
});
function highlightSearchItem() {
  searchItems.forEach(li => li.classList.remove("highlight"));
  if (searchCurrentIndex >= 0 && searchCurrentIndex < searchItems.length) searchItems[searchCurrentIndex].classList.add("highlight");
}
clearBtn.addEventListener("click", function() { resetInfoBox(); });

/***************************************************
 * Vej1/Vej2 søgning
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 2) { vej1List.innerHTML = ""; vej1List.style.display = "none"; vej1Items = []; return; }
  doSearchRoad(txt, vej1List, vej1Input, "vej1");
});
vej1Input.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") document.getElementById("infoBox").style.display = "none";
  if (vej1Items.length === 0) return;
  if (e.key === "ArrowDown") { e.preventDefault(); vej1CurrentIndex = (vej1CurrentIndex + 1) % vej1Items.length; highlightVej1Item(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); vej1CurrentIndex = (vej1CurrentIndex + vej1Items.length - 1) % vej1Items.length; highlightVej1Item(); }
  else if (e.key === "Enter") { e.preventDefault(); if (vej1CurrentIndex >= 0) vej1Items[vej1CurrentIndex].click(); }
});
function highlightVej1Item() {
  vej1Items.forEach(li => li.classList.remove("highlight"));
  if (vej1CurrentIndex >= 0 && vej1CurrentIndex < vej1Items.length) vej1Items[vej1CurrentIndex].classList.add("highlight");
}

vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 2) { vej2List.innerHTML = ""; vej2List.style.display = "none"; vej2Items = []; return; }
  doSearchRoad(txt, vej2List, vej2Input, "vej2");
});
vej2Input.addEventListener("keydown", function(e) {
  document.getElementById("infoBox").style.display = "none";
  if (vej2Items.length === 0) return;
  if (e.key === "ArrowDown") { e.preventDefault(); vej2CurrentIndex = (vej2CurrentIndex + 1) % vej2Items.length; highlightVej2Item(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); vej2CurrentIndex = (vej2CurrentIndex + vej2Items.length - 1) % vej2Items.length; highlightVej2Item(); }
  else if (e.key === "Enter") { e.preventDefault(); if (vej2CurrentIndex >= 0) vej2Items[vej2CurrentIndex].click(); }
  else if (e.key === "Backspace" && vej2Input.value.length === 0) resetCoordinateBox();
});
function highlightVej2Item() {
  vej2Items.forEach(li => li.classList.remove("highlight"));
  if (vej2CurrentIndex >= 0 && vej2CurrentIndex < vej2Items.length) vej2Items[vej2CurrentIndex].classList.add("highlight");
}

/***************************************************
 * Clear / reset
 ***************************************************/
clearBtn.addEventListener("click", function() {
  searchInput.value = ""; clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  resetCoordinateBox(); resetInfoBox(); searchInput.focus();
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
  resultsList.innerHTML = ""; document.getElementById("kommuneOverlay").style.display = "none";
  resetCoordinateBox();
});
function resetInfoBox() {
  document.getElementById("extra-info").textContent = "";
  document.getElementById("skraafotoLink").style.display = "none";
}
vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej1Input.value = ""; vej1List.innerHTML = ""; document.getElementById("infoBox").style.display = "none"; resetCoordinateBox();
});
vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej2Input.value = ""; vej2List.innerHTML = ""; document.getElementById("infoBox").style.display = "none"; resetCoordinateBox();
});

/***************************************************
 * Gem valgte veje / doSearchRoad
 ***************************************************/
var selectedRoad1 = null, selectedRoad2 = null;

function doSearchRoad(query, listElement, inputField, which) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(addrUrl).then(r => r.json()).then(data => {
    listElement.innerHTML = "";
    if (which === "vej1") { vej1Items = []; vej1CurrentIndex = -1; } else { vej2Items = []; vej2CurrentIndex = -1; }
    data.sort((a, b) => a.tekst.localeCompare(b.tekst));
    const unique = new Set();
    data.forEach(item => {
      let vejnavn   = item.adgangsadresse?.vejnavn || "Ukendt vej";
      let kommune   = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
      let postnr    = item.adgangsadresse?.postnr || "?";
      let adgangsId = item.adgangsadresse?.id || null;
      let key = `${vejnavn}-${postnr}`;
      if (unique.has(key)) return; unique.add(key);
      let li = document.createElement("li");
      li.textContent = `${vejnavn}, ${kommune} (${postnr})`;
      li.addEventListener("click", function() {
        inputField.value = vejnavn;
        listElement.innerHTML = ""; listElement.style.display = "none";
        if (!adgangsId) { console.error("Ingen adgangsadresse.id"); return; }
        let detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
        fetch(detailUrl).then(r => r.json()).then(async detailData => {
          let roadSelection = {
            vejnavn: vejnavn,
            kommunekode: detailData.kommunekode,
            vejkode: detailData.vejkode,
            husnummerId: detailData.id
          };
          let geometry = await getNavngivenvejKommunedelGeometry(detailData.id);
          roadSelection.geometry = geometry;
          if (inputField.id === "vej1") selectedRoad1 = roadSelection; else selectedRoad2 = roadSelection;
        });
      });
      listElement.appendChild(li);
      if (which === "vej1") vej1Items.push(li); else vej2Items.push(li);
    });
    listElement.style.display = data.length > 0 ? "block" : "none";
  }).catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * Strandposter-klientsøgning
 ***************************************************/
function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise((resolve) => {
    function filterAndMap() {
      let results = allStrandposter.filter(f => (f.properties.StrandNr || "").toLowerCase().indexOf(query) !== -1)
        .map(f => {
          let coords = f.geometry.coordinates, lat, lon;
          if (coords[0] > 90 || coords[1] > 90) { [lat, lon] = convertToWGS84(coords[0], coords[1]); }
          else { lon = coords[0]; lat = coords[1]; }
          return { type: "strandpost", tekst: `Redningsnummer: ${f.properties.StrandNr}`, lat, lon, feature: f };
        });
      resolve(results);
    }
    if (allStrandposter.length === 0) fetchAllStrandposter().then(filterAndMap).catch(() => resolve([]));
    else filterAndMap();
  });
}

/***************************************************
 * doSearch – kombinerer adresser, stednavne og strandposter
 ***************************************************/
function doSearch(query, listElement) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  let stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;
  let strandPromise = (map.hasLayer(redningsnrLayer) && strandposterReady) ? doSearchStrandposter(query) : Promise.resolve([]);
  Promise.all([
    fetch(addrUrl).then(r => r.json()).catch(() => []),
    fetch(stedUrl).then(r => r.json()).catch(() => ({})),
    strandPromise
  ])
  .then(([addrData, stedData, strandData]) => {
    listElement.innerHTML = ""; searchItems = []; searchCurrentIndex = -1;
    let addrResults = (addrData || []).map(item => ({ type: "adresse", tekst: item.tekst, adgangsadresse: item.adgangsadresse }));
    let stedResults = [];
    if (stedData) {
      if (Array.isArray(stedData.results)) {
        stedResults = stedData.results.map(result => ({ type: "stednavn", navn: result.visningstekst || result.navn, bbox: result.bbox || null, geometry: result.geometry }));
      } else if (Array.isArray(stedData)) {
        stedResults = stedData.map(result => ({ type: "stednavn", navn: result.visningstekst || result.skrivemaade_officiel, bbox: result.bbox || null, geometry: result.geometri }));
      }
    }
    let combined = [...addrResults, ...stedResults, ...strandData];
    combined.sort((a, b) => {
      if (a.type === "stednavn" && b.type === "adresse") return -1;
      if (a.type === "adresse" && b.type === "stednavn") return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });
    combined.forEach(obj => {
      let li = document.createElement("li");
      li.innerHTML = obj.type === "strandpost" ? `🛟 ${obj.tekst}` : obj.type === "adresse" ? `🏠 ${obj.tekst}` : `📍 ${obj.navn}`;
      li.addEventListener("click", function() {
        if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              let [lon, lat] = addressData.adgangspunkt.koordinater;
              setCoordinateBox(lat, lon);
              placeMarkerAndZoom([lat, lon], obj.tekst);
              let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
              fetch(revUrl).then(r => r.json()).then(reverseData => updateInfoBox(reverseData, lat, lon))
                .catch(err => console.error("Reverse geocoding fejl:", err));
              updateInfoBox(addressData, lat, lon);
              resultsList.innerHTML = ""; vej1List.innerHTML = ""; vej2List.innerHTML = "";
            });
        } else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0] && obj.bbox.coordinates[0].length > 0) {
          let [x, y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([x, y], obj.navn);
          listElement.innerHTML = ""; listElement.style.display = "none";
        } else if (obj.type === "stednavn" && obj.geometry && obj.geometry.coordinates) {
          let coordsArr = Array.isArray(obj.geometry.coordinates[0]) ? obj.geometry.coordinates[0] : obj.geometry.coordinates;
          placeMarkerAndZoom(coordsArr, obj.navn);
          listElement.innerHTML = ""; listElement.style.display = "none";
        } else if (obj.type === "strandpost") {
          setCoordinateBox(obj.lat, obj.lon);
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          listElement.innerHTML = ""; listElement.style.display = "none";
          let marker = currentMarker;
          let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`;
          fetch(revUrl).then(r => r.json()).then(revData => {
            const vejnavn = revData?.adgangsadresse?.vejnavn || revData?.vejnavn || "?";
            const husnr   = revData?.adgangsadresse?.husnr   || revData?.husnr   || "";
            const postnr  = revData?.adgangsadresse?.postnr  || revData?.postnr  || "?";
            const postby  = revData?.adgangsadresse?.postnrnavn || revData?.postnrnavn || "";
            const adresseStr  = `${vejnavn} ${husnr}, ${postnr} ${postby}`;
            const evaFormat   = `${vejnavn},${husnr},${postnr}`;
            const notesFormat = `${vejnavn} ${husnr}, ${postnr} ${postby}`;
            marker.bindPopup(
              `<strong>${obj.tekst}</strong><br>${adresseStr}<br>
               <a href="#" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
               &nbsp;
               <a href="#" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>`
            ).openPopup();
            marker.on("popupclose", function () {
              map.removeLayer(marker); currentMarker = null;
              document.getElementById("infoBox").style.display = "none";
              document.getElementById("statsvejInfoBox").style.display = "none";
              resetCoordinateBox(); resultsList.innerHTML = "";
            });
          }).catch(err => {
            console.error("Reverse geocoding for strandpost fejlede:", err);
            marker.bindPopup(`<strong>${obj.tekst}</strong><br>(Reverse geocoding fejlede)`).openPopup();
          });
        }
      });
      listElement.appendChild(li); searchItems.push(li);
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
        return wellknown.parse(wktString);
      }
    }
  } catch (err) { console.error("getNavngivenvejKommunedelGeometry:", err); }
  return null;
}

/***************************************************
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  if (coords[0] > 90 || coords[1] > 90) coords = convertToWGS84(coords[0], coords[1]);
  let lat = coords[0], lon = coords[1];
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);
  document.getElementById("address").textContent = displayText;
  document.getElementById("streetviewLink").href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej (Geocloud WMS GetFeatureInfo)
 * Failsafe: returnerer ALTID et objekt ({} hvis intet).
 ***************************************************/
async function checkForStatsvej(lat, lon) {
  try {
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
    let response = await fetch(url);
    let textData = await response.text();
    if (textData.startsWith("Results")) {
      return parseTextResponse(textData) || {};
    }
    let jsonData = JSON.parse(textData);
    if (jsonData.features && jsonData.features.length > 0) {
      return jsonData.features[0].properties || {};
    }
    return {}; // <- failsafe
  } catch (error) {
    console.error("Fejl ved hentning af vejdata:", error);
    return {}; // <- failsafe
  }
}
function parseTextResponse(text) {
  let lines = text.split("\n"); let data = {};
  lines.forEach(line => {
    let parts = line.split(" = ");
    if (parts.length === 2) { data[parts[0].trim()] = parts[1].trim(); }
  });
  return data;
}

/***************************************************
 * 🔹 getKmAtPoint – km-position via CVF reference-service
 * Returnerer "" hvis intet kan udledes.
 ***************************************************/
async function getKmAtPoint(lat, lon) {
  try {
    const [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
    const url =
      `https://geocloud.vd.dk/CVF/reference` +
      `?geometry=POINT(${x}%20${y})` +
      `&srs=EPSG:25832` +
      `&layers=CVF:veje` +
      `&buffer=30` +
      `&limit=1` +
      `&format=json`;

    const resp = await fetch(url);
    const txt  = await resp.text();

    let data; try { data = JSON.parse(txt); } catch { data = null; }

    const props =
      (data && data.features && data.features[0] && data.features[0].properties) ? data.features[0].properties :
      (data && data.properties) ? data.properties :
      null;

    if (!props) return "";

    const kmRaw   = props.km ?? props.KM ?? props.km_værdi ?? props.KM_VAERDI ?? props.km_value ?? null;
    const kmHelt  = props.km_helt ?? props.KM_HELT;
    const kmMeter = props.km_meter ?? props.KM_METER;

    if (kmRaw != null && kmRaw !== "") {
      const val = (""+kmRaw).replace(",", ".");
      return `km ${Number(val).toFixed(3)}`;
    } else if (kmHelt != null && kmMeter != null) {
      return `km ${kmHelt}+${kmMeter}`;
    }
    return "";
  } catch (e) {
    console.error("getKmAtPoint fejl:", e);
    return "";
  }
}

/***************************************************
 * Info-bokse: luk-knapper
 ***************************************************/
const statsvejInfoBox = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn = document.getElementById("statsvejCloseBtn");
statsvejCloseBtn.addEventListener("click", function() {
  statsvejInfoBox.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  resetCoordinateBox();
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
});
const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
  resetCoordinateBox(); resultsList.innerHTML = "";
  document.getElementById("kommuneOverlay").style.display = "none";
});

/***************************************************
 * Find kryds (Turf)
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async function() {
  if (!selectedRoad1 || !selectedRoad2) { alert("Vælg venligst to veje først."); return; }
  if (!selectedRoad1.geometry || !selectedRoad2.geometry) { alert("Geometri ikke tilgængelig for en eller begge veje."); return; }
  let line1 = turf.multiLineString(selectedRoad1.geometry.coordinates);
  let line2 = turf.multiLineString(selectedRoad2.geometry.coordinates);
  let intersection = turf.lineIntersect(line1, line2);
  if (intersection.features.length === 0) { alert("De valgte veje krydser ikke hinanden."); }
  else {
    let latLngs = [];
    for (let feat of intersection.features) {
      let coords = feat.geometry.coordinates;
      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      latLngs.push([wgsLat, wgsLon]);
      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      let marker = L.marker([wgsLat, wgsLon]).addTo(map);
      try {
        let revData = await (await fetch(revUrl)).json();
        let addressStr = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
        let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
        let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}, ${revData.postnr || ""} ${revData.postnrnavn || ""}`;
        marker.bindPopup(
          `${addressStr}<br>
           <a href="#" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
           &nbsp;
           <a href="#" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>`
        ).openPopup();
      } catch {
        marker.bindPopup(`(${wgsLat.toFixed(6)}, ${wgsLon.toFixed(6)})<br>Reverse geocoding fejlede.`).openPopup();
      }
      setCoordinateBox(wgsLat, wgsLon);
      marker.on("popupclose", () => map.removeLayer(marker));
    }
    if (latLngs.length === 1) map.setView(latLngs[0], 16); else map.fitBounds(latLngs);
  }
});

/***************************************************
 * Distance-cirkel og ladestandere
 ***************************************************/
var currentCircle = null;
var selectedRadius = null;
function toggleCircle(radius) {
  selectedRadius = radius;
  if (!currentMarker) { alert("Vælg venligst en adresse eller klik på kortet først."); return; }
  let latLng = currentMarker.getLatLng();
  if (currentCircle && currentCircle.getRadius() === radius) {
    map.removeLayer(currentCircle); currentCircle = null; selectedRadius = null;
    if (map.hasLayer(chargeMapLayer)) map.removeLayer(chargeMapLayer);
  } else {
    if (currentCircle) map.removeLayer(currentCircle);
    currentCircle = L.circle(latLng, { radius, color: "blue", fillOpacity: 0.2 }).addTo(map);
    if (map.hasLayer(chargeMapLayer)) map.fire('overlayadd', { layer: chargeMapLayer });
  }
}
document.getElementById("btn10").addEventListener("click", () => { selectedRadius = 10000; toggleCircle(10000); });
document.getElementById("btn25").addEventListener("click", () => { selectedRadius = 25000; toggleCircle(25000); });
document.getElementById("btn50").addEventListener("click", () => { selectedRadius = 50000; toggleCircle(50000); });
document.getElementById("btn100").addEventListener("click", () => { selectedRadius = 100000; toggleCircle(100000); });
document.addEventListener("DOMContentLoaded", function() { document.getElementById("search").focus(); });

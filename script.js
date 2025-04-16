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
  } else if (item.type === "cvr") {
    text = item.navn || "";
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
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
  }
).addTo(map);

/***************************************************
 * Ortofoto-lag fra Kortforsyningen
 ***************************************************/
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

// Strandposter-lag
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

/***************************************************
 * Falck Ass-lag
 ***************************************************/
var falckAssLayer = L.geoJSON(null, {
  onEachFeature: function(feature, layer) {
    let tekst = feature.properties.tekst || "Falck Ass";
    layer.bindPopup("<strong>" + tekst + "</strong>");
  },
  style: function(feature) {
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
 * Matrikel-lag via Dataforsyningen (med token)
 ***************************************************/
var matrikelLayer = L.geoJSON(null, {
  style: function(feature) {
    return {
      color: "#ff7800",
      weight: 2,
      fillOpacity: 0.1
    };
  },
  onEachFeature: function(feature, layer) {
    layer.bindPopup("Matrikelnummer: " + (feature.properties.matrikelnummer || "Ukendt"));
  }
});

// Eksempel: matrikel WFS. Tilføj headers: { token: "AndersKabel" }
fetch("https://services.dataforsyningen.dk/Matrikelinfo/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=Matrikelinfo:matrikel_jordstykke&outputFormat=application/json", {
  headers: {
    token: a63a88838c24fc85d47f32cde0ec0144
  }
})
  .then(response => response.json())
  .then(data => {
    matrikelLayer.addData(data);
    console.log("Matrikler hentet via WFS:", data);
  })
  .catch(err => console.error("Fejl ved hentning af matrikler (WFS):", err));

/***************************************************
 * Kommunegrænser-lag
 ***************************************************/
var kommunegrænserLayer = L.geoJSON(null, {
  style: function(feature) {
    return {
      color: "#3388ff",
      weight: 2,
      fillOpacity: 0
    };
  }
});

fetch("https://api.dataforsyningen.dk/kommuner?format=geojson", {
  headers: {
    token: a63a88838c24fc85d47f32cde0ec0144
  }
})
  .then(response => response.json())
  .then(data => {
    kommunegrænserLayer.addData(data);
    console.log("Kommunegrænser hentet:", data);
  })
  .catch(err => console.error("Fejl ved hentning af kommunegrænser:", err));

/***************************************************
 * Tilføj lagkontrol
 ***************************************************/
const baseMaps = { 
  "OpenStreetMap": osmLayer,
  "Satellit": ortofotoLayer
};
const overlayMaps = { 
  "Strandposter": redningsnrLayer,
  "Falck Ass": falckAssLayer,
  "Kommunegrænser": kommunegrænserLayer,
  "Matrikelnumre": matrikelLayer
};

L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Kommuneinfo
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Nulstil koordinatboks
 ***************************************************/
function resetCoordinateBox() {
  const coordinateBox = document.getElementById("coordinateBox");
  coordinateBox.textContent = "";
  coordinateBox.style.display = "none";
}

/***************************************************
 * Sæt koordinatboks
 ***************************************************/
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
 * Strandposter-søgning
 ***************************************************/
var allStrandposter = [];
function fetchAllStrandposter() {
  let wfsUrl = "https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=nobc:Redningsnummer&outputFormat=application/json";
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
    if (shouldUpdateData()) {
      fetchAllStrandposter();
    } else {
      console.log("Data er opdaterede – ingen hentning nødvendig.");
    }
  }
});

/***************************************************
 * Klik på kort => reverse geocoding => updateInfoBox
 ***************************************************/
map.on('click', function(e) {
  let lat = e.latlng.lat;
  let lon = e.latlng.lng;
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  setCoordinateBox(lat, lon);
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  fetch(revUrl, {
    headers: {
      token: a63a88838c24fc85d47f32cde0ec0144
    }
  })
    .then(r => r.json())
    .then(data => {
      updateInfoBox(data, lat, lon);
    })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * updateInfoBox – Tilføjet CVR (med token)
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");
  const overlay        = document.getElementById("kommuneOverlay");

  let adresseStr, vejkode, kommunekode;
  let evaFormat, notesFormat;

  if(data.adgangsadresse){
    adresseStr = data.adgangsadresse.adressebetegnelse ||
      `${data.adgangsadresse.vejnavn || ""} ${data.adgangsadresse.husnr || ""}, ${data.adgangsadresse.postnr || ""} ${data.adgangsadresse.postnrnavn || ""}`;
    evaFormat   = `${data.adgangsadresse.vejnavn || ""},${data.adgangsadresse.husnr || ""},${data.adgangsadresse.postnr || ""}`;
    notesFormat = `${data.adgangsadresse.vejnavn || ""} ${data.adgangsadresse.husnr || ""}, ${data.adgangsadresse.postnr || ""} ${data.adgangsadresse.postnrnavn || ""}`;
    vejkode     = data.adgangsadresse.vejkode || "?";
    kommunekode = data.adgangsadresse.kommunekode || "?";
  } else if(data.adressebetegnelse) {
    adresseStr  = data.adressebetegnelse;
    evaFormat   = "?, ?, ?";
    notesFormat = "?, ?, ?";
    vejkode     = data.vejkode || "?";
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
  extraInfoEl.insertAdjacentHTML("beforeend", 
    `<br>
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

  let statsvejInfoEl = document.getElementById("statsvejInfo");
  let statsvejData = await checkForStatsvej(lat, lon);
  if (statsvejData) {
    statsvejInfoEl.innerHTML = 
      `<strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
      <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
      <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
      <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
      <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}`;
    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }
  document.getElementById("infoBox").style.display = "block";

  // Hent kommuneinfo
  if (kommunekode !== "?") {
    try {
      let komUrl = `https://api.dataforsyningen.dk/kommuner/${kommunekode}`;
      let komResp = await fetch(komUrl, {
        headers: {
          token: a63a88838c24fc85d47f32cde0ec0144
        }
      });
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

  // CVR-kald (firmaer på adressen)
  if (adresseStr) {
    let cvrUrl = `https://api.dataforsyningen.dk/cvr/v2/virksomhed?adresse=${encodeURIComponent(adresseStr)}`;
    fetch(cvrUrl, {
      headers: {
        token: a63a88838c24fc85d47f32cde0ec0144
      }
    })
      .then(r => r.json())
      .then(data => {
        let companies = Array.isArray(data) ? data : (data.virksomheder || []);
        if (companies.length > 0) {
          let foldDiv = document.createElement("div");
          foldDiv.style.marginTop = "4px";
          let foldLink = document.createElement("a");
          foldLink.href = "#";
          foldLink.textContent = `${companies.length} firmaer på adressen`;
          let firmaListe = document.createElement("div");
          firmaListe.style.display = "none";
          let html = companies.map(c => `<li>${c.navn} (CVR: ${c.cvrNr || "?"})</li>`).join("");
          firmaListe.innerHTML = `<ul>${html}</ul>`;

          foldLink.onclick = function(e) {
            e.preventDefault();
            firmaListe.style.display = (firmaListe.style.display === "none") ? "block" : "none";
          };
          foldDiv.appendChild(foldLink);
          foldDiv.appendChild(firmaListe);
          extraInfoEl.appendChild(foldDiv);
        }
      })
      .catch(err => console.error("Fejl ved hentning af CVR data:", err));
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
    resetCoordinateBox();
  });
  inputElement.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && inputElement.value.length === 0) {
      listElement.innerHTML = "";
      resetCoordinateBox();
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
 * doSearchCVRAutocomplete – med token
 ***************************************************/
function doSearchCVRAutocomplete(query) {
  let cvrAutoUrl = `https://api.dataforsyningen.dk/cvr/v2/virksomhed/autocomplete?q=${encodeURIComponent(query)}`;
  return fetch(cvrAutoUrl, {
    headers: {
      token: a63a88838c24fc85d47f32cde0ec0144
    }
  })
    .then(r => r.json())
    .then(data => {
      let results = Array.isArray(data) ? data : (data.virksomheder || []);
      return results.map(c => ({
        type: "cvr",
        navn: c.navn,
        cvrNr: c.cvrNr
      }));
    })
    .catch(err => {
      console.error("CVR-autocomplete fejl:", err);
      return [];
    });
}

/***************************************************
 * #search => doSearch
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
    fetch(revUrl, {
      headers: {
        token: a63a88838c24fc85d47f32cde0ec0144
      }
    })
      .then(r => r.json())
      .then(data => {
        resultsList.innerHTML = "";
        placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
        setCoordinateBox(latNum, lonNum);
        updateInfoBox(data, latNum, lonNum);
      })
      .catch(err => console.error("Reverse geocoding fejl:", err));
    return;
  }
});

/***************************************************
 * Piletaster + Enter i søgefeltet
 ***************************************************/
searchInput.addEventListener("keydown", function(e) {
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
      searchItems[searchCurrentIndex].click();
    }
  } else if (e.key === "Backspace") {
    if (searchInput.value.length === 0) {
      resetCoordinateBox();
    }
  }
});

function highlightSearchItem() {
  searchItems.forEach(li => li.classList.remove("highlight"));
  if (searchCurrentIndex >= 0 && searchCurrentIndex < searchItems.length) {
    searchItems[searchCurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Vej1 => doSearchRoad
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
  if (e.key === "Backspace" && vej1Input.value.length === 0) {
    document.getElementById("infoBox").style.display = "none";
    resetCoordinateBox();
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

/***************************************************
 * Vej2 => doSearchRoad
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
      vej2Items[vej2CurrentIndex].click();
    }
  } else if (e.key === "Backspace") {
    if (vej2Input.value.length === 0) {
      resetCoordinateBox();
    }
  }
});

function highlightVej2Item() {
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
  resetCoordinateBox();
  resetInfoBox();
  searchInput.focus();
});

function resetInfoBox() {
  document.getElementById("extra-info").textContent = "";
  document.getElementById("skraafotoLink").style.display = "none";
}

vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej1Input.value = "";
  vej1List.innerHTML = "";
  document.getElementById("infoBox").style.display = "none";
  resetCoordinateBox();
});
vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej2Input.value = "";
  vej2List.innerHTML = "";
  document.getElementById("infoBox").style.display = "none";
  resetCoordinateBox();
});

/***************************************************
 * Globale variabler til at gemme valgte veje
 ***************************************************/
var selectedRoad1 = null;
var selectedRoad2 = null;

/***************************************************
 * doSearchRoad
 ***************************************************/
function doSearchRoad(query, listElement, inputField, which) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(addrUrl, {
    headers: {
      token: a63a88838c24fc85d47f32cde0ec0144
    }
  })
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
          fetch(detailUrl, {
            headers: {
              token: a63a88838c24fc85d47f32cde0ec0144
            }
          })
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
              } else {
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
 * doSearchStrandposter
 ***************************************************/
function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise((resolve, reject) => {
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
 * doSearch => kombinerer alt + cvr
 ***************************************************/
function doSearch(query, listElement) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  let stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;
  let strandPromise = map.hasLayer(redningsnrLayer) ? doSearchStrandposter(query) : Promise.resolve([]);
  let cvrPromise = doSearchCVRAutocomplete(query);

  Promise.all([
    fetch(addrUrl, {
      headers: {
        token: a63a88838c24fc85d47f32cde0ec0144
      }
    }).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
    fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; }),
    strandPromise,
    cvrPromise
  ])
  .then(([addrData, stedData, strandData, cvrData]) => {
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

    let cvrResults = (cvrData || []).map(c => ({
      type: "cvr",
      navn: c.navn,
      cvrNr: c.cvrNr
    }));

    let combined = [...addrResults, ...stedResults, ...strandData, ...cvrResults];
    combined.sort((a, b) => getSortPriority(a, query) - getSortPriority(b, query));

    combined.forEach(obj => {
      let li = document.createElement("li");
      if (obj.type === "strandpost") {
        li.innerHTML = `🛟 ${obj.tekst}`;
      } else if (obj.type === "adresse") {
        li.innerHTML = `🏠 ${obj.tekst}`;
      } else if (obj.type === "stednavn") {
        li.innerHTML = `📍 ${obj.navn}`;
      } else if (obj.type === "cvr") {
        li.innerHTML = `🏢 ${obj.navn} (CVR: ${obj.cvrNr || "?"})`;
      }
      li.addEventListener("click", function() {
        if (obj.type === "cvr") {
          alert(`Virksomhed klikket: ${obj.navn} (CVR: ${obj.cvrNr || "?"}).\nHer kunne vi lave detail-kald for CVR.`);
        }
        else if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`, {
            headers: { token: a63a88838c24fc85d47f32cde0ec0144 }
          })
            .then(r => r.json())
            .then(addressData => {
              let [lon, lat] = addressData.adgangspunkt.koordinater;
              setCoordinateBox(lat, lon);
              placeMarkerAndZoom([lat, lon], obj.tekst);
              let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
              fetch(revUrl, {
                headers: { token: a63a88838c24fc85d47f32cde0ec0144 }
              })
                .then(rr => rr.json())
                .then(fullData => {
                  updateInfoBox(fullData, lat, lon);
                })
                .catch(err => console.error("Reverse geocoding fejl i doSearch-adresse:", err));

              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        }
        else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0] && obj.bbox.coordinates[0].length > 0) {
          let [x, y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([x, y], obj.navn);
        }
        else if (obj.type === "strandpost") {
          setCoordinateBox(obj.lat, obj.lon);
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          let marker = currentMarker;
          let props = obj.feature.properties;
          let ppl = props.ppl || "N/A";
          let opdateretDato = new Date().toLocaleString();
          marker.bindPopup(
            `<strong>${obj.tekst}</strong><br>
             PPL: ${ppl}<br>
             Opdateret: ${opdateretDato}<br>
             <a href="#" onclick="alert('Se PPL funktion'); return false;">Se PPL</a>`
          ).openPopup();
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
  let url = `https://services.dataforsyningen.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  try {
    let r = await fetch(url, {
      headers: {
        token: a63a88838c24fc85d47f32cde0ec0144
      }
    });
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
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  if (coords[0] > 90 || coords[1] > 90) {
    coords = convertToWGS84(coords[0], coords[1]);
  }
  let lat = coords[0], lon = coords[1];
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);
  document.getElementById("address").textContent = displayText;
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej => henter statsvej (Geocloud)
 ***************************************************/
async function checkForStatsvej(lat, lon) {
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
  try {
    let response = await fetch(url);
    let textData = await response.text();
    if (textData.startsWith("Results")) {
      let extractedData = parseTextResponse(textData);
      return extractedData;
    }
    let jsonData = JSON.parse(textData);
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
  resetCoordinateBox();
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});
const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  resetCoordinateBox();
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

/***************************************************
 * "Find X"-knap => lineIntersection
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
        let resp = await fetch(revUrl, {
          headers: {
            token: a63a88838c24fc85d47f32cde0ec0144
          }
        });
        let revData = await resp.json();
        let addressStr = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
        let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
        let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}, ${revData.postnr || ""} ${revData.postnrnavn || ""}`;
        marker.bindPopup(`
          ${addressStr}<br>
          <a href="#" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
          &nbsp;
          <a href="#" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
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
 * Tegn cirkel med radius 10, 50, 100 km
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
    if (currentCircle) {
      map.removeLayer(currentCircle);
    }
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

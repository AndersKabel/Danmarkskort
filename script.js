/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

// Cloudflare proxy til VD-reference
const VD_PROXY = "https://vd-proxy.anderskabel8.workers.dev";

function convertToWGS84(x, y) {
  // Ved at bytte parameterne [y, x] opnår vi, at northing (y) kommer først,
  // som derefter bliver konverteret til latitude, og easting (x) til longitude.
  let result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  console.log("convertToWGS84 output:", result);
  // Returnér [latitude, longitude] til Leaflet
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
 * Lavere tal betyder bedre match.
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
    return 0; // Perfekt match
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
  // 24 timer = 86.400.000 millisekunder
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

// OpenStreetMap-lag
var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur, © CVR API"
  }
).addTo(map);

/***************************************************
 * TILFØJET: Ortofoto-lag fra Kortforsyningen (satellit)
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

// Opret WMS-lag for redningsnumre (Strandposter)
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

// Rutenummereret vejnet (VD Geocloud WMS)
var rutenummerLayer = L.tileLayer.wms("https://geocloud.vd.dk/VM/wms", {
  layers: "rutenummereret-vejnet",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "© Vejdirektoratet"
});

/***************************************************
 * NYT: Opret nyt Falck Ass-lag (GeoJSON)
 * Henter data fra filen "FalckStationer_data.json"
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
 * Opret kommunegrænser layer (GeoJSON fra Dataforsyningen)
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

fetch("https://api.dataforsyningen.dk/kommuner?format=geojson")
  .then(response => response.json())
  .then(data => {
    kommunegrænserLayer.addData(data);
    console.log("Kommunegrænser hentet:", data);
  })
  .catch(err => console.error("Fejl ved hentning af kommunegrænser:", err));

/***************************************************
 * Tilføj lagkontrol
 * (Matrikel-laget og CVR–rester er fjernet)
 ***************************************************/
// NYT: DB SMS kort (åbner dvc.nsf/kort)
var dbSmsLayer        = L.layerGroup();
// NYT: DB Journal (åbner dvc.nsf/Efter journalnr)
var dbJournalLayer    = L.layerGroup();
// NYT: “25 km grænse” – et tomt layer, vi vil tegne en 25 km forskudt grænse på
var border25Layer = L.layerGroup();
// MARKER: chargeLayerStart
// NYT: Ladestandere-lag (Open Charge Map)
var chargeMapLayer = L.layerGroup();
// MARKER: chargeLayerEnd
// hent den originale dansk-tysk-grænse og tegn den 25 km mod syd
var originalBorderCoords = [];
fetch("dansk-tysk-grænse.geojson")
  .then(r => r.json())
  .then(g => {
    originalBorderCoords = g.features[0].geometry.coordinates;
    // flyt hvert punkt 25 000 m mod syd i UTM (zone 32)
    var offsetCoords = originalBorderCoords.map(function(coord) {
      var lon = coord[0], lat = coord[1];
      // til UTM
      var [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
      y -= 25000;
      // tilbage til lat/lon
      var [lon2, lat2] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
      return [lat2, lon2];
    });
    // tegn stiplet rød linje
    L.polyline(offsetCoords, {
      color: 'red',
      weight: 2,
      dashArray: '5,5'
    }).addTo(border25Layer);
  });
// hent og tegn 25 km-offset for den svenske grænse (LineString)
fetch("svensk-grænse.geojson")
  .then(r => r.json())
  .then(g => {
    // her er geometry.coordinates et fladt array af [lon,lat]
    var coords = g.features[0].geometry.coordinates;
    // kortlæg hvert punkt til 25 km mod syd i UTM
    var swOffset = coords.map(function(coord) {
      var lon = coord[0], lat = coord[1];
      var [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
      y += 25000;
      var [lon2, lat2] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
      return [lat2, lon2];
    });
    // tegn én samlet stiplet rød linje
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
  "DB SMS kort":       dbSmsLayer,
  "DB Journal":        dbJournalLayer,
  "25 km grænse": border25Layer,
  "Ladestandere": chargeMapLayer,
  "Rutenummereret vejnet": rutenummerLayer
};

L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

// Strandposter: hent data første gang laget tændes (eller auto-opdatér efter 24t)
map.on("overlayadd", function(event) {
  if (event.layer === redningsnrLayer) {
    console.log("Strandposter laget er tilføjet.");
    if (!strandposterReady || shouldUpdateData()) {
      console.log("Henter strandposter-data" + (!strandposterReady ? " (første gang)" : " (24-timers auto-opdatering)") + "...");
      fetchAllStrandposter();
    } else {
      console.log("Strandposter-data allerede hentet og opdateret.");
    }
  }
});

// Øvrige overlay-handlere
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
          .bindPopup(/* evt. popup her */)
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
 * Kommunedata hentet fra "Kommuner.xlsx"
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
 * Ny hjælpefunktion: Nulstil koordinatboksen
 ***************************************************/
function resetCoordinateBox() {
  const coordinateBox = document.getElementById("coordinateBox");
  coordinateBox.textContent = "";
  coordinateBox.style.display = "none";
}

/***************************************************
 * Ny hjælpefunktion: Sæt koordinatboksen med kopiering
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
 * Global variabel og funktioner til Strandposter-søgning
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

/***************************************************
 * Klik på kort => reverse geocoding => opdater sidepanelet
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
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
    .then(r => r.json())
    .then(data => {
      updateInfoBox(data, lat, lon);
    })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * updateInfoBox
 * Viser fuld adresse, Eva.Net/Notes-links i infobox,
 * Viser kommunekode/vejkode i overlay
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

  // Top actions (Eva/Notes) + a separate meta area (kommune/politikreds)
  const actionsHtml = `
    <a href="#" title="Kopier til Eva.net"
       onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}');
                showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
    &nbsp;
    <a href="#" title="Kopier til Notes"
       onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}');
                showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
  `;

  extraInfoEl.innerHTML = `
    <div id="info-actions" style="margin:6px 0;">${actionsHtml}</div>
    <div id="info-meta"></div>
  `;
  const infoMetaEl = document.getElementById("info-meta");

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

  let statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");

  // Forsøg at udlæse vejstatus/vejmyndighed fra CVF-svaret
  const vejstatus =
    statsvejData?.VEJSTATUS ??
    statsvejData?.vejstatus ??
    statsvejData?.VEJ_STATUS ??
    statsvejData?.status ??
    null;

  const vejmyndighed =
    statsvejData?.VEJMYNDIGHED ??
    statsvejData?.vejmyndighed ??
    statsvejData?.VEJMYND ??
    statsvejData?.VEJMND ??
    null;

  // vis kun boksen hvis der er meningsfulde statsvejsfelter
  const hasStatsvej =
    statsvejData &&
    (
      statsvejData.ADM_NR != null ||
      statsvejData.FORGRENING != null ||
      (statsvejData.BETEGNELSE && String(statsvejData.BETEGNELSE).trim() !== "") ||
      (statsvejData.VEJTYPE && String(statsvejData.VEJTYPE).trim() !== "")
    );

  // vis boksen hvis der er statsvej-INFO ELLER vejstatus/vejmyndighed
  const showBox = hasStatsvej || vejstatus || vejmyndighed;

  if (showBox) {
    let html = "";

    if (hasStatsvej) {
      html +=
        `<strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
         <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
         <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
         <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
         <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}`;
    }

    // ➕ Beskrivelse fra CVF-featureinfo – (indeholder ofte husnr. intervaller)
    const beskrivelse =
      statsvejData.BESKRIVELSE ??
      statsvejData.beskrivelse ??
      null;

    if (beskrivelse && String(beskrivelse).trim() !== "") {
      if (html) html += "<br>";
      html += `<strong>Beskrivelse:</strong> ${beskrivelse}`;
    }

    // Tilføj vejstatus/vejmyndighed KUN hvis de findes (ingen “Ukendt”)
    if (vejstatus) {
      if (html) html += "<br>";
      html += `<strong>Vejstatus:</strong> ${vejstatus}`;
    }
    if (vejmyndighed) {
      if (html) html += "<br>";
      html += `<strong>Vejmyndighed:</strong> ${vejmyndighed}`;
    }

    statsvejInfoEl.innerHTML = html;

    // km vises kun, når der er statsvej (referencevej)
    if (hasStatsvej) {
      const kmText = await getKmAtPoint(lat, lon);
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

  // Hent kommuneinfo
  if (kommunekode !== "?") {
    try {
      let komUrl = `https://api.dataforsyningen.dk/kommuner/${kommunekode}`;
      let komResp = await fetch(komUrl);
      if (komResp.ok) {
        let komData = await komResp.json();
        let kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          let info      = kommuneInfo[kommunenavn];
          let doedeDyr  = info["Døde dyr"];
          let gaderVeje = info["Gader og veje"];
          let link      = info.gemLink;
          if (link) {
            infoMetaEl.innerHTML += `
              Kommune: <a href="${link}" target="_blank">${kommunenavn}</a>
              | Døde dyr: ${doedeDyr}
              | Gader og veje: ${gaderVeje}`;
          } else {
            infoMetaEl.innerHTML += `<br>
              Kommune: ${kommunenavn}
              | Døde dyr: ${doedeDyr}
              | Gader og veje: ${gaderVeje}`;
          }
        }
      }
    } catch (e) {
      console.error("Kunne ikke hente kommuneinfo:", e);
    }
  }

  // ➕ Politikreds (kommer fra reverse-svaret med struktur=flad)
  const politikredsNavn = data.politikredsnavn
    ?? data.adgangsadresse?.politikredsnavn
    ?? null;
  const politikredsKode = data.politikredskode
    ?? data.adgangsadresse?.politikredskode
    ?? null;
  if (politikredsNavn || politikredsKode) {
    const polititekst = politikredsKode
      ? `${politikredsNavn || ""} (${politikredsKode})`
      : `${politikredsNavn}`;
    infoMetaEl.innerHTML += `<br>Politikreds: ${polititekst}`;
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
 * #search => doSearch
 * Vigtigt: detail-kald hver gang
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

  // Tjek om brugeren har indtastet koordinater
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
  } else if (e.key === "Backspace") {
    if (searchInput.value.length === 0) {
      resetCoordinateBox();
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
  if (e.key === "Backspace" && searchInput.value.length === 0) {
    resetCoordinateBox();
  }
});

clearBtn.addEventListener("click", function() {
  resetInfoBox();
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
  } else if (e.key === "Backspace") {
    if (vej2Input.value.length === 0) {
      resetCoordinateBox();
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
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  resetCoordinateBox();
  resetInfoBox();
  searchInput.focus();
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  resultsList.innerHTML = "";
  document.getElementById("kommuneOverlay").style.display = "none";
});

/***************************************************
 * Hjælpere til infoboks
 ***************************************************/
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
          console.log("Valgt vejnavn:", vejnavn, " => henter detaljer for adgangsadresse:", adgangsId);
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
              } else if (inputField.id === "vej2") {
                selectedRoad2 = roadSelection;
              }
              console.log("Selected road:", roadSelection);
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
 * Hjælper: filtrér strandposter lokalt
 * Returnerer et array af { type:'strandpost', tekst, lat, lon }
 ***************************************************/
function filterStrandposter(query) {
  // Kun hvis laget er tændt og data er klar
  if (!(map.hasLayer(redningsnrLayer) && strandposterReady)) return [];

  const q = (query || "").toLowerCase();

  return (allStrandposter || [])
    .map(f => {
      const props = f.properties || {};
      const g     = f.geometry || {};
      if (g.type !== "Point" || !Array.isArray(g.coordinates)) return null;

      const lon = g.coordinates[0];
      const lat = g.coordinates[1];

      // Vi forsøger at finde et fornuftigt visningsnavn
      const tekst =
        props.tekst ??
        props.navn ??
        props.label ??
        (props.nr != null ? `Strandpost ${props.nr}` : null) ??
        "Strandpost";

      return { type: "strandpost", tekst, lat, lon };
    })
    .filter(o => o && o.tekst && o.tekst.toLowerCase().includes(q));
}

/***************************************************
 * doSearch => kombinerer adresser, stednavne og strandposter
 ***************************************************/
function doSearch(query, listElement) {
  const addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  const stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;

  // Hent strandposter lokalt (ingen ekstra fetch)
  const strandData = filterStrandposter(query);

  Promise.all([
    fetch(addrUrl).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
    fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; })
  ])
  .then(([addrData, stedData]) => {
    console.log("addrData:", addrData);
    console.log("stedData:", stedData);
    console.log("strandData:", strandData);

    listElement.innerHTML = "";
    searchItems = [];
    searchCurrentIndex = -1;

    // Adresser
    const addrResults = (addrData || []).map(item => ({
      type: "adresse",
      tekst: item.tekst,
      adgangsadresse: item.adgangsadresse
    }));

    // Stednavne (to mulige formater fra API’et)
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

    // Saml alt
    const combined = [...addrResults, ...stedResults, ...strandData];

    // Sortér efter relevans (eksisterende logik)
    combined.sort((a, b) => {
      if (a.type === "stednavn" && b.type === "adresse") return -1;
      if (a.type === "adresse" && b.type === "stednavn") return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });

    // Render liste + klik-håndtering
    combined.forEach(obj => {
      const li = document.createElement("li");
      if (obj.type === "strandpost") {
        li.innerHTML = `🛟 ${obj.tekst}`;
      } else if (obj.type === "adresse") {
        li.innerHTML = `🏠 ${obj.tekst}`;
      } else if (obj.type === "stednavn") {
        li.innerHTML = `📍 ${obj.navn}`;
      }

      li.addEventListener("click", function() {
        if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              const [lon, lat] = addressData.adgangspunkt.koordinater;
              setCoordinateBox(lat, lon);
              placeMarkerAndZoom([lat, lon], obj.tekst);
              const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
              fetch(revUrl)
                .then(r => r.json())
                .then(reverseData => {
                  updateInfoBox(reverseData, lat, lon);
                })
                .catch(err => console.error("Reverse geocoding fejl:", err));

              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        }
        else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0] && obj.bbox.coordinates[0].length > 0) {
          const [x, y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([x, y], obj.navn);
          listElement.innerHTML = "";
          listElement.style.display = "none";
        }
        else if (obj.type === "stednavn" && obj.geometry && obj.geometry.coordinates) {
          const coordsArr = Array.isArray(obj.geometry.coordinates[0])
            ? obj.geometry.coordinates[0]
            : obj.geometry.coordinates;
          placeMarkerAndZoom(coordsArr, obj.navn); // UTM -> WGS håndteres i placeMarkerAndZoom
          listElement.innerHTML = "";
          listElement.style.display = "none";
        }
        else if (obj.type === "strandpost") {
          setCoordinateBox(obj.lat, obj.lon);
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          listElement.innerHTML = "";
          listElement.style.display = "none";

          const marker = currentMarker;
          const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`;
          fetch(revUrl)
            .then(r => r.json())
            .then(revData => {
              const vejnavn    = revData?.adgangsadresse?.vejnavn    || revData?.vejnavn || "?";
              const husnr      = revData?.adgangsadresse?.husnr      || revData?.husnr   || "";
              const postnr     = revData?.adgangsadresse?.postnr     || revData?.postnr  || "?";
              const postnrnavn = revData?.adgangsadresse?.postnrnavn || revData?.postnrnavn || "";
              const adresseStr = `${vejnavn} ${husnr}, ${postnr} ${postnrnavn}`;
              const evaFormat  = `${vejnavn},${husnr},${postnr}`;
              const notesFmt   = `${vejnavn} ${husnr}, ${postnr} ${postnrnavn}`;

              marker.bindPopup(`
                <strong>${obj.tekst}</strong><br>
                ${adresseStr}<br>
                <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
                &nbsp;
                <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFmt}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
              `).openPopup();

              marker.on("popupclose", function () {
                map.removeLayer(marker);
                currentMarker = null;
                document.getElementById("infoBox").style.display = "none";
                document.getElementById("statsvejInfoBox").style.display = "none";
                resetCoordinateBox();
                resultsList.innerHTML = "";
              });
            })
            .catch(err => {
              console.error("Reverse geocoding for strandpost fejlede:", err);
              marker.bindPopup(`<strong>${obj.tekst}</strong><br>(Reverse geocoding fejlede)`).openPopup();
            });
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
      return {};
    }
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
  console.log("Parsed tekstbaserede data:", data);
  return data;
}

/***************************************************
 * ➕ NY (opdateret): getKmAtPoint – returnerer ét kmtText-tal
 ***************************************************/
async function getKmAtPoint(lat, lon) {
  try {
    // 1) WGS84 -> UTM32
    const [x, y] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);

    // 2) Brug statsvej-info til at låse vej/forgrening
    const stats = await checkForStatsvej(lat, lon);
    const roadNumber = stats.ADM_NR ?? stats.adm_nr ?? null;
    const roadPart   = stats.FORGRENING ?? stats.forgrening ?? 0;

    if (!roadNumber) return "";

    // 3) Kald din worker
    const url =
      `${VD_PROXY}/reference` +
      `?geometry=POINT(${x}%20${y})` +
      `&srs=EPSG:25832` +
      `&roadNumber=${roadNumber}` +
      `&roadPart=${roadPart}` +
      `&format=json`;

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      console.error("getKmAtPoint proxy-fejl:", resp.status, await resp.text());
      return "";
    }
    const data = await resp.json();

    // 4) Læs felter som i dit proxy-svar
    const props =
      data?.properties ??
      data?.features?.[0]?.properties ??
      data;

    // Nogle svar har km-teksten i nested felter: properties.from.kmtText (eller to.kmtText)
    const from = props?.from ?? props?.FROM ?? props?.fra ?? null;
    const to   = props?.to   ?? props?.TO   ?? props?.til ?? null;

    const kmtText =
      from?.kmtText ??
      from?.KMTTEXT ??
      to?.kmtText ??
      to?.KMTTEXT ??
      props?.kmtText ??
      props?.KMTEKST ??
      props?.kmtekst ??
      props?.at?.kmtText ??
      null;

    if (kmtText) {
      // returnér ét tal præcist som pælen angives (fx "99/0031")
      return String(kmtText);
    }

    // Fallback: forsøg at bygge "KM/MMMM" ud fra 'from' først
    const km = (from?.km ?? props?.km ?? props?.KM ?? null);
    the m  = (from?.m  ?? props?.m  ?? props?.M  ?? props?.km_meter ?? null);
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
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  resetCoordinateBox();
  resultsList.innerHTML = "";
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
  console.log("Intersection result:", intersection);
  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];
    for (let i = 0; i < intersection.features.length; i++) {
      let feat = intersection.features[i];
      let coords = feat.geometry.coordinates;
      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      latLngs.push([wgsLat, wgsLon]);

      // Foretag reverse geocoding med de fundne koordinater
      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      console.log("Reverse geocoding for intersection:", revUrl);
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
 * NYT: Distance Options – Tegn cirkel med radius 10, 50 eller 100 km
 ***************************************************/
var currentCircle = null;
var selectedRadius = null;   // husker hvilken radius brugeren har valgt
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
    selectedRadius = null;    // nulstil radius-variablen når cirklen fjernes

    // Hvis ladestander-laget er tændt, så slå det fra
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
    // hvis ladestander-laget er tændt, gen-udløs fetch
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
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("search").focus();
});

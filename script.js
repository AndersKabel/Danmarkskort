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

// (A) Kommunedata hentet fra "Kommuner.xlsx"
const kommuneInfo = {
    "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
    "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
    "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Klik på kort => reverse geocoding
 ***************************************************/
map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Opdater koordinatboksen med de klik-koordinerede
    document.getElementById("coordinateBox").textContent = `Koordinater: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    document.getElementById("coordinateBox").style.display = "block";

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
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
    const addressEl = document.getElementById("address");
    const extraInfoEl = document.getElementById("extra-info");
    const skråfotoLink = document.getElementById("skraafotoLink"); 
    
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

    // Ryd tidligere søgeresultater
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

    if (data.kommunekode) {
        try {
            let komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
            let komResp = await fetch(komUrl);
            if (komResp.ok) {
                let komData = await komResp.json();
                let kommunenavn = komData.navn || "";
                if (extraInfoEl) {
                   // extraInfoEl.textContent += ` | Kommune: ${kommunenavn}`;
                }

                // Slå kommunenavn op i "kommuneInfo"
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
var vej2List     = document.getElementById("

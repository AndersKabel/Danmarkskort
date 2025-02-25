// Definer koordinatsystem EPSG:25832
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");

// Funktion til at konvertere koordinater fra EPSG:25832 til WGS84
function convertToWGS84(x, y) {
    return proj4("EPSG:25832", "EPSG:4326", [x, y]);
}

// Initialiser kortet – deaktiver standard zoom-knapper
var map = L.map('map', {
    center: [56, 10],
    zoom: 7,
    zoomControl: false
});

// Definer OpenStreetMap-lag med kildehenvisning
var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
    }
).addTo(map);

// Opret lag-kontrol (tilføj flere lag senere)
var baseMaps = {
    "OpenStreetMap": osmLayer
};

// Tilføj lag-kontrol i øverste højre hjørne
L.control.layers(baseMaps, null, {
    position: 'topright'
}).addTo(map);

// Tilføj zoom-panel i nederste højre hjørne
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Variabel til marker (placeres ved klik på kortet)
var currentMarker;

/* ==================================
   KLIK PÅ KORT => MARKER + GEOCODING
================================== */
map.on('click', function (e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    // Fjern tidligere marker, hvis den findes
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    // Tilføj ny marker
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Reverse geocoding via Dataforsyningen
    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            console.log("Reverse geocoding resultat:", data);

            // Her er din nye kode til Streetview-link + adresse
            const streetviewLink = document.getElementById("streetviewLink");
            const chosenAddress  = document.getElementById("chosenAddress");
            const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, `
                               + `${data.postnr || "?"} ${data.postnrnavn || ""}`;

            // Sæt link til Google Street View
            streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
            // Skriv adressen
            chosenAddress.textContent = adresseStr;

            // VIS boksen (nu hvor vi har en adresse)
            document.getElementById("infoBox").style.display = "block";
        })
        .catch(err => {
            console.error("Fejl ved reverse geocoding:", err);
        });
});

/* ==================================
   HÅNDTERING AF SØGEFELT OG KRYDS (×)
================================== */

// Hent elementerne fra HTML
var searchInput = document.getElementById("search");
var clearBtn    = document.getElementById("clearSearch");
var resultsList = document.getElementById("results");

// 1) Når brugeren skriver i feltet => vis/skjul kryds
searchInput.addEventListener("input", function() {
    if (searchInput.value.trim() === "") {
        clearBtn.style.display = "none";
    } else {
        clearBtn.style.display = "inline";
    }
});

// 2) Klik på krydset => ryd felt + ryd søgeresultater + skjul kryds
clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    resultsList.innerHTML = "";
    clearBtn.style.display = "none";

    // SKJUL boksen igen
    document.getElementById("infoBox").style.display = "none";
});

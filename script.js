// Definer koordinatsystem EPSG:25832
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");

// Funktion til at konvertere koordinater fra EPSG:25832 til WGS84
function convertToWGS84(x, y) {
    return proj4("EPSG:25832", "EPSG:4326", [x, y]);
}

// Initialiser kortet
var map = L.map('map').setView([56, 10], 7);

// Definer OpenStreetMap-lag med kildehenvisning
var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
}).addTo(map);

// Opret lag-kontrol (tilføj flere lag senere)
var baseMaps = {
    "OpenStreetMap": osmLayer
};

L.control.layers(baseMaps).addTo(map);

var currentMarker;
var currentLayerGroup = null; // Holder referencen til det nuværende aktive lag
var selectedLayerType = "none"; // Holder styr på det valgte lag

// Klik på kortet for at finde en adresse
map.on('click', function (e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentMarker = L.marker([lat, lon]).addTo(map);

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('address').innerHTML = `
                Adresse: ${data.vejnavn || "ukendt"} ${data.husnr || ""}, ${data.postnr || "ukendt"} ${data.postnrnavn || ""}
                <br>
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
            `;
        })
        .catch(err => console.error('Fejl ved reverse geocoding:', err));
});

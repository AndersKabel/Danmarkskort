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

// Tilføj nyt zoom-panel i øverste højre hjørne
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Eventuelle øvrige variabler (fx currentMarker)
var currentMarker;

// ...din øvrige kode, fx klikkehåndtering, reverse geocoding osv.
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
            // Gør hvad du vil med data
            console.log(data);
        })
        .catch(err => console.error('Fejl ved reverse geocoding:', err));
});

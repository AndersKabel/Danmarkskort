// Opret et kort og centrer det over Danmark
var map = L.map('map').setView([56, 10], 7); // Koordinater for Danmark

// Tilføj OpenStreetMap-fliser
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

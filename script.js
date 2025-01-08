var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    // Tilføj en markør på klik-positionen
    L.marker([lat, lon]).addTo(map);

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('address').innerText = `Adresse: ${data.vejnavn || "ukendt"} ${data.husnr || ""}, ${data.postnr || "ukendt"} ${data.postnrnavn || ""}`;
        })
        .catch(err => {
            console.error('Fejl ved API-kaldet:', err);
            document.getElementById('address').innerText = "Der opstod en fejl med reverse geocoding.";
        });
});


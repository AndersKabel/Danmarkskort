var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    // Tilføj parameteren "struktur=flad" for et simplere JSON-svar
    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            // Tjek om data indeholder de forventede felter
            if (data.vejnavn && data.husnr && data.postnr && data.postnrnavn) {
                document.getElementById('address').innerText = `Adresse: ${data.vejnavn} ${data.husnr}, ${data.postnr} ${data.postnrnavn}`;
            } else {
                document.getElementById('address').innerText = "Adresse kunne ikke findes.";
            }
        })
        .catch(err => {
            console.error(err);
            document.getElementById('address').innerText = "Der opstod en fejl med reverse geocoding.";
        });
});

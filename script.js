// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Center på Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;

// Håndter klik på kortet
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
            `;
        })
        .catch(err => {
            console.error('Fejl ved API-kaldet:', err);
            document.getElementById('address').innerText = "Der opstod en fejl med reverse geocoding.";
        });
});

// Adresse-autocomplete
document.getElementById('search').addEventListener('input', function () {
    var query = this.value.trim();
    if (query.length < 2) {
        document.getElementById('results').innerHTML = '';
        return;
    }

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${query}`)
        .then(response => response.json())
        .then(data => {
            var resultsList = document.getElementById('results');
            resultsList.innerHTML = '';

            data.slice(0, 5).forEach(item => {
                var li = document.createElement('li');
                li.textContent = item.tekst;
                li.addEventListener('click', function () {
                    document.getElementById('search').value = '';
                    resultsList.innerHTML = '';

                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${item.adgangsadresse.id}`)
                        .then(response => response.json())
                        .then(addressData => {
                            var coordinates = addressData.adgangspunkt.koordinater;
                            placeMarkerAndZoom(coordinates, item.tekst);
                        });
                });

                resultsList.appendChild(li);
            });
        });
});

function placeMarkerAndZoom(coordinates, addressText) {
    var [lon, lat] = coordinates;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 16);

    document.getElementById('address').innerText = `Valgt adresse: ${addressText}`;
}

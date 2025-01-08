// Initialiser kortet
var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker; // Variabel til at gemme den aktuelle markør

// Håndter kortklik
map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    // Fjern tidligere markør
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Tilføj ny markør
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Hent adresse via reverse geocoding
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

// Håndter søgning
document.getElementById('search').addEventListener('input', function() {
    var query = this.value.trim();
    if (query.length < 2) {
        document.getElementById('results').innerHTML = ''; // Ryd resultater, hvis input er for kort
        return;
    }

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${query}`)
        .then(response => response.json())
        .then(data => {
            var resultsList = document.getElementById('results');
            resultsList.innerHTML = ''; // Ryd tidligere resultater

            data.forEach(item => {
                var li = document.createElement('li');
                li.textContent = item.tekst;
                li.style.cursor = 'pointer';
                li.style.padding = '5px';

                // Når en adresse vælges, vis markør på kortet
                li.addEventListener('click', function() {
                    var address = item.adgangsadresse.adgangspunkt.koordinater;
                    var lon = address[0];
                    var lat = address[1];

                    // Fjern tidligere markør
                    if (currentMarker) {
                        map.removeLayer(currentMarker);
                    }

                    // Tilføj ny markør
                    currentMarker = L.marker([lat, lon]).addTo(map);
                    map.setView([lat, lon], 16); // Zoom til den valgte adresse

                    // Vis adresse under kortet
                    document.getElementById('address').innerText = `Valgt adresse: ${item.tekst}`;

                    // Ryd søgeresultater
                    resultsList.innerHTML = '';
                    document.getElementById('search').value = '';
                });

                resultsList.appendChild(li);
            });
        })
        .catch(err => console.error('Fejl ved søgning:', err));
});

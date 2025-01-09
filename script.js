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
            document.getElementById('address').innerHTML = `
                Adresse: ${data.vejnavn || "ukendt"} ${data.husnr || ""}, ${data.postnr || "ukendt"} ${data.postnrnavn || ""}
                <br>
                <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank">Åbn i Google Maps</a>`;
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

            data.slice(0, 5).forEach(item => { // Begræns til maks. 5 resultater
                var li = document.createElement('li');
                li.textContent = item.tekst;
                li.style.cursor = 'pointer';
                li.style.padding = '5px';

                // Når en adresse vælges, placér markør på kortet og zoom ind
                li.addEventListener('click', function() {
                    document.querySelectorAll('#results li').forEach(item => item.classList.remove('highlight'));
                    li.classList.add('highlight');
                    placeMarkerAndZoom(item);
                    resultsList.innerHTML = ''; // Ryd søgeresultater
                    document.getElementById('search').value = ''; // Ryd søgefelt
                });

                resultsList.appendChild(li);
            });

            // Hvis kun ét resultat, vælg det automatisk
            if (data.length === 1) {
                placeMarkerAndZoom(data[0]);
            }
        })
        .catch(err => console.error('Fejl ved søgning:', err));
});

// Funktion til at placere markør og zoome til adresse
function placeMarkerAndZoom(item) {
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

    // Vis adresse og link til Google Maps
    document.getElementById('address').innerHTML = `
        Valgt adresse: ${item.tekst}
        <br>
        <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank">Åbn i Google Maps</a>`;
}

// Håndter "Ryd"-knap
document.getElementById('clearSearch').addEventListener('click', function() {
    document.getElementById('search').value = ''; // Ryd søgefelt
    document.getElementById('results').innerHTML = ''; // Ryd søgeresultater
    document.getElementById('address').innerText = 'Klik på kortet eller vælg en adresse fra listen'; // Reset adressefeltet
});

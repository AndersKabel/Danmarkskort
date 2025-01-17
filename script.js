// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker; // Variabel til at gemme den aktuelle markør

// Håndter kortklik
map.on('click', function (e) {
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
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
            `;
        })
        .catch(err => {
            console.error('Fejl ved API-kaldet:', err);
            document.getElementById('address').innerText = "Der opstod en fejl med reverse geocoding.";
        });
});

// Håndter søgning
document.getElementById('search').addEventListener('input', function () {
    var query = this.value.trim();
    if (query.length < 2) {
        document.getElementById('results').innerHTML = ''; // Ryd resultater, hvis input er for kort
        return;
    }

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${query}`)
        .then(response => response.json())
        .then(data => {
            console.log("Autocomplete data:", data); // Log autocomplete-data
            var resultsList = document.getElementById('results');
            resultsList.innerHTML = ''; // Ryd tidligere resultater

            data.slice(0, 5).forEach(item => { // Begræns til maks. 5 resultater
                var li = document.createElement('li');
                li.textContent = item.tekst;
                li.style.cursor = 'pointer';
                li.style.padding = '10px';
                li.style.border = '1px solid #ddd';
                li.style.marginBottom = '5px';
                li.style.backgroundColor = '#f9f9f9';
                li.style.borderRadius = '5px';

                // Fremhæv valgte adresse
                li.addEventListener('mouseover', function () {
                    li.style.backgroundColor = '#e0f7fa'; // Lyseblå baggrund ved hover
                });
                li.addEventListener('mouseout', function () {
                    li.style.backgroundColor = '#f9f9f9'; // Tilbage til standard farve
                });

                // Når en adresse vælges, hent fulde adresseoplysninger og placér markør
                li.addEventListener('click', function () {
                    document.querySelectorAll('#results li').forEach(item => item.style.backgroundColor = '#f9f9f9'); // Fjern tidligere fremhævning
                    li.style.backgroundColor = '#c8e6c9'; // Grøn baggrund for valgt adresse

                    var adgangsadresseId = item.adgangsadresse.id;
                    console.log('Valgt adgangsadresse ID:', adgangsadresseId); // Log adgangsadresse ID

                    // Hent detaljerede adgangsadressedata
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${adgangsadresseId}`)
                        .then(response => response.json())
                        .then(adresseData => {
                            console.log('Fulde adgangsadressedata:', adresseData); // Log hele adgangsadressedata

                            if (adresseData.adgangspunkt && adresseData.adgangspunkt.koordinater) {
                                var coordinates = adresseData.adgangspunkt.koordinater;
                                placeMarkerAndZoom(coordinates, item.tekst);
                            } else {
                                alert('Kunne ikke finde koordinater for den valgte adresse.');
                            }
                        })
                        .catch(err => {
                            console.error('Fejl ved hentning af fulde adresseoplysninger:', err);
                            alert('Der opstod en fejl ved hentning af adresseoplysninger.');
                        });

                    resultsList.innerHTML = ''; // Ryd søgeresultater
                    document.getElementById('search').value = ''; // Ryd søgefelt
                });

                resultsList.appendChild(li);
            });
        })
        .catch(err => console.error('Fejl ved søgning:', err));
});

// Funktion til at placere markør og zoome til adresse
function placeMarkerAndZoom(coordinates, addressText) {
    var lon = coordinates[0];
    var lat = coordinates[1];

    // Fjern tidligere markør
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Tilføj ny markør
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Zoom og centrér kortet til den valgte adresse
    map.setView([lat, lon], 16); // Zoom-niveau 16

    // Vis adresse og links under kortet
    document.getElementById('address').innerHTML = `
        Valgt adresse: ${addressText}
        <br>
        <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
    `;
}

// Håndter "Ryd"-knap
document.getElementById('clearSearch').addEventListener('click', function () {
    document.getElementById('search').value = ''; // Ryd søgefelt
    document.getElementById('results').innerHTML = ''; // Ryd søgeresultater
    document.getElementById('address').innerText = 'Klik på kortet eller vælg en adresse fra listen'; // Reset adressefeltet

    // Fjern markør fra kortet
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null; // Nulstil markøren
    }
});


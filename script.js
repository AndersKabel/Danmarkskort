// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker; // Variabel til at gemme den aktuelle markør

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
                li.style.cursor = 'pointer';
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

// Funktion til at placere markør og zoome
function placeMarkerAndZoom(coordinates, addressText) {
    var [lon, lat] = coordinates;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 16);

    document.getElementById('address').innerHTML = `
        Valgt adresse: ${addressText}
        <br>
        <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
    `;
}

// Håndter "Ryd"-knap
document.getElementById('clearSearch').addEventListener('click', function () {
    document.getElementById('search').value = '';
    document.getElementById('results').innerHTML = '';
    document.getElementById('address').innerText = 'Klik på kortet eller vælg en adresse fra listen';

    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
});

// Håndter krydsning
document.getElementById('findIntersection').addEventListener('click', function () {
    var vej1 = document.getElementById('vej1').value.trim();
    var vej2 = document.getElementById('vej2').value.trim();

    if (vej1 && vej2) {
        fetch(`https://api.dataforsyningen.dk/kryds?vejnavn1=${vej1}&vejnavn2=${vej2}`)
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    var kryds = data[0];
                    var [lon, lat] = kryds.koordinater;

                    placeMarkerAndZoom([lon, lat], `${vej1} & ${vej2}`);
                } else {
                    alert('Ingen kryds fundet mellem de to veje.');
                }
            })
            .catch(err => console.error('Fejl ved hentning af kryds:', err));
    } else {
        alert('Indtast begge vejnavne for at finde et kryds.');
    }
});

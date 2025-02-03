// Initialiser kortet
var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;
var currentLayer;

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

// Søgefunktion
document.getElementById('search').addEventListener('input', function () {
    var query = this.value.trim();
    if (query.length < 2) return;

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${query}`)
        .then(response => response.json())
        .then(data => {
            var results = document.getElementById('results');
            results.innerHTML = '';

            data.forEach(item => {
                var li = document.createElement('li');
                li.textContent = item.tekst;
                li.addEventListener('click', function () {
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${item.adgangsadresse.id}`)
                        .then(res => res.json())
                        .then(addressData => {
                            var [lon, lat] = addressData.adgangspunkt.koordinater;
                            placeMarkerAndZoom([lon, lat], item.tekst);
                        });
                });
                results.appendChild(li);
            });
        });
});

// Funktion til placering af markør
function placeMarkerAndZoom([lon, lat], addressText) {
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

// Ryd søgning
document.getElementById('clearSearch').addEventListener('click', function () {
    document.getElementById('search').value = '';
    document.getElementById('results').innerHTML = '';
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
    document.getElementById('address').innerHTML = 'Klik på kortet eller søg efter en adresse';
});

// Lag-håndtering
document.querySelectorAll('input[name="layer"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
        if (currentLayer) {
            map.removeLayer(currentLayer);
        }

        const layerType = this.value;
        const bounds = map.getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();

        fetchPOIData(layerType, [southWest.lat, southWest.lng, northEast.lat, northEast.lng]);
    });
});

// Hent og vis POI-data
function fetchPOIData(poiType, bounds) {
    const [south, west, north, east] = bounds;
    const url = `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="${poiType}"](${south},${west},${north},${east});out;`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            const layerGroup = L.layerGroup().addTo(map);
            data.elements.forEach(poi => {
                L.marker([poi.lat, poi.lon])
                    .addTo(layerGroup)
                    .bindPopup(`${poi.tags.name || "Ukendt navn"} <br> ${poi.tags.amenity || "Ukendt type"}`);
            });
            currentLayer = layerGroup;
        })
        .catch(err => console.error('Fejl ved hentning af POI-data:', err));
}


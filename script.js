// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;

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

// Søgefunktion med autocomplete for vejnavne
document.getElementById('road1').addEventListener('input', function () {
    autocompleteRoad(this, 'results1');
});
document.getElementById('road2').addEventListener('input', function () {
    autocompleteRoad(this, 'results2');
});

function autocompleteRoad(inputElement, resultsElementId) {
    var query = inputElement.value.trim();
    if (query.length < 2) return;

    fetch(`https://api.dataforsyningen.dk/vejnavne/autocomplete?q=${query}`)
        .then(response => response.json())
        .then(data => {
            var results = document.getElementById(resultsElementId);
            results.innerHTML = '';

            data.forEach(item => {
                var li = document.createElement('li');
                li.textContent = item.vejnavn;
                li.addEventListener('click', function () {
                    inputElement.value = item.vejnavn;
                    results.innerHTML = '';
                });
                results.appendChild(li);
            });
        })
        .catch(err => console.error('Fejl ved autocomplete:', err));
}

// Funktion til at finde og zoome til området, hvor to veje mødes
document.getElementById('findIntersection').addEventListener('click', function () {
    var road1 = document.getElementById('road1').value.trim();
    var road2 = document.getElementById('road2').value.trim();

    if (road1.length < 2 || road2.length < 2) {
        alert('Indtast mindst 2 bogstaver for begge veje.');
        return;
    }

    // Hent vejsegmenter for begge veje
    Promise.all([
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road2}`).then(res => res.json())
    ])
    .then(([road1Segments, road2Segments]) => {
        console.log('Road1 Segments:', road1Segments);
        console.log('Road2 Segments:', road2Segments);

        // Filtrer på fælles kommuner
        var commonMunicipalities = getCommonMunicipalities(road1Segments, road2Segments);
        console.log('Fælles Kommuner:', commonMunicipalities);

        if (commonMunicipalities.length === 0) {
            alert('Ingen fælles kommuner fundet mellem de to veje.');
            return;
        }

        drawRoadSegments(road1Segments, 'blue');
        drawRoadSegments(road2Segments, 'blue');
    })
    .catch(err => console.error('Fejl ved vejsegment-opslag:', err));
});

// Funktion til at finde fælles kommuner
function getCommonMunicipalities(road1Segments, road2Segments) {
    var road1Municipalities = road1Segments.map(segment => segment.kommunekode);
    var road2Municipalities = road2Segments.map(segment => segment.kommunekode);
    return road1Municipalities.filter(value => road2Municipalities.includes(value));
}

// Funktion til at tegne vejsegmenter på kortet
function drawRoadSegments(segments, color) {
    segments.forEach(segment => {
        if (segment.geometri && segment.geometri.coordinates) {
            var latlngs = segment.geometri.coordinates.map(coord => [coord[1], coord[0]]);
            L.polyline(latlngs, { color: color }).addTo(map);
        }
    });
}

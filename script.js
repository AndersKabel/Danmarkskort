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

// Autocomplete-funktion
function setupAutocomplete(inputId, resultsId) {
    const inputField = document.getElementById(inputId);
    const resultsContainer = document.getElementById(resultsId);

    inputField.addEventListener('input', function () {
        const query = inputField.value.trim();
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        fetch(`https://api.dataforsyningen.dk/vejnavne/autocomplete?q=${query}&per_side=5`)
            .then(response => response.json())
            .then(data => {
                resultsContainer.innerHTML = '';
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.navn} (${item.kommuner.map(k => k.navn).join(', ')})`;
                    li.addEventListener('click', () => {
                        inputField.value = item.navn;
                        resultsContainer.innerHTML = '';
                    });
                    resultsContainer.appendChild(li);
                });
            })
            .catch(err => console.error('Fejl ved autocomplete-søgning:', err));
    });

    document.addEventListener('click', function (e) {
        if (!resultsContainer.contains(e.target) && e.target !== inputField) {
            resultsContainer.innerHTML = '';
        }
    });
}

// Opsæt autocomplete for begge vejnavne
setupAutocomplete('road1', 'road1Results');
setupAutocomplete('road2', 'road2Results');

// Funktion til at finde og zoome til området, hvor to veje mødes
document.getElementById('findIntersection').addEventListener('click', function () {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

    if (road1.length < 2 || road2.length < 2) {
        alert('Indtast mindst 2 bogstaver for begge veje.');
        return;
    }

    Promise.all([
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road2}`).then(res => res.json())
    ])
    .then(([road1Segments, road2Segments]) => {
        console.log('Road1 Segments:', road1Segments);
        console.log('Road2 Segments:', road2Segments);

        if (road1Segments.length === 0 || road2Segments.length === 0) {
            alert('Ingen data fundet for et eller begge vejnavne.');
            return;
        }

        var midpoint = calculateMidpoint(road1Segments, road2Segments);
        if (midpoint) {
            map.setView(midpoint, 16);
        } else {
            alert('Ingen overlap fundet mellem de to veje.');
        }
    })
    .catch(err => console.error('Fejl ved vejsegment-opslag:', err));
});

function calculateMidpoint(road1Segments, road2Segments) {
    let allCoords1 = road1Segments.flatMap(segment => segment.geometri?.coordinates || []);
    let allCoords2 = road2Segments.flatMap(segment => segment.geometri?.coordinates || []);

    let allCoords = [...allCoords1, ...allCoords2];
    if (allCoords.length === 0) {
        console.error('Ingen koordinater fundet.');
        return null;
    }

    let totalLat = 0, totalLon = 0;

    allCoords.forEach(coord => {
        totalLon += coord[0];
        totalLat += coord[1];
    });

    let avgLon = totalLon / allCoords.length;
    let avgLat = totalLat / allCoords.length;

    return [avgLat, avgLon];
}

// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var roadLayerGroup = L.layerGroup().addTo(map); // Til vejesegmenter
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
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">\u00c5bn i Google Street View</a>
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

            data.slice(0, 5).forEach(item => {
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
        <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">\u00c5bn i Google Street View</a>
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
});

// Find kryds-knap
document.getElementById('findIntersection').addEventListener('click', function () {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

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

        let commonMunicipalities = road1Segments.map(r => r.kommune.navn)
            .filter(value => road2Segments.map(r => r.kommune.navn).includes(value));
        
        console.log('Fælles Kommuner:', commonMunicipalities);

        if (commonMunicipalities.length === 0) {
            alert('Ingen fælles kommuner fundet.');
            return;
        }

        let filteredRoad1 = road1Segments.filter(r => commonMunicipalities.includes(r.kommune.navn));
        let filteredRoad2 = road2Segments.filter(r => commonMunicipalities.includes(r.kommune.navn));

        console.log('Filtrerede Road1 Segments:', filteredRoad1);
        console.log('Filtrerede Road2 Segments:', filteredRoad2);

        drawRoadSegments(filteredRoad1, roadLayerGroup, 'blue');
        drawRoadSegments(filteredRoad2, roadLayerGroup, 'red');

        let midpoint = calculateMidpoint(filteredRoad1, filteredRoad2);
        if (midpoint) {
            map.setView(midpoint, 14);
            alert('Veje er blevet farvet og zoomet ind.');
        } else {
            alert('Ingen overlap fundet mellem de to veje.');
        }
    })
    .catch(err => {
        console.error('Fejl under behandlingen:', err);
        alert('Der opstod en fejl under behandlingen. Tjek konsollen for detaljer.');
    });
});

// Funktion til at tegne vejsegmenter
function drawRoadSegments(roadSegments, layerGroup, color) {
    layerGroup.clearLayers(); // Ryd tidligere lag

    roadSegments.forEach(segment => {
        if (segment.geometri && segment.geometri.coordinates) {
            const coordinates = segment.geometri.coordinates.map(coord => [coord[1], coord[0]]); // Vend lat/lon
            L.polyline(coordinates, { color: color, weight: 4 }).addTo(layerGroup);
        } else {
            console.warn('Segmentet mangler gyldige koordinater:', segment);
        }
    });
}

// Funktion til at beregne midtpunktet mellem to vejsegmenter
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
        totalLon += coord[0]; // Longitude
        totalLat += coord[1]; // Latitude
    });

    let avgLon = totalLon / allCoords.length;
    let avgLat = totalLat / allCoords.length;

    return [avgLat, avgLon];
}

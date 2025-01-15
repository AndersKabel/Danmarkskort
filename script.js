// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;
var roadLayers = []; // Holder lag for visualiserede veje

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
});

// Funktion til at finde og zoome til området, hvor to veje mødes
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
        console.log('Original Road1 Segments:', road1Segments);
        console.log('Original Road2 Segments:', road2Segments);

        // Find et fælles postnummer
        const road1Postnumre = [...new Set(road1Segments.map(seg => seg.postnummer?.nr))];
        const road2Postnumre = [...new Set(road2Segments.map(seg => seg.postnummer?.nr))];
        console.log('Road1 Postnumre:', road1Postnumre);
        console.log('Road2 Postnumre:', road2Postnumre);

        const fællesPostnumre = road1Postnumre.filter(nr => road2Postnumre.includes(nr));
        console.log('Fælles Postnumre:', fællesPostnumre);

        if (fællesPostnumre.length === 0) {
            alert('Ingen fælles postnumre fundet.');
            return;
        }

        // Filtrer segmenter baseret på fælles postnumre
        road1Segments = road1Segments.filter(seg => fællesPostnumre.includes(seg.postnummer?.nr));
        road2Segments = road2Segments.filter(seg => fællesPostnumre.includes(seg.postnummer?.nr));

        console.log('Filtrerede Road1 Segments:', road1Segments);
        console.log('Filtrerede Road2 Segments:', road2Segments);

        if (road1Segments.length === 0 || road2Segments.length === 0) {
            alert('Ingen segmenter fundet i fælles postnumre.');
            return;
        }

        // Visualiser vejsegmenter
        visualizeRoads(road1Segments, 'blue');
        visualizeRoads(road2Segments, 'red');

        // Beregn midtpunktet mellem de to veje
        var midpoint = calculateMidpoint(road1Segments, road2Segments);
        if (midpoint) {
            map.setView(midpoint, 16); // Zoom til midtpunktet
        } else {
            alert('Ingen overlap fundet mellem de to veje.');
        }
    })
    .catch(err => console.error('Fejl ved vejsegment-opslag:', err));
});

// Funktion til at visualisere vejsegmenter
function visualizeRoads(segments, color) {
    // Fjern tidligere visualiseringer
    roadLayers.forEach(layer => map.removeLayer(layer));
    roadLayers = [];

    segments.forEach(segment => {
        if (segment.geometri?.coordinates) {
            var coords = segment.geometri.coordinates.map(coord => [coord[1], coord[0]]);
            var polyline = L.polyline(coords, { color: color }).addTo(map);
            roadLayers.push(polyline);
        }
    });
}

// Funktion til at beregne midtpunktet mellem to vejsegmenter med øget tolerance
function calculateMidpoint(road1Segments, road2Segments) {
    console.log('Road1 Segments:', road1Segments);
    console.log('Road2 Segments:', road2Segments);

    // Hent alle koordinater fra vejsegmenter
    let allCoords1 = road1Segments.flatMap(segment => segment.geometri?.coordinates || []);
    let allCoords2 = road2Segments.flatMap(segment => segment.geometri?.coordinates || []);

    console.log('All Coords Road1:', allCoords1);
    console.log('All Coords Road2:', allCoords2);

    if (allCoords1.length === 0 || allCoords2.length === 0) {
        console.error('Ingen koordinater fundet.');
        return null;
    }

    const tolerance = 0.0001; // Forøget tolerance (~10 meter)

    let closestPoints = [];

    allCoords1.forEach(coord1 => {
        allCoords2.forEach(coord2 => {
            let latDiff = Math.abs(coord1[1] - coord2[1]);
            let lonDiff = Math.abs(coord1[0] - coord2[0]);

            if (latDiff < tolerance && lonDiff < tolerance) {
                closestPoints.push([coord1, coord2]);
                console.log('Match fundet:', coord1, coord2);
            }
        });
    });

    if (closestPoints.length > 0) {
        let [closestPoint1, closestPoint2] = closestPoints[0];
        let midpointLon = (closestPoint1[0] + closestPoint2[0]) / 2;
        let midpointLat = (closestPoint1[1] + closestPoint2[1]) / 2;
        return [midpointLat, midpointLon];
    }

    console.log('Ingen nærliggende punkter fundet.');
    return null; // Ingen nærliggende punkter fundet
}

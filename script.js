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
        // Log data for at tjekke strukturen
        console.log('Road1 Segments:', road1Segments);
        console.log('Road2 Segments:', road2Segments);

        if (road1Segments.length === 0 || road2Segments.length === 0) {
            alert('Ingen data fundet for et eller begge vejnavne.');
            return;
        }

        // Beregn midtpunktet mellem de to veje
        var midpoint = calculateMidpoint(road1Segments, road2Segments);
        if (midpoint) {
            map.setView(midpoint, 16); // Zoom til midtpunktet
        } else {
            alert('Ingen overlap fundet mellem de to veje.');
        }
    })
    .catch(err => console.error('Fejl ved vejsegment-opslag:', err)); // Fang eventuelle fejl
});

// Funktion til at beregne midtpunktet mellem to vejsegmenter med detaljeret logning
function calculateMidpoint(road1Segments, road2Segments) {
    console.log('Road1 Segments:', road1Segments);
    console.log('Road2 Segments:', road2Segments);

    // Forsøg på at finde koordinater
    let allCoords1 = road1Segments.flatMap(segment => {
        console.log('Road1 segment fuld struktur:', segment);
        return segment.geometri?.coordinates || segment.bbox || [];
    });
    let allCoords2 = road2Segments.flatMap(segment => {
        console.log('Road2 segment fuld struktur:', segment);
        return segment.geometri?.coordinates || segment.bbox || [];
    });

    console.log('All Coords Road1:', allCoords1);
    console.log('All Coords Road2:', allCoords2);

    if (allCoords1.length === 0 || allCoords2.length === 0) {
        console.error('Ingen koordinater fundet.');
        return null;
    }

    const tolerance = 0.00005; // Tolerance for sammenligning af koordinater (~5 meter)

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
        // Beregn midtpunktet for det første fundne punktpar
        let [closestPoint1, closestPoint2] = closestPoints[0];
        let midpointLon = (closestPoint1[0] + closestPoint2[0]) / 2;
        let midpointLat = (closestPoint1[1] + closestPoint2[1]) / 2;
        return [midpointLat, midpointLon];
    }

    console.log('Ingen nærliggende punkter fundet.');
    return null; // Ingen nærliggende punkter fundet
}

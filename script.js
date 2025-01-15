// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;
var roadLayers = []; // Holder styr på visualiserede veje

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

// Funktion til at finde og visualisere veje
document.getElementById('findIntersection').addEventListener('click', function () {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

    console.log(`Søger efter veje: ${road1} ${road2}`);

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

        var road1Kommuner = [...new Set(road1Segments.map(seg => seg.kommune.navn))];
        var road2Kommuner = [...new Set(road2Segments.map(seg => seg.kommune.navn))];
        var fællesKommuner = road1Kommuner.filter(kommune => road2Kommuner.includes(kommune));

        console.log('Fælles Kommuner:', fællesKommuner);

        var filtreredeRoad1 = road1Segments.filter(seg => fællesKommuner.includes(seg.kommune.navn));
        var filtreredeRoad2 = road2Segments.filter(seg => fællesKommuner.includes(seg.kommune.navn));

        console.log('Filtrerede Road1 Segments:', filtreredeRoad1);
        console.log('Filtrerede Road2 Segments:', filtreredeRoad2);

        visualizeRoads(filtreredeRoad1, 'blue');
        visualizeRoads(filtreredeRoad2, 'red');
    })
    .catch(err => console.error('Fejl ved vejsegment-opslag:', err));
});

// Funktion til at visualisere veje
function visualizeRoads(segments, color) {
    roadLayers.forEach(layer => map.removeLayer(layer)); // Fjern tidligere lag
    roadLayers = [];

    segments.forEach(segment => {
        if (segment.geometri && segment.geometri.coordinates) {
            var coords = segment.geometri.coordinates.map(coord => [coord[1], coord[0]]);
            var polyline = L.polyline(coords, { color: color, weight: 5 }).addTo(map); // Gør linjen tydeligere
            roadLayers.push(polyline);
        } else {
            console.warn('Segment har ingen koordinater:', segment);
        }
    });
}

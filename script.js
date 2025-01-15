// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;
var road1Layer, road2Layer;

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

// Funktion til at finde og farve veje i samme kommune
function findAndHighlightRoads() {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

    if (road1.length < 2 || road2.length < 2) {
        alert('Indtast mindst 2 bogstaver for begge veje.');
        return;
    }

    console.log(`Søger efter veje: ${road1} ${road2}`);

    Promise.all([
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road2}`).then(res => res.json())
    ])
    .then(([road1Segments, road2Segments]) => {
        console.log('Road1 Segments:', road1Segments);
        console.log('Road2 Segments:', road2Segments);

        // Find fælles kommuner
        const road1Kommuner = road1Segments.map(seg => seg.kommune.navn);
        const road2Kommuner = road2Segments.map(seg => seg.kommune.navn);
        const faellesKommuner = road1Kommuner.filter(kom => road2Kommuner.includes(kom));
        console.log('Fælles Kommuner:', faellesKommuner);

        // Filtrer vejsegmenter efter fælles kommuner
        const filtreredeRoad1Segments = road1Segments.filter(seg => faellesKommuner.includes(seg.kommune.navn));
        const filtreredeRoad2Segments = road2Segments.filter(seg => faellesKommuner.includes(seg.kommune.navn));

        console.log('Filtrerede Road1 Segments:', filtreredeRoad1Segments);
        console.log('Filtrerede Road2 Segments:', filtreredeRoad2Segments);

        // Fjern gamle lag, hvis de findes
        if (road1Layer) map.removeLayer(road1Layer);
        if (road2Layer) map.removeLayer(road2Layer);

        // Tilføj nye lag for de to veje
        road1Layer = L.geoJSON({
            type: 'FeatureCollection',
            features: filtreredeRoad1Segments.map(seg => seg.geometri)
        }, { style: { color: 'blue' } }).addTo(map);

        road2Layer = L.geoJSON({
            type: 'FeatureCollection',
            features: filtreredeRoad2Segments.map(seg => seg.geometri)
        }, { style: { color: 'blue' } }).addTo(map);

        // Zoom til de fælles områder
        if (road1Layer.getBounds().isValid() && road2Layer.getBounds().isValid()) {
            const combinedBounds = road1Layer.getBounds().extend(road2Layer.getBounds());
            map.fitBounds(combinedBounds);
        }

        alert('Vejene er blevet farvet blå i de fælles kommuner.');
    })
    .catch(err => console.error('Fejl ved hentning af vejdata:', err));
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

// Find kryds-knap funktionalitet
document.getElementById('findIntersection').addEventListener('click', findAndHighlightRoads);

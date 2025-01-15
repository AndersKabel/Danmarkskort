// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Standardvisning over Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var road1Layer = L.layerGroup().addTo(map);
var road2Layer = L.layerGroup().addTo(map);

document.getElementById('findIntersection').addEventListener('click', async function () {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

    if (road1.length < 2 || road2.length < 2) {
        alert('Indtast mindst 2 bogstaver for begge veje.');
        return;
    }

    console.log(`Søger efter veje: ${road1} ${road2}`);

    try {
        // Hent vejsegmenter
        const [road1Segments, road2Segments] = await Promise.all([
            fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road1}`).then(res => res.json()),
            fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road2}`).then(res => res.json())
        ]);

        console.log('Road1 Segments:', road1Segments);
        console.log('Road2 Segments:', road2Segments);

        // Find fælles kommuner
        const road1Kommuner = road1Segments.map(segment => segment.kommune.navn);
        const road2Kommuner = road2Segments.map(segment => segment.kommune.navn);
        const fællesKommuner = road1Kommuner.filter(kommune => road2Kommuner.includes(kommune));

        console.log('Fælles Kommuner:', fællesKommuner);

        if (fællesKommuner.length === 0) {
            alert('Ingen fælles kommuner fundet.');
            return;
        }

        // Filtrer segmenter efter fælles kommuner
        const road1Filtered = road1Segments.filter(segment => fællesKommuner.includes(segment.kommune.navn));
        const road2Filtered = road2Segments.filter(segment => fællesKommuner.includes(segment.kommune.navn));

        console.log('Filtrerede Road1 Segments:', road1Filtered);
        console.log('Filtrerede Road2 Segments:', road2Filtered);

        // Ryd gamle lag
        road1Layer.clearLayers();
        road2Layer.clearLayers();

        // Tegn veje på kortet
        drawRoadSegments(road1Filtered, road1Layer, 'blue');
        drawRoadSegments(road2Filtered, road2Layer, 'green');

        // Zoom til området for de filtrerede segmenter
        const bounds = L.featureGroup([road1Layer, road2Layer]).getBounds();
        map.fitBounds(bounds);

        alert('Veje er blevet farvet og zoomet ind på kortet.');

    } catch (error) {
        console.error('Fejl under behandling:', error);
        alert('Der opstod en fejl under behandlingen. Tjek konsollen for detaljer.');
    }
});

// Funktion til at tegne vejsegmenter på kortet
function drawRoadSegments(segments, layerGroup, color) {
    segments.forEach(segment => {
        const coordinates = segment.geometri.coordinates.map(coord => [coord[1], coord[0]]);
        L.polyline(coordinates, { color }).addTo(layerGroup);
    });
}

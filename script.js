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
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">\u00c5bn i Google Street View</a>
            `;
        })
        .catch(err => console.error('Fejl ved reverse geocoding:', err));
});

// Funktion til at finde og farve veje
function highlightRoads(road1Segments, road2Segments) {
    var road1Layer = L.geoJSON(road1Segments, { color: 'blue' }).addTo(map);
    var road2Layer = L.geoJSON(road2Segments, { color: 'blue' }).addTo(map);

    // Zoom til lagene
    var group = new L.featureGroup([road1Layer, road2Layer]);
    map.fitBounds(group.getBounds());

    alert('Vejene er blevet farvet blå i de fælles kommuner.');
}

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
        console.log('Road1 Segments:', road1Segments);
        console.log('Road2 Segments:', road2Segments);

        // Find fælles kommuner
        var road1Kommuner = road1Segments.map(segment => segment.kommune.navn);
        var road2Kommuner = road2Segments.map(segment => segment.kommune.navn);
        var faellesKommuner = road1Kommuner.filter(kommune => road2Kommuner.includes(kommune));

        console.log('Fælles Kommuner:', faellesKommuner);

        // Filtrer segmenter baseret på fælles kommuner
        var filtreredeRoad1Segments = road1Segments.filter(segment => faellesKommuner.includes(segment.kommune.navn));
        var filtreredeRoad2Segments = road2Segments.filter(segment => faellesKommuner.includes(segment.kommune.navn));

        console.log('Filtrerede Road1 Segments:', filtreredeRoad1Segments);
        console.log('Filtrerede Road2 Segments:', filtreredeRoad2Segments);

        if (filtreredeRoad1Segments.length > 0 && filtreredeRoad2Segments.length > 0) {
            highlightRoads(filtreredeRoad1Segments, filtreredeRoad2Segments);
        } else {
            alert('Ingen fælles kommuner eller vejsegmenter fundet.');
        }
    })
    .catch(err => console.error('Fejl ved vejsegment-opslag:', err));
});

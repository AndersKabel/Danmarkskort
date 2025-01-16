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
function setupAutoComplete(inputElementId, dropdownElementId) {
    const inputElement = document.getElementById(inputElementId);
    const dropdownElement = document.getElementById(dropdownElementId);

    inputElement.addEventListener('input', function () {
        const query = this.value.trim();
        if (query.length < 2) {
            dropdownElement.innerHTML = '';
            return;
        }

        fetch(`https://api.dataforsyningen.dk/vejstykker/autocomplete?q=${query}`)
            .then(response => response.json())
            .then(data => {
                dropdownElement.innerHTML = '';

                data.forEach(item => {
                    const option = document.createElement('div');
                    option.textContent = `${item.vejnavn}, ${item.kommune.navn}`;
                    option.classList.add('autocomplete-item');
                    option.addEventListener('click', function () {
                        inputElement.value = item.vejnavn;
                        inputElement.dataset.kommune = item.kommune.navn;
                        dropdownElement.innerHTML = '';
                    });
                    dropdownElement.appendChild(option);
                });
            })
            .catch(err => console.error('Fejl ved vej-autocomplete:', err));
    });

    inputElement.addEventListener('blur', function () {
        setTimeout(() => dropdownElement.innerHTML = '', 200); // Skjul dropdown efter tab
    });
}

// Tilføj autosøgning til begge vejfelter
setupAutoComplete('road1', 'road1-dropdown');
setupAutoComplete('road2', 'road2-dropdown');

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

// Funktion til at beregne midtpunktet mellem to vejsegmenter
function calculateMidpoint(road1Segments, road2Segments) {
    let allCoords1 = road1Segments.flatMap(segment => segment.geometri?.coordinates || []);
    let allCoords2 = road2Segments.flatMap(segment => segment.geometri?.coordinates || []);

    // Find gennemsnit af alle koordinater fra begge veje
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

// CSS til autosøgning
const style = document.createElement('style');
style.innerHTML = `
    .autocomplete-dropdown {
        position: absolute;
        background-color: white;
        border: 1px solid #ccc;
        max-height: 150px;
        overflow-y: auto;
        z-index: 1000;
    }
    .autocomplete-item {
        padding: 5px;
        cursor: pointer;
    }
    .autocomplete-item:hover {
        background-color: #f0f0f0;
    }
`;
document.head.appendChild(style);

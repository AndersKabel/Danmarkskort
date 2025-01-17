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

// Find kryds mellem to veje
document.getElementById('findIntersection').addEventListener('click', function () {
    const road1 = document.getElementById('vej1').value.trim().toLowerCase();
    const road2 = document.getElementById('vej2').value.trim().toLowerCase();

    if (!road1 || !road2) {
        alert('Indtast begge vejnavne.');
        return;
    }

    Promise.all([
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road2}`).then(res => res.json())
    ])
        .then(([road1Data, road2Data]) => {
            const road1Coords = road1Data.flatMap(segment => segment.geometri?.coordinates || []);
            const road2Coords = road2Data.flatMap(segment => segment.geometri?.coordinates || []);

            if (road1Coords.length === 0 || road2Coords.length === 0) {
                alert('Ingen data fundet for et eller begge vejnavne.');
                return;
            }

            const commonCoords = road1Coords.filter(coord1 =>
                road2Coords.some(coord2 => Math.abs(coord1[0] - coord2[0]) < 0.0001 && Math.abs(coord1[1] - coord2[1]) < 0.0001)
            );

            if (commonCoords.length > 0) {
                const [lon, lat] = commonCoords[0];
                map.setView([lat, lon], 16);

                if (currentMarker) {
                    map.removeLayer(currentMarker);
                }
                currentMarker = L.marker([lat, lon]).addTo(map);
                alert('Kryds fundet og markeret på kortet!');
            } else {
                alert('Ingen kryds fundet mellem de to veje.');
            }
        })
        .catch(err => console.error('Fejl ved kryds-opslag:', err));
});

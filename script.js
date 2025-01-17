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

// Funktion til at finde kryds mellem to veje
document.getElementById('findIntersection').addEventListener('click', function () {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

    if (road1.length < 2 || road2.length < 2) {
        alert('Indtast mindst 2 bogstaver for begge veje.');
        return;
    }

    // Hent adresser for begge veje
    Promise.all([
        fetch(`https://api.dataforsyningen.dk/adresser?vejnavn=${road1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/adresser?vejnavn=${road2}`).then(res => res.json())
    ])
    .then(([road1Data, road2Data]) => {
        // Filtrér adresser med samme postnummer
        var postnr = road1Data[0]?.postnr; // Brug første adresse for road1 til at bestemme postnummer
        var filteredRoad1 = road1Data.filter(addr => addr.postnr === postnr);
        var filteredRoad2 = road2Data.filter(addr => addr.postnr === postnr);

        // Find kryds
        var intersection = findIntersection(filteredRoad1, filteredRoad2);
        if (intersection) {
            var [lon, lat] = intersection;
            placeMarkerAndZoom([lon, lat], `Kryds mellem ${road1} og ${road2}`);
        } else {
            alert('Ingen kryds fundet mellem de to veje.');
        }
    })
    .catch(err => console.error('Fejl ved vejnavneopslag:', err));
});

// Hjælpefunktion til at finde kryds
function findIntersection(road1Data, road2Data) {
    const maxRadius = 1000; // Maksimumradius i meter
    const step = 100; // Udvid radius i trin af 100 meter

    for (let radius = 100; radius <= maxRadius; radius += step) {
        for (var addr1 of road1Data) {
            for (var addr2 of road2Data) {
                var distance = calculateDistance(
                    addr1.adgangspunkt.koordinater[1], addr1.adgangspunkt.koordinater[0],
                    addr2.adgangspunkt.koordinater[1], addr2.adgangspunkt.koordinater[0]
                );
                if (distance <= radius) {
                    return addr1.adgangspunkt.koordinater; // Returner koordinaterne for det første fundne kryds
                }
            }
        }
    }
    return null; // Ingen kryds fundet
}

// Funktion til at beregne afstand mellem to koordinater (Haversine-formel)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Jordens radius i meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Afstand i meter
}



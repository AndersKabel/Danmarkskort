// Initialiser kortet
const map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let currentMarker;

// Klik på kortet for at finde en adresse
map.on('click', function (e) {
    const { lat, lng } = e.latlng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentMarker = L.marker([lat, lng]).addTo(map);

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lng}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('address').innerHTML = `
                Adresse: ${data.vejnavn || "ukendt"} ${data.husnr || ""}, ${data.postnr || "ukendt"} ${data.postnrnavn || ""}
                <br>
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}" target="_blank">Åbn i Google Street View</a>
            `;
        })
        .catch(err => console.error('Fejl ved reverse geocoding:', err));
});

// Autocomplete for vejnavne
function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    const resultsContainer = document.getElementById('results');

    input.addEventListener('input', function () {
        const query = this.value.trim();
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        fetch(`https://api.dataforsyningen.dk/vejstykker/autocomplete?q=${query}`)
            .then(response => response.json())
            .then(data => {
                resultsContainer.innerHTML = '';
                data.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.tekst} (${item.kommune.navn})`;
                    li.addEventListener('click', () => {
                        input.value = item.tekst;
                        resultsContainer.innerHTML = '';
                    });
                    resultsContainer.appendChild(li);
                });
            })
            .catch(err => console.error('Fejl ved autocomplete:', err));
    });
}

setupAutocomplete('vej1');
setupAutocomplete('vej2');

// Find kryds mellem to veje
document.getElementById('findIntersection').addEventListener('click', function () {
    const road1 = document.getElementById('vej1').value.trim();
    const road2 = document.getElementById('vej2').value.trim();

    if (!road1 || !road2) {
        alert('Indtast begge vejnavne.');
        return;
    }

    Promise.all([
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/vejstykker?vejnavn=${road2}`).then(res => res.json())
    ])
        .then(([road1Data, road2Data]) => {
            const road1Coords = road1Data.flatMap(segment => segment.geometri.coordinates || []);
            const road2Coords = road2Data.flatMap(segment => segment.geometri.coordinates || []);

            if (road1Coords.length && road2Coords.length) {
                // Simplistisk krydslogik: vælg første koordinat fra hver vej og beregn midtpunkt
                const midpoint = [
                    (road1Coords[0][1] + road2Coords[0][1]) / 2,
                    (road1Coords[0][0] + road2Coords[0][0]) / 2
                ];

                map.setView(midpoint, 16);
                if (currentMarker) {
                    map.removeLayer(currentMarker);
                }
                currentMarker = L.marker(midpoint).addTo(map);
                alert('Kryds fundet!');
            } else {
                alert('Ingen kryds fundet mellem de to veje.');
            }
        })
        .catch(err => console.error('Fejl ved kryds-opslag:', err));
});

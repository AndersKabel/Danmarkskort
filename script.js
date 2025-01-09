// Initialiser kortet
var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker; // Variabel til at gemme den aktuelle markør

// Håndter kortklik
map.on('click', function (e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    // Fjern tidligere markør
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Tilføj ny markør
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Hent adresse via reverse geocoding
    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('address').innerHTML = `
                Adresse: ${data.vejnavn || "ukendt"} ${data.husnr || ""}, ${data.postnr || "ukendt"} ${data.postnrnavn || ""}
                <br>
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
            `;
        })
        .catch(err => {
            console.error('Fejl ved API-kaldet:', err);
            document.getElementById('address').innerText = "Der opstod en fejl med reverse geocoding.";
        });
});

// Håndter søgning
document.getElementById('search').addEventListener('input', function () {
    var query = this.value.trim();
    if (query.length < 2) {
        document.getElementById('results').innerHTML = '';
        return;
    }

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${query}`)
        .then(response => response.json())
        .then(data => {
            var resultsList = document.getElementById('results');
            resultsList.innerHTML = '';

            data.slice(0, 5).forEach(item => {
                var li = document.createElement('li');
                li.textContent = item.tekst;
                li.style.cursor = 'pointer';

                li.addEventListener('click', function () {
                    document.querySelectorAll('#results li').forEach(item => item.style.backgroundColor = '');
                    li.style.backgroundColor = '#c8e6c9';

                    var adgangsadresseId = item.adgangsadresse.id;

                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${adgangsadresseId}`)
                        .then(response => response.json())
                        .then(adresseData => {
                            if (adresseData.adgangspunkt && adresseData.adgangspunkt.koordinater) {
                                var coordinates = adresseData.adgangspunkt.koordinater;
                                placeMarkerAndZoom(coordinates, item.tekst);
                            } else {
                                alert('Kunne ikke finde koordinater for den valgte adresse.');
                            }
                        })
                        .catch(err => {
                            console.error('Fejl ved hentning af fulde adresseoplysninger:', err);
                        });

                    resultsList.innerHTML = '';
                    document.getElementById('search').value = '';
                });

                resultsList.appendChild(li);
            });
        })
        .catch(err => console.error('Fejl ved søgning:', err));
});

// Håndter "Find kryds"-knap
document.getElementById('findKryds').addEventListener('click', function () {
    var vej1 = document.getElementById('vej1').value.trim();
    var vej2 = document.getElementById('vej2').value.trim();

    if (!vej1 || !vej2) {
        alert('Indtast begge vejnavne for at finde krydset.');
        return;
    }

    Promise.all([
        fetch(`https://api.dataforsyningen.dk/adgangsadresser?vejnavn=${encodeURIComponent(vej1)}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/adgangsadresser?vejnavn=${encodeURIComponent(vej2)}`).then(res => res.json())
    ]).then(([vej1Adresser, vej2Adresser]) => {
        var kryds = findIntersection(vej1Adresser, vej2Adresser);

        if (kryds) {
            placeMarkerAndZoom(kryds, `Kryds mellem ${vej1} og ${vej2}`);
        } else {
            alert('Ingen krydsningspunkt fundet mellem de to veje.');
        }
    }).catch(err => {
        console.error('Fejl ved hentning af adgangsadresser:', err);
    });
});

// Funktion til at finde krydsningspunkt
function findIntersection(vej1Adresser, vej2Adresser) {
    const threshold = 0.001; // Øget tærskelværdi for nærhed (ca. 100 meter)

    for (let adr1 of vej1Adresser) {
        for (let adr2 of vej2Adresser) {
            const distance = calculateDistance(adr1.adgangspunkt.koordinater, adr2.adgangspunkt.koordinater);

            console.log(`Sammenligner: ${adr1.adgangsadresse.vejnavn} (${adr1.adgangspunkt.koordinater}) med ${adr2.adgangsadresse.vejnavn} (${adr2.adgangspunkt.koordinater}), Afstand: ${distance} meter`);

            if (distance < threshold) {
                console.log("Kryds fundet ved:", adr1.adgangspunkt.koordinater);
                return adr1.adgangspunkt.koordinater; // Returnér koordinater for kryds
            }
        }
    }

    console.warn("Ingen kryds fundet mellem de to veje.");
    return null; // Ingen kryds fundet
}

// Funktion til at beregne afstand mellem to punkter (Haversine-formel)
function calculateDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const R = 6371e3; // Jordens radius i meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Afstand i meter
    return distance;
}

// Funktion til at placere markør og zoome
function placeMarkerAndZoom(coordinates, addressText) {
    var lon = coordinates[0];
    var lat = coordinates[1];

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

// Håndter "Ryd"-knap
document.getElementById('clearSearch').addEventListener('click', function () {
    document.getElementById('search').value = '';
    document.getElementById('results').innerHTML = '';
    document.getElementById('address').innerText = 'Klik på kortet eller vælg en adresse fra listen';

    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
});

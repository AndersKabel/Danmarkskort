// Initialiser kortet
var map = L.map('map').setView([56, 10], 7); // Center på Danmark
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;

// Håndter klik på kortet
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
        .catch(err => {
            console.error('Fejl ved API-kaldet:', err);
            document.getElementById('address').innerText = "Der opstod en fejl med reverse geocoding.";
        });
});

// Adresse-autocomplete
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
                li.addEventListener('click', function () {
                    document.getElementById('search').value = '';
                    resultsList.innerHTML = '';

                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${item.adgangsadresse.id}`)
                        .then(response => response.json())
                        .then(addressData => {
                            var coordinates = addressData.adgangspunkt.koordinater;
                            placeMarkerAndZoom(coordinates, item.tekst);
                        });
                });

                resultsList.appendChild(li);
            });
        });
});

// Find kryds
document.getElementById('findKryds').addEventListener('click', function () {
    var vej1 = document.getElementById('vej1').value.trim();
    var vej2 = document.getElementById('vej2').value.trim();

    if (!vej1 || !vej2) {
        alert('Indtast begge vejnavne for at finde krydset.');
        return;
    }

    Promise.all([
        fetch(`https://api.dataforsyningen.dk/adgangsadresser?vejnavn=${vej1}`).then(res => res.json()),
        fetch(`https://api.dataforsyningen.dk/adgangsadresser?vejnavn=${vej2}`).then(res => res.json())
    ]).then(([adresserVej1, adresserVej2]) => {
        var kryds = findIntersection(adresserVej1, adresserVej2);
        if (kryds) {
            placeMarkerAndZoom(kryds, `Kryds mellem ${vej1} og ${vej2}`);
        } else {
            alert('Ingen krydsningspunkt fundet mellem de to veje.');
        }
    }).catch(err => console.error('Fejl:', err));
});

function findIntersection(adresserVej1, adresserVej2) {
    const threshold = 0.002;
    for (let adr1 of adresserVej1) {
        for (let adr2 of adresserVej2) {
            const [lon1, lat1] = adr1.adgangspunkt.koordinater;
            const [lon2, lat2] = adr2.adgangspunkt.koordinater;
            const distance = Math.sqrt(Math.pow(lon1 - lon2, 2) + Math.pow(lat1 - lat2, 2));
            if (distance < threshold) {
                return [lon1, lat1];
            }
        }
    }
    return null;
}

function placeMarkerAndZoom(coordinates, addressText) {
    var [lon, lat] = coordinates;

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

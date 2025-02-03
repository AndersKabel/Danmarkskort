// Initialiser kortet
var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var currentMarker;
var currentLayerGroup = null; // Holder referencen til det nuværende aktive lag
var selectedLayerType = "none"; // Holder styr på det valgte lag

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

            data.forEach(item => {
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
    document.getElementById('address').innerHTML = 'Klik på kortet eller søg efter en adresse';
});

// Lag-håndtering
document.querySelectorAll('input[name="layer"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
        selectedLayerType = this.value;

        // Fjern det nuværende lag, hvis det eksisterer
        if (currentLayerGroup) {
            currentLayerGroup.eachLayer(function (layer) {
                map.removeLayer(layer);
            });
            currentLayerGroup.clearLayers();
            currentLayerGroup = null; // Nulstil laggruppen
        }

        // Hvis "Ingen lag" vælges, stop her
        if (selectedLayerType === "none") {
            return;
        }

        // Hent og vis det nye lag
        fetchPOIData(selectedLayerType);
    });
});


// Hent og vis POI-data
function fetchPOIData(poiType) {
    const bounds = map.getBounds();
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const [south, west, north, east] = [southWest.lat, southWest.lng, northEast.lat, northEast.lng];

    let queryType, queryValue;

    // Tilpas forespørgslen baseret på POI-type
    if (poiType === "supermarket") {
        queryType = "shop";
        queryValue = '["shop"~"supermarket|convenience|grocery"]'; // Flere butikstyper
    } else if (poiType === "fuel") {
        queryType = "amenity";
        queryValue = '["amenity"="fuel"]';
    } else if (poiType === "parking") {
        queryType = "amenity";
        queryValue = '["amenity"="parking"]';
    } else {
        return; // Hvis ingen gyldig type vælges, gør intet
    }

    // Byg URL til Overpass API
    const url = `https://overpass-api.de/api/interpreter?data=[out:json];node${queryValue}(${south},${west},${north},${east});out;`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            const layerGroup = L.layerGroup(); // Opretter en ny LayerGroup

            data.elements.forEach(poi => {
                let name = poi.tags.name || "Ukendt navn";
                let type = poi.tags.amenity || poi.tags.shop || "Ukendt type";
                let address = `${poi.tags["addr:street"] || ""} ${poi.tags["addr:housenumber"] || ""}, ${poi.tags["addr:postcode"] || ""} ${poi.tags["addr:city"] || ""}`.trim();
                let openingHours = poi.tags.opening_hours ? `Åbningstider: ${poi.tags.opening_hours}` : "";
                let phone = poi.tags.phone ? `📞 ${poi.tags.phone}` : "";
                let website = poi.tags.website ? `<a href="${poi.tags.website}" target="_blank">Besøg hjemmeside</a>` : "";

                let popupContent = `<strong>${name}</strong><br>
                                    ${type}<br>
                                    ${address ? address + "<br>" : ""}
                                    ${openingHours ? openingHours + "<br>" : ""}
                                    ${phone ? phone + "<br>" : ""}
                                    ${website}`;

                L.marker([poi.lat, poi.lon])
                    .addTo(layerGroup)
                    .bindPopup(popupContent);
            });

            // Tilføj det nye lag til kortet og gem referencen
            layerGroup.addTo(map);
            currentLayerGroup = layerGroup;
        })
        .catch(err => console.error('Fejl ved hentning af POI-data:', err));
}



// Opdater lag ved kortbevægelse eller zoom
map.on('moveend', function () {
    if (selectedLayerType !== "none") {
        if (currentLayerGroup) {
            currentLayerGroup.clearLayers();
            map.removeLayer(currentLayerGroup);
        }
        fetchPOIData(selectedLayerType);
    }
});

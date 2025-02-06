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

// Funktion til at opsætte autocomplete med postnummer-filter
function setupAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    const postcodeInput = document.getElementById('postcode'); // Postnummerfeltet

    input.addEventListener('input', function () {
        const query = input.value.trim();
        const postcode = postcodeInput.value.trim(); // Hent postnummer, hvis det er udfyldt

        if (query.length < 2) {
            suggestions.innerHTML = '';
            return;
        }

        // API-url med valgfrit postnummer
        const url = postcode
            ? `https://api.dataforsyningen.dk/vejstykker/autocomplete?q=${query}&postnr=${postcode}`
            : `https://api.dataforsyningen.dk/vejstykker/autocomplete?q=${query}`;

        // Hent forslag til vejnavne
        fetch(url)
            .then(response => response.json())
            .then(data => {
                suggestions.innerHTML = '';
                if (data.length === 0) {
                    const noResults = document.createElement('div');
                    noResults.textContent = 'Ingen resultater fundet';
                    noResults.style.color = 'red';
                    suggestions.appendChild(noResults);
                    return;
                }

                data.forEach(item => {
                    const suggestion = document.createElement('div');
                    suggestion.textContent = item.tekst;
                    suggestion.addEventListener('click', function () {
                        input.value = item.tekst; // Sæt værdien i input-feltet
                        suggestions.innerHTML = ''; // Ryd forslag
                    });
                    suggestions.appendChild(suggestion);
                });
            })
            .catch(err => console.error('Fejl i autocomplete:', err));
    });

    // Luk forslag, hvis brugeren klikker udenfor
    document.addEventListener('click', function (e) {
        if (!suggestions.contains(e.target) && e.target !== input) {
            suggestions.innerHTML = '';
        }
    });
}

// Opsæt autocomplete for begge krydsfelter
setupAutocomplete('road1', 'road1-suggestions');
setupAutocomplete('road2', 'road2-suggestions');


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

// Fjern evt. uønskede tooltips
document.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));

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
    if (poiType === "charging_station") {
        // OpenChargeMap API
        const url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=DK&maxresults=100&latitude=${map.getCenter().lat}&longitude=${map.getCenter().lng}&distance=50&distanceunit=KM&key=3c33b286-7067-426b-8e46-a727dd12f6f3`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const layerGroup = L.layerGroup();

                data.forEach(poi => {
                    let name = poi.AddressInfo.Title || "Ukendt ladestander";
                    let address = poi.AddressInfo.AddressLine1 || "Ukendt adresse";
                    let operator = poi.OperatorInfo?.Title || "Ukendt operatør";
                    let connections = poi.Connections.map(conn => conn.ConnectionType?.Title).join(", ") || "Ukendt stiktype";

                    let popupContent = `<strong>${name}</strong><br>
                                        Adresse: ${address}<br>
                                        Operatør: ${operator}<br>
                                        Stiktyper: ${connections}`;

                    L.marker([poi.AddressInfo.Latitude, poi.AddressInfo.Longitude])
                        .addTo(layerGroup)
                        .bindPopup(popupContent);
                });

                layerGroup.addTo(map);
                currentLayerGroup = layerGroup;
            })
            .catch(err => console.error('Fejl ved hentning af ladestander-data:', err));
    } else {
        // OSM API
        const bounds = map.getBounds();
        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const [south, west, north, east] = [southWest.lat, southWest.lng, northEast.lat, northEast.lng];

        let queryType, queryValue;

        if (poiType === "supermarket") {
            queryType = "shop";
            queryValue = '["shop"~"supermarket|convenience|grocery"]';
        } else if (poiType === "fuel") {
            queryType = "amenity";
            queryValue = '["amenity"="fuel"]';
        } else if (poiType === "parking") {
            queryType = "amenity";
            queryValue = '["amenity"="parking"]';
        } else {
            return;
        }

        const url = `https://overpass-api.de/api/interpreter?data=[out:json];node${queryValue}(${south},${west},${north},${east});out;`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const layerGroup = L.layerGroup();

                data.elements.forEach(poi => {
                    let name = poi.tags.name || "Ukendt navn";
                    let type = poi.tags.amenity || poi.tags.shop || "Ukendt type";
                    let address = `${poi.tags["addr:street"] || ""} ${poi.tags["addr:housenumber"] || ""}, ${poi.tags["addr:postcode"] || ""} ${poi.tags["addr:city"] || ""}`.trim();

                    let popupContent = `<strong>${name}</strong><br>
                                        ${type}<br>
                                        ${address}`;

                    L.marker([poi.lat, poi.lon])
                        .addTo(layerGroup)
                        .bindPopup(popupContent);
                });

                layerGroup.addTo(map);
                currentLayerGroup = layerGroup;
            })
            .catch(err => console.error('Fejl ved hentning af OSM-data:', err));
    }
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
// Funktion til at finde kryds mellem to veje
document.getElementById('findIntersection').addEventListener('click', function () {
    const road1 = document.getElementById('road1').value.trim();
    const road2 = document.getElementById('road2').value.trim();

    if (!road1 || !road2) {
        alert("Indtast venligst begge vejnavne.");
        return;
    }

    fetch(`https://api.dataforsyningen.dk/vejstykker?navn=${road1}`)
        .then(res => res.json())
        .then(data1 => {
            if (data1.length === 0) {
                alert(`Vejnavn '${road1}' blev ikke fundet.`);
                return;
            }

            fetch(`https://api.dataforsyningen.dk/vejstykker?navn=${road2}`)
                .then(res => res.json())
                .then(data2 => {
                    if (data2.length === 0) {
                        alert(`Vejnavn '${road2}' blev ikke fundet.`);
                        return;
                    }

                    const intersections = findIntersections(data1, data2);

                    if (intersections.length > 0) {
                        const [lon, lat] = intersections[0];
                        placeMarkerAndZoom([lon, lat], `Kryds mellem ${road1} og ${road2}`);
                    } else {
                        alert("Ingen kryds fundet mellem de to veje.");
                    }
                });
        });
});

// Funktion til at finde kryds mellem to sæt vejforløb
function findIntersections(road1Data, road2Data) {
    const road1Coordinates = road1Data.flatMap(road => road.geometri?.coordinates || []);
    const road2Coordinates = road2Data.flatMap(road => road.geometri?.coordinates || []);

    const intersections = [];

    road1Coordinates.forEach(coord1 => {
        road2Coordinates.forEach(coord2 => {
            if (Math.abs(coord1[0] - coord2[0]) < 0.0001 && Math.abs(coord1[1] - coord2[1]) < 0.0001) {
                intersections.push(coord1); // Tilføj koordinat, hvis de er tæt på hinanden
            }
        });
    });

    return intersections;
}

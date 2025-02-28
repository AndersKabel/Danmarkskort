// Definer koordinatsystem EPSG:25832
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
function convertToWGS84(x, y) {
    return proj4("EPSG:25832", "EPSG:4326", [x, y]);
}

// Initialiser kortet – deaktiver standard zoom-knapper
var map = L.map('map', {
    center: [56, 10],
    zoom: 7,
    zoomControl: false
});

var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
    }
).addTo(map);

var baseMaps = { "OpenStreetMap": osmLayer };
L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Marker ved klik på kort
var currentMarker;
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
            console.log("Reverse geocoding resultat:", data);

            const streetviewLink = document.getElementById("streetviewLink");
            const chosenAddress  = document.getElementById("chosenAddress");
            const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, `
                             + `${data.postnr || "?"} ${data.postnrnavn || ""}`;

            streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
            chosenAddress.textContent = adresseStr;
            document.getElementById("infoBox").style.display = "block";
        })
        .catch(err => {
            console.error("Fejl ved reverse geocoding:", err);
        });
});

// Variabler til søgefelt + lister
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Array til piletaster i #search
var items = [];
var currentIndex = -1;

// Søgefelt #search => vis/skjul kryds, min. 2 bogstaver
searchInput.addEventListener("input", function() {
    const txt = searchInput.value.trim();
    if (txt.length < 2) {
        clearBtn.style.display = "none";
        resultsList.innerHTML = "";
        return;
    }
    clearBtn.style.display = "inline";
    doAutocomplete(txt, resultsList);
});

// Piletaster i søgefelt (op/ned/enter)
searchInput.addEventListener("keydown", function(e) {
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        currentIndex = (currentIndex + 1) % items.length;
        highlightItem();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        currentIndex = (currentIndex + items.length - 1) % items.length;
        highlightItem();
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (currentIndex >= 0) {
            items[currentIndex].click();
        }
    }
});

// Hjælpefunktion => highlight
function highlightItem() {
    items.forEach(li => li.classList.remove("highlight"));
    if (currentIndex >= 0 && currentIndex < items.length) {
        items[currentIndex].classList.add("highlight");
    }
}

// Klik på kryds => ryd
clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    resultsList.innerHTML = "";
    clearBtn.style.display = "none";
    document.getElementById("infoBox").style.display = "none";
});

// "Første vejnavn" => min. 2 bogstaver
vej1Input.addEventListener("input", function() {
    const txt = vej1Input.value.trim();
    if (txt.length < 2) {
        vej1List.innerHTML = "";
        return;
    }
    doAutocomplete(txt, vej1List);
});

// "Andet vejnavn" => min. 2 bogstaver
vej2Input.addEventListener("input", function() {
    const txt = vej2Input.value.trim();
    if (txt.length < 2) {
        vej2List.innerHTML = "";
        return;
    }
    doAutocomplete(txt, vej2List);
});

// Autocomplete => Dataforsyningen
function doAutocomplete(query, listElement) {
    fetch("https://api.dataforsyningen.dk/adresser/autocomplete?q=" + encodeURIComponent(query))
        .then(resp => resp.json())
        .then(data => {
            listElement.innerHTML = "";
            console.log("Auto data for '" + query + "':", data);

            // Nulstil piletaster, hvis det er #search
            if (listElement === resultsList) {
                items = [];
                currentIndex = -1;
            }

            data.forEach(item => {
                let li = document.createElement("li");
                li.textContent = item.tekst;

                // Klik => vælg
                li.addEventListener("click", () => {
                    selectAddress(item, listElement);
                });

                listElement.appendChild(li);

                // Hvis #search => gem i items
                if (listElement === resultsList) {
                    items.push(li);
                }
            });
        })
        .catch(err => console.error("Fejl i autocomplete:", err));
}

// Vælg adresse => sæt input, zoom, StreetView
console.log(item) // Viser hvilke felter der er tilgængelige
function selectAddress(item, listElement) {
    // Sæt inputfeltets værdi afhængigt af hvilken liste vi kommer fra
    if (listElement === resultsList) {
        searchInput.value = item.tekst;
    } else if (listElement === vej1List) {
        vej1Input.value = item.tekst;
    } else if (listElement === vej2List) {
        vej2Input.value = item.tekst;
    }
    listElement.innerHTML = "";

    // Tjek, om vi har koordinater direkte
    if (item.adresse && item.adresse.x && item.adresse.y) {
        // Brug koordinater fra item.adresse
        placeMarkerAndZoomFromCoords(item.adresse.x, item.adresse.y, item.tekst);
        showStreetViewLinkFromCoords(item.adresse.x, item.adresse.y);
    } else if (item.adgangsadresse && item.adgangsadresse.id) {
        // Fallback: Lav et ekstra fetch til adgangsadresser/{id}
        fetch(`https://api.dataforsyningen.dk/adgangsadresser/${item.adgangsadresse.id}`)
            .then(res => res.json())
            .then(addressData => {
                // Forvent, at addressData.adgangspunkt.koordinater indeholder [lon, lat]
                var coords = addressData.adgangspunkt.koordinater;
                // Koordinaterne kommer som [lon, lat], vi skal have dem i Leaflet-format [lat, lon]
                placeMarkerAndZoomFromCoords(coords[0], coords[1], item.tekst);
                showStreetViewLinkFromCoords(coords[0], coords[1]);
            })
            .catch(err => console.error("Fejl ved hentning af detaljerede koordinater:", err));
    } else {
        console.error("Ingen koordinater tilgængelige for valgt adresse");
    }
}

function placeMarkerAndZoomFromCoords(x, y, addressText) {
    // Hvis vi modtager fra DAR, skal vi konvertere fra EPSG:25832 til EPSG:4326
    // Hvis x og y er fra item.adresse, forventes de at være i EPSG:25832
    let coords = convertToWGS84(x, y);
    let lat = coords[1];
    let lon = coords[0];

    map.setView([lat, lon], 17);
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);
    // Opdater eventuelt adressevisningen
    document.getElementById('address').innerHTML = `
        Valgt adresse: ${addressText}
        <br>
        <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">
            Åbn i Google Street View
        </a>
    `;
}

function showStreetViewLinkFromCoords(x, y) {
    let coords = convertToWGS84(x, y);
    let lat = coords[1];
    let lon = coords[0];
    const streetviewLink = document.getElementById("streetviewLink");
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    document.getElementById("infoBox").style.display = "block";
}

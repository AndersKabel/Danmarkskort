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

// Vælg adresse => sæt input, => KUN fallback (Plan B)
function selectAddress(item, listElement) {
    console.log("Valgt item:", item);

    // Sæt inputfeltets værdi afhængigt af hvilken liste vi kommer fra
    if (listElement === resultsList) {
        searchInput.value = item.tekst;
    } else if (listElement === vej1List) {
        vej1Input.value = item.tekst;
    } else if (listElement === vej2List) {
        vej2Input.value = item.tekst;
    }
    listElement.innerHTML = "";

    // Glem alt om item.adresse.x,y
    // => Kald "adgangsadresser/{id}" for at få [lon, lat]
    if (item.adgangsadresse && item.adgangsadresse.id) {
        fetch(`https://api.dataforsyningen.dk/adgangsadresser/${item.adgangsadresse.id}`)
            .then(res => res.json())
            .then(addressData => {
                // addressData.adgangspunkt.koordinater => [lon, lat]
                let coords = addressData.adgangspunkt.koordinater;
                placeMarkerAndZoomFromCoords(coords[0], coords[1], item.tekst);
            })
            .catch(err => console.error("Fejl ved hentning af detaljerede koordinater:", err));
    } else {
        console.error("Ingen 'adgangsadresse.id' i item => kan ikke slå op på /adgangsadresser/{id}");
    }
}

function placeMarkerAndZoomFromCoords(lon, lat, addressText) {
    // Koordinaterne kommer som [lon, lat] i EPSG:4326
    // Men hvis "adgangspunkt.koordinater" er i ETRS89 (25832), skal du tjekke Data
    //  => Dataforsyningen siger dog: /adgangsadresser/{id} giver [lon, lat] i WGS84
    // Du kan evt. konvertere, hvis de er i ETRS89. Tjek i console

    // For nu antager vi, at [lon, lat] er WGS84
    map.setView([lat, lon], 17);
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Evt. vis info
    document.getElementById('chosenAddress').textContent = addressText;
    const streetviewLink = document.getElementById("streetviewLink");
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    document.getElementById("infoBox").style.display = "block";
}

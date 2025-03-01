// EPSG:25832 opsætning
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
function convertToWGS84(x, y) {
    return proj4("EPSG:25832", "EPSG:4326", [x, y]);
}

// Opret Leaflet-kort (ingen standard zoom-knapper)
var map = L.map('map', {
    center: [56, 10],
    zoom: 7,
    zoomControl: false
});

// OSM-lag
var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
    }
).addTo(map);

// Lag-kontrol
var baseMaps = { "OpenStreetMap": osmLayer };
L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Klik på kort => Reverse geocoding
var currentMarker;
map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Reverse geocoding via /adgangsadresser/reverse
    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(r => r.json())
        .then(data => {
            console.log("Reverse geocoding:", data);

            let streetviewLink = document.getElementById("streetviewLink");
            let chosenAddress  = document.getElementById("chosenAddress");

            let adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, `
                           + `${data.postnr || "?"} ${data.postnrnavn || ""}`;
            streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
            chosenAddress.textContent = adresseStr;
            document.getElementById("infoBox").style.display = "block";
        })
        .catch(err => console.error("Reverse geocoding fejl:", err));
});

// Variabler til søgefelt + lister
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Piletaster
var items = [];
var currentIndex = -1;

// Søg i #search => min 2 tegn
searchInput.addEventListener("input", function() {
    const txt = searchInput.value.trim();
    if (txt.length < 2) {
        clearBtn.style.display = "none";
        resultsList.innerHTML = "";
        return;
    }
    clearBtn.style.display = "inline";
    doSearch(txt, resultsList);
});

// Piletaster i #search
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

// "Første vejnavn"
vej1Input.addEventListener("input", function() {
    const txt = vej1Input.value.trim();
    if (txt.length < 2) {
        vej1List.innerHTML = "";
        return;
    }
    doSearch(txt, vej1List);
});

// "Andet vejnavn"
vej2Input.addEventListener("input", function() {
    const txt = vej2Input.value.trim();
    if (txt.length < 2) {
        vej2List.innerHTML = "";
        return;
    }
    doSearch(txt, vej2List);
});

// ============== Søg i addresses + stednavne (Plan B) =============
// 1) Hent addresses via "adgangsadresser/autocomplete"
// 2) Hent stednavne via Datafordeleren
// 3) Kombiner resultater, vis i liste
function doSearch(query, listElement) {
    // Hent addresses
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    // Hent stednavne
    // Bemærk, at du skrev i din gamle kode:
    // "https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?stednavn=..."
    // Forudsætter "adgang: åben"
    let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?stednavn=${encodeURIComponent(query + '*')}&username=BRUGERNAVN&password=PASSWORD`;

    // Promise.all => fetch begge
    Promise.all([
        fetch(addrUrl).then(r => r.json()),
        fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; })
    ])
    .then(([addrData, stedData]) => {
        listElement.innerHTML = "";
        console.log("Addresses:", addrData);
        console.log("Stednavne:", stedData);

        // Ryd piletaster, hvis #search
        if (listElement === resultsList) {
            items = [];
            currentIndex = -1;
        }

        // Omdan addresses => { type: "adresse", item: ... } + "adgangsadresse"
        let addrResults = (addrData || []).map(item => {
            return {
                type: "adresse",
                tekst: item.tekst,
                adgangsadresse: item.adgangsadresse // { id: "..." }
            };
        });

        // Omdan stednavne => { type: "stednavn", navn: ..., bbox: ... }
        let stedResults = [];
        if (stedData && stedData.features) {
            stedData.features.forEach(feature => {
                if (feature.properties && feature.properties.stednavneliste) {
                    feature.properties.stednavneliste.forEach(sted => {
                        stedResults.push({
                            type: "stednavn",
                            navn: sted.navn,
                            bbox: feature.bbox || null
                        });
                    });
                }
            });
        }

        // Kombiner i én liste
        let combined = [...addrResults, ...stedResults];

        // Fjern evt. dubletter i stednavne, etc. - i din gamle kode brugte du en Map
        // Her forenkler vi og viser alt.

        combined.forEach(obj => {
            let li = document.createElement("li");
            li.textContent = (obj.type === "adresse") ? obj.tekst : obj.navn;

            li.addEventListener("click", function() {
                if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
                    // Plan B => fetch /adgangsadresser/{id}
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
                        .then(r => r.json())
                        .then(addressData => {
                            let [lon, lat] = addressData.adgangspunkt.koordinater; 
                            placeMarkerAndZoom([lon, lat], obj.tekst);
                        })
                        .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
                } else if (obj.type === "stednavn" && obj.bbox) {
                    // Stednavn => brug bbox
                    // typisk [west, south, east, north], men i din gamle kode
                    // brugte du [lon, lat] = [bbox[0], bbox[1]]
                    let [lon, lat] = [obj.bbox[0], obj.bbox[1]];
                    placeMarkerAndZoom([lon, lat], obj.navn);
                }
            });

            listElement.appendChild(li);
            if (listElement === resultsList) {
                items.push(li);
            }
        });
    })
    .catch(err => console.error("Fejl i doSearch:", err));
}

// placeMarkerAndZoom => Zoom + marker
function placeMarkerAndZoom([lon, lat], displayText) {
    // Ifølge doc: /adgangsadresser/{id} => adgangspunkt.koordinater = [lon, lat] i ETRS89?
    // Du kan evt. checke console. Hvis i ETRS89 => convertToWGS84
    // Her antager vi [lon, lat] i WGS84. 
    // Tjek i console => hvis lat ~ 55..57, lon ~ 8..12, er det WGS84

    map.setView([lat, lon], 16);
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Opdater info
    document.getElementById("chosenAddress").textContent = displayText;
    const streetviewLink = document.getElementById("streetviewLink");
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
    let result = proj4("EPSG:25832", "EPSG:4326", [y, x]); // Bytter x og y
    console.log("convertToWGS84 input:", x, y, "=> output:", result);
    return [result[1], result[0]]; // Returnerer lat, lon i korrekt rækkefølge
}

/***************************************************
 * Leaflet-kort
 ***************************************************/
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

L.control.layers({ "OpenStreetMap": osmLayer }, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Klik på kort => /adgangsadresser/reverse
 ***************************************************/
map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

checkForStatsvej(lat, lon);
    
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(r => r.json())
        .then(data => {
            updateInfoBox(data, lat, lon);
        })
        .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * Opdatering af info boks
 ***************************************************/
function updateInfoBox(data, lat, lon) {
    const streetviewLink = document.getElementById("streetviewLink");
    const addressEl = document.getElementById("address");
    const extraInfoEl = document.getElementById("extra-info");
    const skråfotoLink = document.getElementById("skraafotoLink"); // Hent link-elementet
    const resultsList = document.getElementById("results");
    const vej1List = document.getElementById("results-vej1");
    const vej2List = document.getElementById("results-vej2");

    const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
    const ekstraInfoStr = `Kommunekode: ${data.kommunekode || "?"} | Vejkode: ${data.vejkode || "?"}`;
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    addressEl.textContent = adresseStr;
    if (extraInfoEl) {
    extraInfoEl.textContent = ekstraInfoStr;
    // Opdater Skråfoto-linket
    let eastNorth = convertToWGS84(lat, lon);
    skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
    skråfotoLink.style.display = "block"; // Vis linket
}
    
    // Tjek om elementerne eksisterer, før du prøver at ændre dem
    if (resultsList) resultsList.innerHTML = "";
    if (vej1List) vej1List.innerHTML = "";
    if (vej2List) vej2List.innerHTML = "";

    checkForStatsvej(lat, lon);

    document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * Søgefelter, lister
 ***************************************************/
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Funktion til at oprette clear-knap og tilføje den til et inputfelt
function addClearButton(inputElement, listElement) {
    let clearBtn = document.createElement("span");
    clearBtn.innerHTML = "&times;";
    clearBtn.classList.add("clear-button");
    inputElement.parentElement.appendChild(clearBtn);

    // Vis/skjul clear-knappen baseret på input
    inputElement.addEventListener("input", function () {
        clearBtn.style.display = inputElement.value.length > 0 ? "inline" : "none";
    });

    // Klik på clear-knappen rydder feltet
    clearBtn.addEventListener("click", function () {
        inputElement.value = "";
        listElement.innerHTML = "";
        clearBtn.style.display = "none";
    });

    // Backspace i tomt felt rydder resultater
    inputElement.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && inputElement.value.length === 0) {
            listElement.innerHTML = "";
        }
    });

    // Skjul clear-knappen initialt
    clearBtn.style.display = "none";
}

// Tilføj clear-knapper og funktioner til begge vejnavn-inputfelter
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

// Piletaster i #search
var items = [];
var currentIndex = -1;

/***************************************************
 * #search => doSearch
 ***************************************************/
searchInput.addEventListener("input", function() {
    const txt = searchInput.value.trim();
    if (txt.length < 2) {
        clearBtn.style.display = "none";
        resultsList.innerHTML = "";
        document.getElementById("infoBox").style.display = "none"; // Infoboksen skjules, når brugeren begynder at slette 
        return;
    }
    clearBtn.style.display = "inline";
    doSearch(txt, resultsList);
});

searchInput.addEventListener("keydown", function(e) {
    if (e.key === "Backspace") {
        document.getElementById("infoBox").style.display = "none"; // Skjul info-boksen med det samme
    }
});

vej1Input.addEventListener("keydown", function(e) {
    if (e.key === "Backspace") {
        document.getElementById("infoBox").style.display = "none"; // Skjul info-boksen ved backspace i vej1
    }
});

vej2Input.addEventListener("keydown", function() {
    document.getElementById("infoBox").style.display = "none"; // Skjul info-boksen ved tastetryk i vej2
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

/***************************************************
 * Klik på kryds => ryd
 ***************************************************/
clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    resultsList.innerHTML = "";
    clearBtn.style.display = "none";
    document.getElementById("infoBox").style.display = "none";
});

// Funktion til at nulstille info-boksen
function resetInfoBox() {
    document.getElementById("extra-info").textContent = "";
    document.getElementById("skraafotoLink").style.display = "none";
}

// Tilføj nulstilling, når brugeren rydder søgefeltet
searchInput.addEventListener("keydown", function(e) {
    if (e.key === "Backspace" && searchInput.value.length === 0) {
        resetInfoBox();
    }
});

clearBtn.addEventListener("click", function() {
    resetInfoBox();
});

vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
    vej1Input.value = "";
    vej1List.innerHTML = "";
    document.getElementById("infoBox").style.display = "none"; // Skjul info-boksen når vej1 ryddes
});

vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
    vej2Input.value = "";
    vej2List.innerHTML = "";
    document.getElementById("infoBox").style.display = "none"; // Skjul info-boksen når vej2 ryddes
});

/***************************************************
 * vej1 => doSearch
 ***************************************************/
vej1Input.addEventListener("input", function() {
    const txt = vej1Input.value.trim();
    if (txt.length < 2) {
        vej1List.innerHTML = "";
        vej1List.style.display = "none";
        return;
    }
    doSearchRoad(txt, vej1List, vej1Input);
});

/***************************************************
 * vej2 => doSearch
 ***************************************************/
vej2Input.addEventListener("input", function() {
    const txt = vej2Input.value.trim();
    if (txt.length < 2) {
        vej2List.innerHTML = "";
        vej2List.style.display = "none";
        return;
    }
    doSearchRoad(txt, vej2List, vej2Input);
});

/***************************************************
 * doSearch => henter addresses + stednavne
 * "Plan B" for addresses: /adgangsadresser/autocomplete => /adgangsadresser/{id}
 ***************************************************/
function doSearch(query, listElement) {
    // Adgangsadresser
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    // Stednavne (brugernavn/password i URL)
    let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?username=NUKALQTAFO&password=Fw62huch!&stednavn=${encodeURIComponent(query + '*')}`;

    Promise.all([
        fetch(addrUrl).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
        fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; })
    ])
    .then(([addrData, stedData]) => {
        console.log("addrData:", addrData);
        console.log("stedData:", stedData);
        listElement.innerHTML = "";
        
// Ryd items-arrayet hver gang en ny søgning starter
        items = [];
        currentIndex = -1;
        
        // Ryd piletaster hvis #search
        if (listElement === resultsList) {
            items = [];
            currentIndex = -1;
        }

        // Omdan addresses => { type: "adresse", tekst, adgangsadresse:{id} }
        let addrResults = (addrData || []).map(item => {
            return {
                type: "adresse",
                tekst: item.tekst,
                adgangsadresse: item.adgangsadresse // { id: "..." }
            };
        });

        // Omdan stednavne => { type: "stednavn", navn, bbox }
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

        // Kombiner
        let combined = [...addrResults, ...stedResults];

        combined.forEach(obj => {
            let li = document.createElement("li");
            li.textContent = (obj.type === "adresse") ? obj.tekst : obj.navn;

            li.addEventListener("click", function() {
                if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
                    // => fetch /adgangsadresser/{id}
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
                        .then(r => r.json())
                        .then(addressData => {
                            let [lon, lat] = addressData.adgangspunkt.koordinater; // Brug direkte WGS84
                            console.log("Endelige koordinater til placering:", lat, lon);
                            console.log("Kald til placeMarkerAndZoom med:", lat, lon, obj.tekst); // => Kald placeMarkerAndZoom med [lat, lon] (y først, x sidst)
                            placeMarkerAndZoom([lat, lon], obj.tekst);
                            // updateInfoBox(addressData, lat, lon); //
                            
                           // 🔽 Tilføj denne del for at rydde søgeresultaterne 🔽
                           resultsList.innerHTML = "";
                           vej1List.innerHTML = "";
                           vej2List.innerHTML = "";    
                        })
                        .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
                }
                else if (obj.type === "stednavn" && obj.bbox) {
                    // bbox => [x, y], men vi vil have [y, x]
                    console.log("BBOX før konvertering:", obj.bbox);
                    let [x, y] = [obj.bbox[0], obj.bbox[1]];
                    placeMarkerAndZoom([y, x], obj.navn);
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

/***************************************************
 * vej1 og vej2 => autocomplete (vejnavn + kommune)
 ***************************************************/
function doSearchRoad(query, listElement, inputField) {
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    fetch(addrUrl)
        .then(response => response.json())
        .then(data => {
            listElement.innerHTML = ""; // Ryd tidligere resultater
            items = [];
            currentIndex = -1;

            // Sorter resultaterne alfabetisk
            data.sort((a, b) => a.tekst.localeCompare(b.tekst));

            data.forEach(item => {
                let vejnavn = item.adgangsadresse?.vejnavn || "Ukendt vej";
                let kommune = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
                let postnr = item.adgangsadresse?.postnr || "?"; // Henter postnummeret

                let li = document.createElement("li");
                li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

                li.addEventListener("click", function() {
                    inputField.value = vejnavn;
                    listElement.innerHTML = ""; // Ryd listen efter valg
                    listElement.style.display = "none"; // Skjul listen efter valg
                });

                listElement.appendChild(li);
                items.push(li);
            });

            // Sørg for, at listen vises, når der er resultater
            listElement.style.display = data.length > 0 ? "block" : "none";
        })
        .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * placeMarkerAndZoom => Zoom + marker
 * param: [lat, lon] (y først, x sidst)
 ***************************************************/
function placeMarkerAndZoom([lat, lon], displayText) {
    console.log("placeMarkerAndZoom kaldt med:", lat, lon, displayText);
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 16);

    document.getElementById("address").textContent = displayText;
    const streetviewLink = document.getElementById("streetviewLink");
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    console.log("HTML-elementer:", document.getElementById("address"), document.getElementById("streetviewLink"), document.getElementById("infoBox"));
    document.getElementById("infoBox").style.display = "block";
}

function checkForStatsvej(lat, lon) {
    let buffer = 25;
    let bbox = `${lon - buffer},${lat - buffer},${lon + buffer},${lat + buffer}`;

    let url = `https://geocloud.vd.dk/CVF/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&FORMAT=application/json&TRANSPARENT=true&LAYERS=CVF:veje&QUERY_LAYERS=CVF:veje&SRS=EPSG:25832&WIDTH=101&HEIGHT=101&BBOX=${bbox}&x=50&y=50`;

    console.log("Kalder statsvej API med URL:", url);

    fetch(url)
    .then(response => response.json())
    .then(data => {
        if (data.features && data.features.length > 0) {
            let roadData = data.features[0].properties;
            let infoText = `
                <strong>Betegnelse:</strong> ${roadData.BETEGNELSE || "Ukendt"}<br>
                <strong>Bestyrer:</strong> ${roadData.BESTYRER || "Ukendt"}<br>
                <strong>Beskrivelse:</strong> ${roadData.BESKRIVELSE || "Ingen beskrivelse"}<br>
                <strong>Fra km:</strong> ${roadData.FRAKMT || "-"}<br>
                <strong>Til km:</strong> ${roadData.TILKMT || "-"}<br>
                <strong>Vejtype:</strong> ${roadData.VEJTYPE || "Ukendt"}
            `;
            document.getElementById("statsvejInfo").innerHTML = infoText;
            document.getElementById("statsvejInfoBox").style.display = "block";
        } else {
            document.getElementById("statsvejInfo").textContent = "Ikke statsvej";
            document.getElementById("statsvejInfoBox").style.display = "block";
        }
    })
    .catch(err => {
        console.error("Fejl ved hentning af statsvejsdata:", err);
        document.getElementById("statsvejInfo").textContent = "Ikke statsvej";
        document.getElementById("statsvejInfoBox").style.display = "block";
    });
}

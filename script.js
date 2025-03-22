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

// (A) WMS-lag for Redningsnummer via geoserver
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",      // ifølge <Name> i WMS-laget
  format: "image/png",
  transparent: true,
  version: "1.3.0",              // serveren rapporterer version="1.3.0"
  attribution: "Data: redningsnummer.dk"
});

// OpenStreetMap-lag
var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
    }
).addTo(map);

// Opret base-lag (baggrundskort)
const baseMaps = {
  "OpenStreetMap": osmLayer
};

// Opret overlay-lag (punkter)
const overlayMaps = {
  "Strandposter": redningsnrLayer
};

// Tilføj lagvælgeren
L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

// (A) Kommunedata hentet fra "Kommuner.xlsx"
const kommuneInfo = {
    "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
    "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
    "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Klik på kort => reverse geocoding
 ***************************************************/
map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Opdater koordinatboksen med de klik-koordinerede
    document.getElementById("coordinateBox").textContent = `Koordinater: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    document.getElementById("coordinateBox").style.display = "block";

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
async function updateInfoBox(data, lat, lon) {
    const streetviewLink = document.getElementById("streetviewLink");
    const addressEl = document.getElementById("address");
    const extraInfoEl = document.getElementById("extra-info");
    const skråfotoLink = document.getElementById("skraafotoLink"); 
    
    const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
    const ekstraInfoStr = `Kommunekode: ${data.kommunekode || "?"} | Vejkode: ${data.vejkode || "?"}`;

    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    addressEl.textContent = adresseStr;
    
    if (extraInfoEl) {
        extraInfoEl.textContent = ekstraInfoStr;
    }

    // Opdater Skråfoto-linket
    let eastNorth = convertToWGS84(lat, lon); 
    skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
    skråfotoLink.style.display = "block"; // Vis linket

    // Ryd tidligere søgeresultater
    if (resultsList) resultsList.innerHTML = "";
    if (vej1List) vej1List.innerHTML = "";
    if (vej2List) vej2List.innerHTML = "";

    // Vent på statsvejsdata
    let statsvejData = await checkForStatsvej(lat, lon);
    const statsvejInfoEl = document.getElementById("statsvejInfo");

    if (statsvejData) {
        statsvejInfoEl.innerHTML = `
          <strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
          <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
          <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
          <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
          <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}
        `;
        document.getElementById("statsvejInfoBox").style.display = "block";
    } else {
        statsvejInfoEl.innerHTML = "";
        document.getElementById("statsvejInfoBox").style.display = "none";
    }

    document.getElementById("infoBox").style.display = "block";

    if (data.kommunekode) {
        try {
            let komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
            let komResp = await fetch(komUrl);
            if (komResp.ok) {
                let komData = await komResp.json();
                let kommunenavn = komData.navn || "";
                if (extraInfoEl) {
                   // extraInfoEl.textContent += ` | Kommune: ${kommunenavn}`;
                }

                // Slå kommunenavn op i "kommuneInfo"
                if (kommunenavn && kommuneInfo[kommunenavn]) {
                    let info = kommuneInfo[kommunenavn]; 
                    let doedeDyr = info["Døde dyr"];
                    let gaderVeje = info["Gader og veje"];
                    extraInfoEl.innerHTML += `<br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
                }
            }
        } catch (e) {
            console.error("Kunne ikke hente kommuneinfo:", e);
        }
    }
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

// Tilføj clear-knap til input
function addClearButton(inputElement, listElement) {
    let clearBtn = document.createElement("span");
    clearBtn.innerHTML = "&times;";
    clearBtn.classList.add("clear-button");
    inputElement.parentElement.appendChild(clearBtn);

    inputElement.addEventListener("input", function () {
        clearBtn.style.display = inputElement.value.length > 0 ? "inline" : "none";
    });

    clearBtn.addEventListener("click", function () {
        inputElement.value = "";
        listElement.innerHTML = "";
        clearBtn.style.display = "none";
    });

    inputElement.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && inputElement.value.length === 0) {
            listElement.innerHTML = "";
        }
    });

    clearBtn.style.display = "none";
}

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
        document.getElementById("infoBox").style.display = "none"; 
        return;
    }
    clearBtn.style.display = "inline";
    doSearch(txt, resultsList);
    
    // Tjek om brugeren har tastet koordinater i formatet "lat,lon"
    const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
    if (coordRegex.test(txt)) {
        const match = txt.match(coordRegex);
        const latNum = parseFloat(match[1]);
        const lonNum = parseFloat(match[2]);
        // Reverse geocoding
        fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`)
            .then(r => r.json())
            .then(data => {
                resultsList.innerHTML = "";
                placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
                updateInfoBox(data, latNum, lonNum);
            })
            .catch(err => console.error("Reverse geocoding fejl (koord-søgning):", err));
        return; 
    }
});

searchInput.addEventListener("keydown", function(e) {
    if (e.key === "Backspace") {
        document.getElementById("infoBox").style.display = "none";
        document.getElementById("coordinateBox").style.display = "none";
    }
});

vej1Input.addEventListener("keydown", function(e) {
    if (e.key === "Backspace") {
        document.getElementById("infoBox").style.display = "none";
    }
});

vej2Input.addEventListener("keydown", function() {
    document.getElementById("infoBox").style.display = "none";
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
    document.getElementById("statsvejInfoBox").style.display = "none";
    document.getElementById("coordinateBox").style.display = "none";
});

function resetInfoBox() {
    document.getElementById("extra-info").textContent = "";
    document.getElementById("skraafotoLink").style.display = "none";
}

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
    document.getElementById("infoBox").style.display = "none";
});

vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
    vej2Input.value = "";
    vej2List.innerHTML = "";
    document.getElementById("infoBox").style.display = "none";
});

/***************************************************
 * Globale variabler til at gemme valgte veje
 ***************************************************/
var selectedRoad1 = null;
var selectedRoad2 = null;

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
 * doSearch => henter addresses + stednavne + STRANDPOSTER
 ***************************************************/

// 1) Ekstra function: søg i Geoserver WFS på redningsnummer-laget
function doSearchStrandposter(query) {
    // For demonstration antager vi en kolonne "redningsnr" til LIKE-søgning
    // Hvis feltet hedder noget andet, ret "redningsnr" -> "indsæt felt"
    let cql = `UPPER(redningsnr) LIKE UPPER('%${query}%')`;

    // typeName => justeres hvis du vil søge Parkeringsplads, Kystlivredder, ...
    let wfsUrl = `https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS`+
                 `&version=1.1.0`+
                 `&request=GetFeature`+
                 `&typeName=nobc:Redningsnummer`+  // skift om du vil søge i andet lag
                 `&outputFormat=application/json`+
                 `&cql_filter=${encodeURIComponent(cql)}`;

    console.log("Strandposter WFS URL:", wfsUrl);
    return fetch(wfsUrl)
      .then(resp => resp.json())
      .then(geojson => {
         let arr = [];
         if (geojson.features) {
           geojson.features.forEach(feature => {
             let props = feature.properties;
             let rn = props.redningsnr; // kolonnen
             let tekst = `Redningsnummer: ${rn}`; // Vis tekst
             // Koordinater, antaget Point-lag => [lon, lat]
             let coords = feature.geometry.coordinates;
             let lon = coords[0];
             let lat = coords[1];

             arr.push({
               type: "strandpost", 
               tekst: tekst,
               lat: lat,
               lon: lon,
               feature: feature
             });
           });
         }
         return arr;
      })
      .catch(err => {
        console.error("Fejl i doSearchStrandposter:", err);
        return [];
      });
}

// 2) Den eksisterende doSearch, men med Promise.all der også kalder doSearchStrandposter
function doSearch(query, listElement) {
    // Adgangsadresser
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    // Stednavne fra Dataforsyningen
    // (Skifter fra Datafordeler til Dataforsyningen)
    // &fuzzy=true for at få stavningstolerance, &per_side=50 for flere resultater
    let stedUrl = `https://api.dataforsyningen.dk/stednavne?q=${encodeURIComponent(query)}&fuzzy=true&per_side=50`;

    // Nu includerer vi strandposter:
    let strandPromise = doSearchStrandposter(query);

    Promise.all([
        fetch(addrUrl).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
        fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return []; }),
        strandPromise
    ])
    .then(([addrData, stedData, strandData]) => {
        console.log("addrData:", addrData);
        console.log("stedData (fra Dataforsyningen):", stedData);
        console.log("strandData:", strandData);

        listElement.innerHTML = "";
        items = [];
        currentIndex = -1;

        // parse addresses => { type: "adresse", tekst, adgangsadresse}
        let addrResults = (addrData || []).map(item => {
            return {
                type: "adresse",
                tekst: item.tekst,
                adgangsadresse: item.adgangsadresse
            };
        });

        // parse stednavne => { type:"stednavn", navn, geom }
        // Dataforsyningen returnerer et array af objekter med fx "navn", "undertype", "geom_json"
        let stedResults = [];
        if (Array.isArray(stedData)) {
            stedData.forEach(stedItem => {
                stedResults.push({
                    type: "stednavn",
                    navn: stedItem.navn,
                    geom: stedItem.geom_json // Kun hvis du vil bruge geometrien senere
                });
            });
        }

        // strandData er allerede i array form
        // => { type:"strandpost", tekst, lat, lon, feature }
        let combined = [...addrResults, ...stedResults, ...strandData];

        combined.forEach(obj => {
            let li = document.createElement("li");
            // adressers obj.tekst = "vejnavn husnr, postnr by"
            // stednavn => "København"
            // strandpost => "Redningsnummer: A176"
            if (obj.type === "strandpost") {
                li.textContent = obj.tekst; 
            } else if (obj.type === "adresse") {
                li.textContent = obj.tekst;
            } else if (obj.type === "stednavn") {
                li.textContent = obj.navn;
            }

            li.addEventListener("click", function() {
                if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
                    // fetch /adgangsadresser/{id}
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
                      .then(r => r.json())
                      .then(addressData => {
                          let [lon, lat] = addressData.adgangspunkt.koordinater;
                          console.log("Placering:", lat, lon);
                          placeMarkerAndZoom([lat, lon], obj.tekst);
                          // Ryd lister
                          resultsList.innerHTML = "";
                          vej1List.innerHTML = "";
                          vej2List.innerHTML = "";
                      })
                      .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
                }
                else if (obj.type === "stednavn") {
                    // Vi har kun "navn" og "geom" i Dataforsyningen
                    // Ofte er "geom" en multipolygon, men hvis du blot vil zoome til noget,
                    // kan du her selv bestemme, hvad du gør. 
                    // Som minimum kan du bare skrive i "extra-info".
                    document.getElementById("extra-info").textContent = `Stednavn: ${obj.navn}`;
                    // Du kunne evt. udtrække center for "geom_json", men det kræver lidt logik.

                }
                else if (obj.type === "strandpost") {
                    // brug lat, lon
                    placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
                    // du kan fx vise "props" i infoboks
                    let props = obj.feature.properties;
                    let e = document.getElementById("extra-info");
                    e.textContent = `Flere data: Parkeringsplads: ${props.ppl} ...?`; 
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
 *    Ændret så vi kun får én linje per unikt (vejnavn, kommune)
 ***************************************************/
function doSearchRoad(query, listElement, inputField) {
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    fetch(addrUrl)
        .then(response => response.json())
        .then(data => {
            listElement.innerHTML = "";
            items = [];
            currentIndex = -1;

            data.sort((a, b) => a.tekst.localeCompare(b.tekst));

            // Opret et sæt til unikke kombinationer af (vejnavn, postnrnavn, postnr)
            let uniqueCombinations = new Set();

            data.forEach(item => {
                let vejnavn = item.adgangsadresse?.vejnavn || "Ukendt vej";
                let kommune = item.adgangsadresse?.postnrnavn || "Ukendt kommune"; // Egentlig bynavn
                let postnr  = item.adgangsadresse?.postnr || "?";
                let vejkode = item.adgangsadresse?.vejkode || "";
                let komkode = item.adgangsadresse?.kommunekode || "";

                // Unik nøgle for denne vej + 'kommune' + postnr
                let comboKey = `${vejnavn}||${kommune}||${postnr}`;

                // Kun hvis vi ikke har set den før, tilføjer vi den til listen
                if (!uniqueCombinations.has(comboKey)) {
                    uniqueCombinations.add(comboKey);

                    let li = document.createElement("li");
                    li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

                    // Klik => gem data i selectedRoad1 eller selectedRoad2
                    li.addEventListener("click", function() {
                        // Hvis det er vej1-listen
                        if (listElement.id === "results-vej1") {
                            selectedRoad1 = {
                                vejnavn: vejnavn,
                                kommune: kommune,
                                postnr:  postnr,
                                vejkode: vejkode,
                                kommunekode: komkode
                            };
                        } else {
                            // Ellers vej2-listen
                            selectedRoad2 = {
                                vejnavn: vejnavn,
                                kommune: kommune,
                                postnr:  postnr,
                                vejkode: vejkode,
                                kommunekode: komkode
                            };
                        }

                        inputField.value = vejnavn;
                        listElement.innerHTML = "";
                        listElement.style.display = "none";
                    });

                    listElement.appendChild(li);
                    items.push(li);
                }
            });

            listElement.style.display = uniqueCombinations.size > 0 ? "block" : "none";
        })
        .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * placeMarkerAndZoom
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
    console.log("HTML-elementer:", 
        document.getElementById("address"), 
        document.getElementById("streetviewLink"), 
        document.getElementById("infoBox")
    );
    document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej => henter statsvej
 ***************************************************/
async function checkForStatsvej(lat, lon) {
    console.log("Koordinater sendt til Geocloud:", lat, lon);
    let [utmX, utmY] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
    let buffer = 100;
    let bbox = `${utmX - buffer},${utmY - buffer},${utmX + buffer},${utmY + buffer}`;

    let url = `https://geocloud.vd.dk/CVF/wms?
SERVICE=WMS&
VERSION=1.1.1&
REQUEST=GetFeatureInfo&
INFO_FORMAT=application/json&
TRANSPARENT=true&
LAYERS=CVF:veje&
QUERY_LAYERS=CVF:veje&
SRS=EPSG:25832&
WIDTH=101&
HEIGHT=101&
BBOX=${bbox}&
X=50&
Y=50`;

    console.log("API-kald til Geocloud:", url);
    try {
        let response = await fetch(url);
        let textData = await response.text();
        console.log("Rå server response:", textData);

        if (textData.startsWith("Results")) {
            console.warn("Modtaget et tekstsvar, ikke JSON. Prøver at udtrække data...");
            let extractedData = parseTextResponse(textData);
            return extractedData;
        }

        let jsonData = JSON.parse(textData);
        console.log("JSON-parsed data:", jsonData);

        if (jsonData.features && jsonData.features.length > 0) {
            return jsonData.features[0].properties;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Fejl ved hentning af vejdata:", error);
        return null;
    }
}

// Funktion til at parse tekstsvar
function parseTextResponse(text) {
    let lines = text.split("\n");
    let data = {};
    lines.forEach(line => {
        let parts = line.split(" = ");
        if (parts.length === 2) {
            let key = parts[0].trim();
            let value = parts[1].trim();
            data[key] = value;
        }
    });
    console.log("Parsed tekstbaserede data:", data);
    return data;
}

// Hent elementer
const statsvejInfoBox   = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn  = document.getElementById("statsvejCloseBtn");

// Klik på kryds => luk statsvejInfoBox
statsvejCloseBtn.addEventListener("click", function() {
    statsvejInfoBox.style.display = "none";
    document.getElementById("infoBox").style.display = "none";
    document.getElementById("coordinateBox").style.display = "none";

    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
});

// Luk-knap til #infoBox
const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
    document.getElementById("infoBox").style.display = "none";
    document.getElementById("statsvejInfoBox").style.display = "none";
    document.getElementById("coordinateBox").style.display = "none";

    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
});

/***************************************************
 * Hent vejgeometri fra Dataforsyningen (navngivne veje)
 ***************************************************/
async function getRoadGeometry(kommunekode, vejkode) {
    // Endpoint for navngivne veje via Dataforsyningen
    // /navngivneveje?kommunekode={}&vejkode={}&struktur=flad&geometri=begge
    let url = `https://api.dataforsyningen.dk/navngivneveje?kommunekode=${kommunekode}&vejkode=${vejkode}&struktur=flad&geometri=begge`;
    console.log("Henter vejgeometri:", url);

    try {
        let r = await fetch(url);
        let data = await r.json();
        console.log("getRoadGeometry data:", data);

        if (data && data.length > 0 && data[0].geometri) {
            // Her antager vi, at data[0].geometri er en MultiLineString eller MultiPolygon i WGS84
            return data[0].geometri; 
        }
    } catch (err) {
        console.error("Fejl i getRoadGeometry:", err);
    }
    return null;
}

/***************************************************
 * "Find kryds"-knap => find intersection med Turf.js
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async function() {
    // Tjek om begge veje er valgt
    if (!selectedRoad1 || !selectedRoad2) {
        alert("Vælg venligst to veje først.");
        return;
    }

    // Hent geometri for vej1
    let geom1 = await getRoadGeometry(selectedRoad1.kommunekode, selectedRoad1.vejkode);
    // Hent geometri for vej2
    let geom2 = await getRoadGeometry(selectedRoad2.kommunekode, selectedRoad2.vejkode);

    if (!geom1 || !geom2) {
        alert("Kunne ikke hente geometri for en eller begge veje.");
        return;
    }

    // Omdan til Turf-geometrier
    // Her antager vi, at geom1 og geom2 er MultiLineStrings i format { "type": "MultiLineString", "coordinates": [...] }
    let line1 = turf.multiLineString(geom1.coordinates);
    let line2 = turf.multiLineString(geom2.coordinates);

    // Find eventuelle kryds
    let intersection = turf.lineIntersect(line1, line2);
    console.log("Intersection result:", intersection);

    if (intersection.features.length === 0) {
        alert("De valgte veje krydser ikke hinanden.");
    } else {
        alert(`Fundet ${intersection.features.length} kryds!`);
        // Sæt markør(er) for hvert kryds
        intersection.features.forEach((feat, idx) => {
            // Koordinater i [lon, lat]
            let coords = feat.geometry.coordinates;
            let latlng = [coords[1], coords[0]];
            let marker = L.marker(latlng).addTo(map);
            marker.bindPopup(`Kryds #${idx + 1}`).openPopup();
        });
        // Du kan evt. samle alle kryds-punkter og kalde map.fitBounds(...) for at zoome til dem
    }
});

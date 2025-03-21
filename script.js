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

    // Stednavne (Datafordeleren):
    // Bemærk at du har username/password i URL:
    // "NUKALQTAFO" + "Fw62huch!"
    let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?username=NUKALQTAFO&password=Fw62huch!&stednavn=${encodeURIComponent(query + '*')}`;

    // Nu includerer vi strandposter:
    let strandPromise = doSearchStrandposter(query);

    Promise.all([
        fetch(addrUrl).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
        fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; }),
        strandPromise
    ])
    .then(([addrData, stedData, strandData]) => {
        console.log("addrData:", addrData);
        console.log("stedData:", stedData);
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

        // parse stednavne => { type:"stednavn", navn, bbox}
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

                          // (NY) Gem kommunekode og vejkode på input-feltets dataset,
                          // så "Find X" kan bruge dem senere:
                          if (listElement === vej1List) {
                              vej1Input.dataset.kommunekode = addressData.kommunekode;
                              vej1Input.dataset.vejkode = addressData.vejkode;
                          } 
                          else if (listElement === vej2List) {
                              vej2Input.dataset.kommunekode = addressData.kommunekode;
                              vej2Input.dataset.vejkode = addressData.vejkode;
                          }
                      })
                      .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
                }
                else if (obj.type === "stednavn" && obj.bbox) {
                    let [x, y] = [obj.bbox[0], obj.bbox[1]];
                    placeMarkerAndZoom([y, x], obj.navn);
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

            data.forEach(item => {
                let vejnavn   = item.adgangsadresse?.vejnavn || "Ukendt vej";
                let kommune   = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
                let postnr    = item.adgangsadresse?.postnr || "?";
                
                let li = document.createElement("li");
                li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

                li.addEventListener("click", function() {
                    inputField.value = vejnavn;
                    listElement.innerHTML = "";
                    listElement.style.display = "none";
                    // (Bemærk at den egentlige kommunekode/vejkode hentes
                    // først i /adgangsadresser/{id} (se doSearch -> obj.type=adresse).
                });

                listElement.appendChild(li);
                items.push(li);
            });

            listElement.style.display = data.length > 0 ? "block" : "none";
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
 * NY DEL: Intersection-funktion for to vejnavne
 ***************************************************/

// (NY) Rettet til at bruge kommunekode+vejkode i stedet for "Navn"
async function hentDatafordelerVej(kommunekode, vejkode) {
    console.log("hentDatafordelerVej kaldt med kommunekode:", kommunekode, "vejkode:", vejkode);

    // Byg URL til DAR "navngivenvej", med ?kommunekode=... &vejkode=...
    // Fri adgang ifølge documentation => intet brugernavn/password
    let restUrl = `
      https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvej?
        format=json&
        kommunekode=${kommunekode}&
        vejkode=${vejkode}
    `.replace(/\s+/g, "");

    console.log("Datafordeler navngivenvej-URL:", restUrl);

    let resp = await fetch(restUrl);
    if (!resp.ok) {
        throw new Error("Datafordeler REST-fejl: " + resp.status);
    }

    let jsonData = await resp.json();
    console.log("Modtaget navngivenvej-data:", jsonData);

    if (!jsonData.length) {
        throw new Error("Ingen navngivenvej fundet for kommunekode/vejkode: " + kommunekode + "/" + vejkode);
    }

    // Tag den første
    let wktString = jsonData[0].vejnavnebeliggenhed_vejnavnelinje;
    if (!wktString) {
        throw new Error("Mangler geometri (vejnavnebeliggenhed_vejnavnelinje).");
    }

    // Parse WKT => GeoJSON
    let geoJsonFeature = wktTilGeoJSON(wktString);
    return geoJsonFeature;

    // Samme wktTilGeoJSON som før
    function wktTilGeoJSON(wktString) {
        wktString = wktString.trim();

        let prefix = "MULTILINESTRING";
        let upperWKT = wktString.toUpperCase();
        if (!upperWKT.startsWith(prefix)) {
            throw new Error("wktTilGeoJSON-fejl: Forventede MULTILINESTRING(...) men fik: " + wktString);
        }

        let inner = wktString.substring(prefix.length).trim();
        if (inner.startsWith("(")) inner = inner.substring(1);
        if (inner.endsWith(")"))   inner = inner.substring(0, inner.length - 1);

        inner = inner.trim();
        let lineStrings = inner.split(/\)\s*,\s*\(/);

        let allCoords = lineStrings.map(ls => {
            ls = ls.replace(/^(\(|\s)+/, "").replace(/(\)|\s)+$/, "");
            let pointStrs = ls.split(/\s*,\s*/);

            let coords = pointStrs.map(pt => {
                let [xStr, yStr] = pt.trim().split(/\s+/);
                let x = parseFloat(xStr);
                let y = parseFloat(yStr);
                return [x, y];
            });
            return coords;
        });

        return {
            type: "Feature",
            geometry: {
                type: "MultiLineString",
                coordinates: allCoords
            },
            properties: {}
        };
    }
}

// Intersection => henter geometri for de to valgte veje
async function findIntersection() {
    try {
        let vej1 = vej1Input.value.trim();
        let vej2 = vej2Input.value.trim();

        if (!vej1 || !vej2) {
            alert("Udfyld begge vejfelter!");
            return;
        }

        // (NY) Læs kommunekode/vejkode fra dataset
        let kommunekode1 = vej1Input.dataset.kommunekode;
        let vejkode1     = vej1Input.dataset.vejkode;
        let kommunekode2 = vej2Input.dataset.kommunekode;
        let vejkode2     = vej2Input.dataset.vejkode;

        if (!kommunekode1 || !vejkode1 || !kommunekode2 || !vejkode2) {
            alert("Mangler kommunekode/vejkode på én af de to veje. Vælg en vej fra autocomplete-listen først.");
            return;
        }

        console.log("findIntersection: henter geometri for ", kommunekode1, vejkode1, "og", kommunekode2, vejkode2);

        // Hent geometri for vej1
        let geojson1 = await hentDatafordelerVej(kommunekode1, vejkode1);
        // Hent geometri for vej2
        let geojson2 = await hentDatafordelerVej(kommunekode2, vejkode2);

        if (!geojson1 || !geojson2) {
            alert("Kunne ikke finde geometri for en af vejene (ingen data).");
            return;
        }
        let line1 = geojson1; // Feature
        let line2 = geojson2; // Feature

        // Intersection via turf
        let intersection = turf.lineIntersect(line1, line2);

        console.log("Intersection-resultat:", intersection);

        if (!intersection.features.length) {
            alert("Ingen kryds fundet!");
            return;
        }

        // Hvis der er flere krydspunkter, tag den første
        let point = intersection.features[0];
        let [lon, lat] = point.geometry.coordinates;

        // Sæt marker og zoom
        placeMarkerAndZoom([lat, lon], `Kryds: ${vej1} + ${vej2}`);

    } catch (err) {
        console.error("Fejl i findIntersection:", err);
        alert("Fejl ved beregning af kryds. Se console.log for detaljer.");
    }
}

// Tilføj eventlistener til "Find X"
document.getElementById("findKrydsBtn").addEventListener("click", findIntersection);

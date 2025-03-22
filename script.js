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
 * Gemmer (kommunekode, vejkode) når brugeren har valgt en vej
 ***************************************************/
var selectedRoad1 = null;
var selectedRoad2 = null;

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
    doSearch(txt, vej1List);
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
    doSearch(txt, vej2List);
});

/***************************************************
 * doSearch => henter addresses + stednavne + STRANDPOSTER
 ***************************************************/
function doSearch(query, listElement) {
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?username=NUKALQTAFO&password=Fw62huch!&stednavn=${encodeURIComponent(query + '*')}`;

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
        // Bemærk: items er kun til #search-liste (pil op/ned)
        // For vej1/vej2 bruger vi ikke piletaster her, men du kan udvide.
        if (listElement === resultsList) {
            items = [];
            currentIndex = -1;
        }

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

        // strandData => { type:"strandpost", tekst, lat, lon, feature }
        let combined = [...addrResults, ...stedResults, ...strandData];

        combined.forEach(obj => {
            let li = document.createElement("li");
            if (obj.type === "strandpost") {
                li.textContent = obj.tekst; 
            } else if (obj.type === "adresse") {
                li.textContent = obj.tekst;
            } else if (obj.type === "stednavn") {
                li.textContent = obj.navn;
            }

            li.addEventListener("click", function() {
                // ADRESSE => fetch /adgangsadresser/{id} for fuld data
                if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
                      .then(r => r.json())
                      .then(addressData => {
                          let [lon, lat] = addressData.adgangspunkt.koordinater;
                          console.log("Placering:", lat, lon);

                          // Hvis brugeren klikkede i vej1-liste => gem i selectedRoad1
                          if (listElement === vej1List) {
                              selectedRoad1 = {
                                  kommunekode: addressData.kommunekode,
                                  vejkode: addressData.vejkode
                              };
                              console.log("selectedRoad1:", selectedRoad1);
                          }
                          // Hvis brugeren klikkede i vej2-liste => gem i selectedRoad2
                          else if (listElement === vej2List) {
                              selectedRoad2 = {
                                  kommunekode: addressData.kommunekode,
                                  vejkode: addressData.vejkode
                              };
                              console.log("selectedRoad2:", selectedRoad2);
                          }

                          // Zoom marker
                          placeMarkerAndZoom([lat, lon], obj.tekst);

                          // Ryd lister
                          listElement.innerHTML = "";
                          if (listElement === resultsList) {
                              resultsList.innerHTML = "";
                              items = [];
                              currentIndex = -1;
                          }
                      })
                      .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
                }
                else if (obj.type === "stednavn" && obj.bbox) {
                    let [x, y] = [obj.bbox[0], obj.bbox[1]];
                    placeMarkerAndZoom([y, x], obj.navn);
                }
                else if (obj.type === "strandpost") {
                    placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
                    let props = obj.feature.properties;
                    let e = document.getElementById("extra-info");
                    e.textContent = `Flere data: Parkeringsplads: ${props.ppl} ...?`;
                }
            });

            listElement.appendChild(li);

            // Pil-op/ned => kun for #search
            if (listElement === resultsList) {
                items.push(li);
            }
        });

        // VIS listen hvis vi har resultater
        if (combined.length > 0) {
            listElement.style.display = "block";
        } else {
            listElement.style.display = "none";
        }
    })
    .catch(err => console.error("Fejl i doSearch:", err));
}

/***************************************************
 * doSearchStrandposter
 ***************************************************/
function doSearchStrandposter(query) {
    let cql = `UPPER(redningsnr) LIKE UPPER('%${query}%')`;
    let wfsUrl = `https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS` +
                 `&version=1.1.0` +
                 `&request=GetFeature` +
                 `&typeName=nobc:Redningsnummer` +
                 `&outputFormat=application/json` +
                 `&cql_filter=${encodeURIComponent(cql)}`;

    console.log("Strandposter WFS URL:", wfsUrl);
    return fetch(wfsUrl)
      .then(resp => resp.json())
      .then(geojson => {
         let arr = [];
         if (geojson.features) {
           geojson.features.forEach(feature => {
             let props = feature.properties;
             let rn = props.redningsnr;
             let tekst = `Redningsnummer: ${rn}`;
             let coords = feature.geometry.coordinates; // [lon, lat]
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

// parseTextResponse
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

// Statsvej-luk-knap
const statsvejInfoBox   = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn  = document.getElementById("statsvejCloseBtn");
statsvejCloseBtn.addEventListener("click", function() {
    statsvejInfoBox.style.display = "none";
    document.getElementById("infoBox").style.display = "none";
    document.getElementById("coordinateBox").style.display = "none";
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
});

// infoBox-luk
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
 * Intersection-funktion (demo)
 ***************************************************/
async function findIntersection() {
    try {
        // Tjek om brugeren har klikket i vej1 og vej2
        if (!selectedRoad1 || !selectedRoad2) {
            alert("Udfyld begge vejfelter (via autocomplete)!");
            return;
        }
        console.log("findIntersection => selectedRoad1:", selectedRoad1, "selectedRoad2:", selectedRoad2);

        // Her ville du fx kalde en WFS/REST for at hente geometri for hver (kommunekode+vejkode)
        // og derefter køre turf.lineIntersect

        alert("Intersection kald: Her ville du lave WFS-kald for " +
              selectedRoad1.kommunekode + "-" + selectedRoad1.vejkode + " og " +
              selectedRoad2.kommunekode + "-" + selectedRoad2.vejkode);
    } catch (err) {
        console.error("Fejl i findIntersection:", err);
        alert("Fejl ved beregning af kryds. Se console.log for detaljer.");
    }
}

// Knap "Find X"
document.getElementById("findKrydsBtn").addEventListener("click", findIntersection);

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
    document.getElementById("coordinateBox").textContent =
      `Koordinater: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
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
 * Globale variabler til at huske den valgte
 * kommunekode + vejkode for vej1 og vej2
 ***************************************************/
let selectedRoad1 = null;
let selectedRoad2 = null;

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
        items = [];
        currentIndex = -1;

        let addrResults = (addrData || []).map(item => {
            return {
                type: "adresse",
                tekst: item.tekst,
                adgangsadresse: item.adgangsadresse
            };
        });

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
                if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
                    // fetch /adgangsadresser/{id} => for at få vejkode + kommunekode
                    fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
                      .then(r => r.json())
                      .then(addressData => {
                          let [lon, lat] = addressData.adgangspunkt.koordinater;
                          console.log("Placering (fra /adgangsadresser/id):", lat, lon);
                          
                          // Gem vejkode + kommunekode i global variabel
                          let kk = addressData.kommunekode; // fx "0101"
                          let vk = addressData.vejkode;     // fx "5804"

                          // Afgør om det er vej1 eller vej2
                          if (listElement === vej1List) {
                            selectedRoad1 = { kommunekode: kk, vejkode: vk };
                            console.log("selectedRoad1 gemt:", selectedRoad1);
                          } else {
                            selectedRoad2 = { kommunekode: kk, vejkode: vk };
                            console.log("selectedRoad2 gemt:", selectedRoad2);
                          }

                          // Sæt inputfeltets værdi (kan evt. være "kk-vk" eller blot item.tekst)
                          // Her viser vi kk-vk for debugging:
                          if (listElement === vej1List) {
                            vej1Input.value = kk + "-" + vk;
                          } else {
                            vej2Input.value = kk + "-" + vk;
                          }

                          // Zoom til den valgte
                          placeMarkerAndZoom([lat, lon], obj.tekst);

                          // Ryd lister
                          resultsList.innerHTML = "";
                          vej1List.innerHTML = "";
                          vej2List.innerHTML = "";
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

                listElement.innerHTML = "";
                listElement.style.display = "none";
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
                let vejnavn = item.adgangsadresse?.vejnavn || "Ukendt vej";
                let kommune = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
                let postnr = item.adgangsadresse?.postnr || "?";

                let li = document.createElement("li");
                li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

                li.addEventListener("click", function() {
                    // Her i "road"‐autocomplete klikker man ofte kun på vejnavn
                    // Men vi vil i virkeligheden gerne have den fulde /adgangsadresser/{id}
                    // => se ovenfor i doSearch(...) hvis du vil lave en lignende approach
                    // med fetch() for at gemme kk+vk.
                    inputField.value = vejnavn;
                    listElement.innerHTML = "";
                    listElement.style.display = "none";
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
// (Eksempel) hentDatafordelerVej(kode) – hvis du har en
// WFS-forespørgsel baseret på "kommunekode-vejkode" eller lign.
async function hentDatafordelerVej(kode) {
    console.log("hentDatafordelerVej kaldt med:", kode);
    // ... Din logik for at hente geometri baseret på "0101-5804" ...
    // Returnér fx et GeoJSON Feature
    // PSEUDOKODE:
    throw new Error("Implementer hentDatafordelerVej(...) med WFS/REST-kald baseret på 'kode'!");
}

// findIntersection => henter geometri for Vej1 og Vej2
async function findIntersection() {
    try {
        // Tjek om vi har gemt data for de to veje
        if (!selectedRoad1 || !selectedRoad2) {
            alert("Udfyld begge vejfelter (klik i autocomplete)!");
            return;
        }

        // Byg fx "0101-5804"
        let kv1 = selectedRoad1.kommunekode + "-" + selectedRoad1.vejkode;
        let kv2 = selectedRoad2.kommunekode + "-" + selectedRoad2.vejkode;
        console.log("Kryds-søgning på:", kv1, kv2);

        let geojson1 = await hentDatafordelerVej(kv1);
        let geojson2 = await hentDatafordelerVej(kv2);

        if (!geojson1 || !geojson2) {
            alert("Kunne ikke hente geometri for en af vejene.");
            return;
        }

        // Intersection via turf
        let intersection = turf.lineIntersect(geojson1, geojson2);
        console.log("Intersection-resultat:", intersection);

        if (!intersection.features || !intersection.features.length) {
            alert("Ingen kryds fundet!");
            return;
        }

        // Tag første kryds
        let point = intersection.features[0];
        let [lon, lat] = point.geometry.coordinates;

        // Sæt marker og zoom
        placeMarkerAndZoom([lat, lon], `Kryds: ${kv1} + ${kv2}`);
    } catch (err) {
        console.error("Fejl i findIntersection:", err);
        alert("Fejl ved beregning af kryds. Se console.log for detaljer.");
    }
}

// Knap "Find X"
document.getElementById("findKrydsBtn").addEventListener("click", findIntersection);

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
 * Hjælpefunktion til at kopiere tekst til clipboard
 ***************************************************/
function copyToClipboard(str) {
  // Erstat bogstavelige \n med rigtige linjeskift
  let finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr)
    .then(() => {
      console.log("Copied to clipboard:", finalStr);
    })
    .catch(err => {
      console.error("Could not copy text:", err);
    });
}

/***************************************************
 * Opret kort og lag
 ***************************************************/

// Opret kortet først
var map = L.map('map', {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

// OpenStreetMap-lag
var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
  }
).addTo(map);

// Opret WMS-lag for redningsnumre (Strandposter)
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

// Tilføj lagkontrol
const baseMaps = { "OpenStreetMap": osmLayer };
const overlayMaps = { "Strandposter": redningsnrLayer };
L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

/***************************************************
 * Global variabel til at gemme alle strandposter
 ***************************************************/
var allStrandposter = [];

/***************************************************
 * Funktion til at hente alle redningsnumre (strandposter)
 * Når brugeren aktiverer Strandposter-laget.
 ***************************************************/
async function fetchAllStrandposter() {
  let url = "https://kort.strandnr.dk/geoserver/nobc/ows?" +
            "service=WFS&version=1.1.0&request=GetFeature" +
            "&typeName=nobc:Redningsnummer" +
            "&outputFormat=application/json";
  console.log("Henter ALLE strandposter:", url);
  try {
    let resp = await fetch(url);
    let data = await resp.json();
    allStrandposter = data.features || [];
    console.log("Hentet", allStrandposter.length, "strandposter.");
  } catch (err) {
    console.error("Fejl ved hentning af strandposter:", err);
  }
}

/***************************************************
 * Sæt overlayadd-hændelse op – når Strandposter-laget tændes,
 * hentes alle strandposter.
 ***************************************************/
map.on('overlayadd', function(e) {
  if (e.layer === redningsnrLayer) {
    console.log("Strandposter laget aktiveret – henter alle data.");
    fetchAllStrandposter();
  }
});

/***************************************************
 * Global variabel til aktuelt marker
 ***************************************************/
var currentMarker;

/***************************************************
 * Kommunedata hentet fra "Kommuner.xlsx"
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Klik på kort => reverse geocoding (Dataforsyningen)
 ***************************************************/
map.on('click', function(e) {
  var lat = e.latlng.lat;
  var lon = e.latlng.lng;

  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);

  // Opdater koordinatboksen
  document.getElementById("coordinateBox").textContent =
    `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";

  // Reverse geocoding mod Dataforsyningen
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
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
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");

  const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
  const ekstraInfoStr = `Kommunekode: ${data.kommunekode || "?"} | Vejkode: ${data.vejkode || "?"}`;

  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = adresseStr;

  if (extraInfoEl) {
    extraInfoEl.textContent = ekstraInfoStr;
  }

  // Opdater Skråfoto-linket
  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "block";

  // Tilføj links til at kopiere adressen i to formater:
  // Eva.Net: "vejnavn,husnr,postnr" (komma-separeret, uden mellemrum)
  // Notes: "vejnavn husnr, postnr" (med mellemrum og komma)
  if (extraInfoEl) {
    let evaFormat = `${data.vejnavn || ""},${data.husnr || ""},${data.postnr || ""}`;
    let notesFormat = `${data.vejnavn || ""} ${data.husnr || ""}, ${data.postnr || ""}`;
    extraInfoEl.innerHTML += `
      <br>
      <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
      <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
    `;
  }

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

  // Hent kommuneinfo (ekstra info)
  if (data.kommunekode) {
    try {
      let komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
      let komResp = await fetch(komUrl);
      if (komResp.ok) {
        let komData = await komResp.json();
        let kommunenavn = komData.navn || "";
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
 * Søgefelter og lister
 ***************************************************/
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Tilføj clear-knap til inputfelter
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

/***************************************************
 * Vi har brug for SEPARATE lister + piletaster
 * for #search, #vej1, #vej2
 ***************************************************/

// (1) #search
var searchItems = [];
var searchIndex = -1;

// (2) #vej1
var vej1Items = [];
var vej1Index = -1;

// (3) #vej2
var vej2Items = [];
var vej2Index = -1;


/***************************************************
 * #search => doSearch (kombinerer adresser, stednavne og strandposter)
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

  // Tjek om brugeren har tastet koordinater direkte
  const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
  if (coordRegex.test(txt)) {
    const match = txt.match(coordRegex);
    const latNum = parseFloat(match[1]);
    const lonNum = parseFloat(match[2]);
    let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl)
      .then(r => r.json())
      .then(data => {
        resultsList.innerHTML = "";
        placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
        updateInfoBox(data, latNum, lonNum);
      })
      .catch(err => console.error("Reverse geocoding fejl:", err));
    return;
  }
});

// Piletaster for #search
searchInput.addEventListener("keydown", function(e) {
  if (searchItems.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchIndex = (searchIndex + 1) % searchItems.length;
    highlightItem(searchItems, searchIndex);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchIndex = (searchIndex + searchItems.length - 1) % searchItems.length;
    highlightItem(searchItems, searchIndex);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (searchIndex >= 0) {
      searchItems[searchIndex].click();
    }
  }
});

function highlightItem(itemArray, currentIdx) {
  itemArray.forEach(li => li.classList.remove("highlight"));
  if (currentIdx >= 0 && currentIdx < itemArray.length) {
    itemArray[currentIdx].classList.add("highlight");
  }
}

/***************************************************
 * #vej1 => doSearchRoad + piletaster
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 2) {
    vej1List.innerHTML = "";
    vej1List.style.display = "none";
    return;
  }
  doSearchRoad(txt, vej1List, vej1Input, "vej1");
});

// Piletaster for #vej1
vej1Input.addEventListener("keydown", function(e) {
  if (vej1Items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    vej1Index = (vej1Index + 1) % vej1Items.length;
    highlightItem(vej1Items, vej1Index);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    vej1Index = (vej1Index + vej1Items.length - 1) % vej1Items.length;
    highlightItem(vej1Items, vej1Index);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (vej1Index >= 0) {
      vej1Items[vej1Index].click();
    }
  }
});

/***************************************************
 * #vej2 => doSearchRoad + piletaster
 ***************************************************/
vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 2) {
    vej2List.innerHTML = "";
    vej2List.style.display = "none";
    return;
  }
  doSearchRoad(txt, vej2List, vej2Input, "vej2");
});

// Piletaster for #vej2
vej2Input.addEventListener("keydown", function(e) {
  if (vej2Items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    vej2Index = (vej2Index + 1) % vej2Items.length;
    highlightItem(vej2Items, vej2Index);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    vej2Index = (vej2Index + vej2Items.length - 1) % vej2Items.length;
    highlightItem(vej2Items, vej2Index);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (vej2Index >= 0) {
      vej2Items[vej2Index].click();
    }
  }
});


/***************************************************
 * Ryd infoBox, coordinateBox osv. hvis man trykker Backspace
 ***************************************************/
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


/***************************************************
 * Klik på clear-knap => ryd
 ***************************************************/
clearBtn.addEventListener("click", function() {
  searchInput.value = "";
  resultsList.innerHTML = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
  searchInput.focus();
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
 * doSearch => henter adresser, stednavne og strandposter
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
    // NULSTIL array + index for #search
    searchItems = [];
    searchIndex = -1;

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
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              let [lon, lat] = addressData.adgangspunkt.koordinater;
              console.log("Placering:", lat, lon);
              let fullAddr = `${addressData.vejnavn || ""} ${addressData.husnr || ""}, ${addressData.postnr || ""} ${addressData.postnrnavn || ""}`;
              searchInput.value = fullAddr;
              placeMarkerAndZoom([lat, lon], fullAddr);
              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        }
        else if (obj.type === "stednavn" && obj.bbox) {
          let [x, y] = [obj.bbox[0], obj.bbox[1]];
          placeMarkerAndZoom([y, x], obj.navn);
          searchInput.value = obj.navn;
        }
        else if (obj.type === "strandpost") {
          let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`;
          fetch(revUrl)
            .then(r => r.json())
            .then(revData => {
              let fullAddr = `${revData.vejnavn || "?"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
              placeMarkerAndZoom([obj.lat, obj.lon], fullAddr);
              searchInput.value = fullAddr;
              let e = document.getElementById("extra-info");
              let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
              let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}, ${revData.postnr || ""}`;
              e.innerHTML = `Flere data: Parkeringsplads: ${obj.feature.properties.ppl || "N/A"}<br>
                             <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
                             <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>`;
            })
            .catch(err => console.error("Reverse geocoding for strandpost fejlede:", err));
        }
      });

      listElement.appendChild(li);
      // Tilføj til searchItems
      searchItems.push(li);
    });

    listElement.style.display = combined.length > 0 ? "block" : "none";

  })
  .catch(err => console.error("Fejl i doSearch:", err));
}


/***************************************************
 * doSearchStrandposter => filtrerer lokalt de hentede strandposter
 ***************************************************/
function doSearchStrandposter(query) {
  if (allStrandposter.length === 0) {
    return Promise.resolve([]);
  }
  let upperQuery = query.toUpperCase();
  let arr = [];
  allStrandposter.forEach(feature => {
    let rn = feature.properties.redningsnr || "";
    if (rn.toUpperCase().includes(upperQuery)) {
      let coords = feature.geometry.coordinates; // [lon, lat]
      let lon = coords[0];
      let lat = coords[1];
      arr.push({
        type: "strandpost",
        tekst: `Redningsnummer: ${rn}`,
        lat: lat,
        lon: lon,
        feature: feature
      });
    }
  });
  return Promise.resolve(arr);
}


/***************************************************
 * doSearchRoad => bruges af vej1/vej2
 * Ekstra parameter "which" for at vide om det er vej1 eller vej2
 ***************************************************/
function doSearchRoad(query, listElement, inputField, which) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  console.log("doSearchRoad kaldt med query:", query, " => ", addrUrl);

  fetch(addrUrl)
    .then(response => response.json())
    .then(data => {
      console.log("Modtaget data fra /adgangsadresser/autocomplete:", data);
      listElement.innerHTML = "";

      // Nulstil enten vej1Items eller vej2Items
      if (which === "vej1") {
        vej1Items = [];
        vej1Index = -1;
      } else {
        vej2Items = [];
        vej2Index = -1;
      }

      data.sort((a, b) => a.tekst.localeCompare(b.tekst));

      const unique = new Set();
      data.forEach(item => {
        let vejnavn   = item.adgangsadresse?.vejnavn || "Ukendt vej";
        let kommune   = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
        let postnr    = item.adgangsadresse?.postnr || "?";
        let adgangsId = item.adgangsadresse?.id || null;
        let key = `${vejnavn}-${postnr}`;
        if (unique.has(key)) return;
        unique.add(key);

        let li = document.createElement("li");
        li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

        li.addEventListener("click", function() {
          inputField.value = vejnavn;
          listElement.innerHTML = "";
          listElement.style.display = "none";
          console.log("Valgt vejnavn:", vejnavn, " => henter detaljer for adgangsadresse:", adgangsId);
          if (!adgangsId) {
            console.error("Ingen adgangsadresse.id => kan ikke slå vejkode op");
            return;
          }
          let detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
          console.log("detailUrl:", detailUrl);
          fetch(detailUrl)
            .then(r => r.json())
            .then(async detailData => {
              console.log("Detaljeret adressedata:", detailData);
              let roadSelection = {
                vejnavn: vejnavn,
                kommunekode: detailData.kommunekode,
                vejkode: detailData.vejkode,
                husnummerId: detailData.id
              };
              let geometry = await getNavngivenvejKommunedelGeometry(detailData.id);
              roadSelection.geometry = geometry;
              if (inputField.id === "vej1") {
                selectedRoad1 = roadSelection;
              } else if (inputField.id === "vej2") {
                selectedRoad2 = roadSelection;
              }
              console.log("Selected road:", roadSelection);
            })
            .catch(err => {
              console.error("Fejl i fetch /adgangsadresser/{id}:", err);
            });
        });

        listElement.appendChild(li);

        // Tilføj til vej1Items/vej2Items
        if (which === "vej1") {
          vej1Items.push(li);
        } else {
          vej2Items.push(li);
        }
      });

      listElement.style.display = data.length > 0 ? "block" : "none";
    })
    .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * Hent geometri via navngivenvejkommunedel (WKT => parse)
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  let url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  console.log("Henter navngivenvejkommunedel-data:", url);
  try {
    let r = await fetch(url);
    let data = await r.json();
    console.log("Svar fra navngivenvejkommunedel:", data);
    if (Array.isArray(data) && data.length > 0) {
      let first = data[0];
      if (first.navngivenVej && first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje) {
        let wktString = first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje;
        console.log("Fandt WKT streng:", wktString);
        let geojson = wellknown.parse(wktString);
        console.log("Parsed WKT => GeoJSON:", geojson);
        return geojson;
      } else {
        console.warn("Ingen WKT streng i 'vejnavnebeliggenhed_vejnavnelinje' for husnummer:", husnummerId);
      }
    } else {
      console.warn("Ingen elementer i arrayet for husnummer:", husnummerId);
    }
  } catch (err) {
    console.error("Fejl i getNavngivenvejKommunedelGeometry:", err);
  }
  return null;
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
  console.log("HTML-elementer:", document.getElementById("address"), document.getElementById("streetviewLink"), document.getElementById("infoBox"));
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej => henter statsvej (Geocloud)
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

/***************************************************
 * Statsvej / info-bokse
 ***************************************************/
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
 * "Find X"-knap => find intersection med Turf.js
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async function() {
  if (!selectedRoad1 || !selectedRoad2) {
    alert("Vælg venligst to veje først.");
    return;
  }
  if (!selectedRoad1.geometry || !selectedRoad2.geometry) {
    alert("Geometri ikke tilgængelig for en eller begge veje.");
    return;
  }
  let line1 = turf.multiLineString(selectedRoad1.geometry.coordinates);
  let line2 = turf.multiLineString(selectedRoad2.geometry.coordinates);
  let intersection = turf.lineIntersect(line1, line2);
  console.log("Intersection result:", intersection);
  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];
    for (let i = 0; i < intersection.features.length; i++) {
      let feat = intersection.features[i];
      let coords = feat.geometry.coordinates;
      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      console.log("Reverse geocoding for intersection:", revUrl);
      let revResp = await fetch(revUrl);
      let revData = await revResp.json();
      let popupText = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
      let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
      let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}, ${revData.postnr || ""}`;
      popupText += `
        <br>
        <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
        <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
      `;
      let marker = L.marker([wgsLat, wgsLon]).addTo(map);
      marker.bindPopup(popupText.trim()).openPopup();
      latLngs.push([wgsLat, wgsLon]);
    }
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 16);
    } else {
      map.fitBounds(latLngs);
    }
  }
});

// Når DOM'en er færdigindlæst, sæt fokus på søgefeltet:
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("search").focus();
});

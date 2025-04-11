/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
  // Forvent, at input x,y er UTM (x=easting, y=northing)
  const result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  // Returnér [lat, lon] til Leaflet
  return [result[1], result[0]];
}

/***************************************************
 * Hjælpefunktion til at kopiere tekst til clipboard
 ***************************************************/
function copyToClipboard(str) {
  const finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr)
    .then(() => console.log("Copied to clipboard:", finalStr))
    .catch(err => console.error("Could not copy text:", err));
}

/***************************************************
 * Sorteringsprioritet
 ***************************************************/
function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse") {
    text = item.tekst || "";
  } else if (item.type === "stednavn") {
    text = item.navn || "";
  } else if (item.type === "strandpost") {
    text = item.tekst || "";
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  if (lowerText === lowerQuery) return 0;
  if (lowerText.startsWith(lowerQuery)) return 1;
  if (lowerText.includes(lowerQuery)) return 2;
  return 3;
}

/***************************************************
 * Dataopdatering (strandposter, 24 timer)
 ***************************************************/
function getLastUpdated() {
  return localStorage.getItem("strandposterLastUpdated");
}
function setLastUpdated() {
  localStorage.setItem("strandposterLastUpdated", Date.now());
}
function shouldUpdateData() {
  const lastUpdated = getLastUpdated();
  if (!lastUpdated) return true;
  return Date.now() - parseInt(lastUpdated, 10) > 86400000;
}

/***************************************************
 * Opret Leaflet-kort
 ***************************************************/
const map = L.map("map", {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

// OpenStreetMap-lag
const osmLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
  }
).addTo(map);

// Ortofoto-lag
const ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  {
    layers: "orto_foraar",
    format: "image/jpeg",
    transparent: false,
    version: "1.1.1",
    attribution: "Ortofoto © Kortforsyningen"
  }
);

// Strandposter-lag
const redningsnrLayer = L.tileLayer.wms(
  "https://kort.strandnr.dk/geoserver/nobc/ows",
  {
    layers: "Redningsnummer",
    format: "image/png",
    transparent: true,
    version: "1.3.0",
    attribution: "Data: redningsnummer.dk"
  }
);

const baseMaps = {
  "OpenStreetMap": osmLayer,
  "Satellit": ortofotoLayer
};
const overlayMaps = {
  "Strandposter": redningsnrLayer
};

L.control.layers(baseMaps, overlayMaps, { position: "topright" }).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

let currentMarker = null;

/***************************************************
 * Kommunedata
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Strandposter-søgning
 ***************************************************/
let allStrandposter = [];

function fetchAllStrandposter() {
  const wfsUrl = "https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=nobc:Redningsnummer&outputFormat=application/json";
  console.log("Henter alle strandposter fra:", wfsUrl);
  return fetch(wfsUrl)
    .then(resp => resp.json())
    .then(geojson => {
      if (geojson.features) {
        allStrandposter = geojson.features;
        console.log("Alle strandposter hentet:", allStrandposter);
        setLastUpdated();
      } else {
        console.warn("Ingen strandposter modtaget.");
      }
    })
    .catch(err => {
      console.error("Fejl ved hentning af strandposter:", err);
    });
}

map.on("overlayadd", function(event) {
  if (event.name === "Strandposter") {
    console.log("Strandposter laget er tilføjet.");
    if (shouldUpdateData()) {
      console.log("Data er ældre end 24 timer – henter opdaterede strandposter...");
      fetchAllStrandposter();
    } else {
      console.log("Data er opdaterede – ingen hentning nødvendig.");
    }
  }
});

function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise(resolve => {
    function filterAndMap() {
      const results = allStrandposter.filter(feature => {
        const rednr = (feature.properties.StrandNr || "").toLowerCase();
        return rednr.indexOf(query) !== -1;
      }).map(feature => {
        const rednr = feature.properties.StrandNr;
        const tekst = `Redningsnummer: ${rednr}`;
        const coords = feature.geometry.coordinates; // [lon, lat] i EPSG:25832
        let lat, lon;
        if (coords[0] > 90 || coords[1] > 90) {
          const converted = convertToWGS84(coords[0], coords[1]);
          lat = converted[0];
          lon = converted[1];
        } else {
          lon = coords[0];
          lat = coords[1];
        }
        return {
          type: "strandpost",
          tekst: tekst,
          lat: lat,
          lon: lon,
          feature: feature
        };
      });
      console.log("Filtrerede strandposter:", results);
      resolve(results);
    }
    if (allStrandposter.length === 0) {
      fetchAllStrandposter().then(filterAndMap).catch(err => {
        console.error("Fejl ved hentning af strandposter:", err);
        resolve([]);
      });
    } else {
      filterAndMap();
    }
  });
}

/***************************************************
 * Klik på kort => reverse geocoding => opdater info
 ***************************************************/
map.on("click", function(e) {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;

  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);

  // Viser koordinater i #coordinateBox
  document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";

  const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
    .then(r => r.json())
    .then(data => {
      updateInfoBox(data, lat, lon);
    })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * Én infoboks => updateInfoBox
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  // 1) Adressen
  const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
  document.getElementById("address").textContent = adresseStr;

  // 2) Streetview + skråfoto
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  const skraafotoLink = document.getElementById("skraafotoLink");
  skraafotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skraafotoLink.style.display = "block";

  // 3) Ekstra info (tømmes og genopbygges)
  const extraInfoEl = document.getElementById("extra-info");
  extraInfoEl.textContent = ""; // Ryd
  // Indsæt Eva.Net + Notes links
  const evaFormat   = `${data.vejnavn || ""},${data.husnr || ""},${data.postnr || ""}`;
  const notesFormat = `${data.vejnavn || ""} ${data.husnr || ""}\\n${data.postnr || ""} ${data.postnrnavn || ""}`;
  extraInfoEl.innerHTML += `
    <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
    <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
  `;

  // 4) Statsvej => Geocloud
  const statsvejData = await checkForStatsvej(lat, lon);
  if (statsvejData) {
    extraInfoEl.innerHTML += `
      <br><strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}
      <br><strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}
      <br><strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}
      <br><strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}
      <br><strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}
    `;
  }

  // 5) Kommune-info: 
  if (data.kommunekode) {
    try {
      const komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
      const komResp = await fetch(komUrl);
      if (komResp.ok) {
        const komData = await komResp.json();
        const kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          const info = kommuneInfo[kommunenavn];
          const doedeDyr = info["Døde dyr"];
          const gaderVeje = info["Gader og veje"];
          extraInfoEl.innerHTML += `
            <br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}
          `;
        }
      }
    } catch (e) {
      console.error("Kunne ikke hente kommuneinfo:", e);
    }
  }

  // 6) Vis infoboksen
  document.getElementById("infoBox").style.display = "block";

  // 7) Sæt hele adressen i søgefeltet (så det bliver "fulde adresse" i search-feltet)
  const searchInput = document.getElementById("search");
  searchInput.value = adresseStr;
}

/***************************************************
 * Søgefelter, resultater
 ***************************************************/
const searchInput  = document.getElementById("search");
const clearBtn     = document.getElementById("clearSearch");
const resultsList  = document.getElementById("results");

const vej1Input    = document.getElementById("vej1");
const vej2Input    = document.getElementById("vej2");
const vej1List     = document.getElementById("results-vej1");
const vej2List     = document.getElementById("results-vej2");

function addClearButton(inputElement, listElement) {
  const btn = document.createElement("span");
  btn.innerHTML = "&times;";
  btn.classList.add("clear-button");
  inputElement.parentElement.appendChild(btn);

  inputElement.addEventListener("input", function() {
    btn.style.display = inputElement.value.length > 0 ? "inline" : "none";
  });

  btn.addEventListener("click", function() {
    inputElement.value = "";
    listElement.innerHTML = "";
    btn.style.display = "none";
  });

  inputElement.addEventListener("keydown", function(e) {
    if (e.key === "Backspace" && inputElement.value.length === 0) {
      listElement.innerHTML = "";
    }
  });

  btn.style.display = "none";
}
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

/***************************************************
 * Globale arrays til piletaster
 ***************************************************/
let searchItems = [];
let searchCurrentIndex = -1;

let vej1Items = [];
let vej1CurrentIndex = -1;
let vej2Items = [];
let vej2CurrentIndex = -1;

/***************************************************
 * #search => doSearch
 ***************************************************/
searchInput.addEventListener("input", function() {
  const txt = searchInput.value.trim();
  if (txt.length < 2) {
    clearBtn.style.display = "none";
    resultsList.innerHTML = "";
    document.getElementById("infoBox").style.display = "none";
    searchItems = [];
    return;
  }
  clearBtn.style.display = "inline";
  doSearch(txt, resultsList);
});

searchInput.addEventListener("keydown", function(e) {
  if (searchItems.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex + 1) % searchItems.length;
    highlightSearchItem();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex + searchItems.length - 1) % searchItems.length;
    highlightSearchItem();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (searchCurrentIndex >= 0) {
      searchItems[searchCurrentIndex].click();
    }
  }
});

function highlightSearchItem() {
  searchItems.forEach(li => li.classList.remove("highlight"));
  if (searchCurrentIndex >= 0 && searchCurrentIndex < searchItems.length) {
    searchItems[searchCurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Vej1 => doSearchRoad
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 2) {
    vej1List.innerHTML = "";
    vej1List.style.display = "none";
    vej1Items = [];
    return;
  }
  doSearchRoad(txt, vej1List, vej1Input, "vej1");
});

vej1Input.addEventListener("keydown", function(e) {
  if (vej1Items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    vej1CurrentIndex = (vej1CurrentIndex + 1) % vej1Items.length;
    highlightVej1Item();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    vej1CurrentIndex = (vej1CurrentIndex + vej1Items.length - 1) % vej1Items.length;
    highlightVej1Item();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (vej1CurrentIndex >= 0) {
      vej1Items[vej1CurrentIndex].click();
    }
  }
});
function highlightVej1Item() {
  vej1Items.forEach(li => li.classList.remove("highlight"));
  if (vej1CurrentIndex >= 0 && vej1CurrentIndex < vej1Items.length) {
    vej1Items[vej1CurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Vej2 => doSearchRoad
 ***************************************************/
vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 2) {
    vej2List.innerHTML = "";
    vej2List.style.display = "none";
    vej2Items = [];
    return;
  }
  doSearchRoad(txt, vej2List, vej2Input, "vej2");
});

vej2Input.addEventListener("keydown", function(e) {
  if (vej2Items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    vej2CurrentIndex = (vej2CurrentIndex + 1) % vej2Items.length;
    highlightVej2Item();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    vej2CurrentIndex = (vej2CurrentIndex + vej2Items.length - 1) % vej2Items.length;
    highlightVej2Item();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (vej2CurrentIndex >= 0) {
      vej2Items[vej2CurrentIndex].click();
    }
  }
});
function highlightVej2Item() {
  vej2Items.forEach(li => li.classList.remove("highlight"));
  if (vej2CurrentIndex >= 0 && vej2CurrentIndex < vej2Items.length) {
    vej2Items[vej2CurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Klik på clear-knap => ryd
 ***************************************************/
clearBtn.addEventListener("click", function() {
  searchInput.value = "";
  resultsList.innerHTML = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
  searchInput.focus();
  resetInfoBox();
});
function resetInfoBox() {
  document.getElementById("extra-info").textContent = "";
  document.getElementById("skraafotoLink").style.display = "none";
}

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
 * doSearchRoad => Autocomplete for vej1/vej2
 ***************************************************/
async function doSearchRoad(query, listElement, inputField, which) {
  const addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  console.log("doSearchRoad kaldt med query:", query, " => ", addrUrl);

  try {
    const resp = await fetch(addrUrl);
    const data = await resp.json();
    console.log("Modtaget data fra /adgangsadresser/autocomplete:", data);

    listElement.innerHTML = "";
    if (which === "vej1") {
      vej1Items = [];
      vej1CurrentIndex = -1;
    } else {
      vej2Items = [];
      vej2CurrentIndex = -1;
    }

    data.sort((a, b) => a.tekst.localeCompare(b.tekst));
    const unique = new Set();
    data.forEach(item => {
      const vejnavn = item.adgangsadresse?.vejnavn || "Ukendt vej";
      const kommune = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
      const postnr  = item.adgangsadresse?.postnr || "?";
      const adgangsId = item.adgangsadresse?.id || null;
      const key = `${vejnavn}-${postnr}`;
      if (unique.has(key)) return;
      unique.add(key);

      const li = document.createElement("li");
      li.textContent = `${vejnavn}, ${kommune} (${postnr})`;
      li.addEventListener("click", async function() {
        inputField.value = vejnavn;
        listElement.innerHTML = "";
        listElement.style.display = "none";
        console.log("Valgt vejnavn:", vejnavn, " => henter detaljer for:", adgangsId);
        if (!adgangsId) {
          console.error("Ingen adgangsadresse.id => kan ikke slå vejkode op");
          return;
        }
        const detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
        console.log("detailUrl:", detailUrl);
        try {
          const detailResp = await fetch(detailUrl);
          const detailData = await detailResp.json();
          console.log("Detaljeret adressedata:", detailData);
          const roadSelection = {
            vejnavn: vejnavn,
            kommunekode: detailData.kommunekode,
            vejkode: detailData.vejkode,
            husnummerId: detailData.id
          };
          const geometry = await getNavngivenvejKommunedelGeometry(detailData.id);
          roadSelection.geometry = geometry;
          if (inputField.id === "vej1") {
            selectedRoad1 = roadSelection;
          } else {
            selectedRoad2 = roadSelection;
          }
          console.log("Selected road:", roadSelection);
        } catch (err) {
          console.error("Fejl i fetch /adgangsadresser/{id}:", err);
        }
      });
      listElement.appendChild(li);

      if (which === "vej1") {
        vej1Items.push(li);
      } else {
        vej2Items.push(li);
      }
    });
    listElement.style.display = data.length > 0 ? "block" : "none";

  } catch (err) {
    console.error("Fejl i doSearchRoad:", err);
  }
}

/***************************************************
 * doSearch => kombinerer adresser, stednavne, strandposter
 ***************************************************/
function doSearch(query, listElement) {
  const addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  const stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;
  const strandPromise = map.hasLayer(redningsnrLayer) ? doSearchStrandposter(query) : Promise.resolve([]);

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
    searchItems = [];
    searchCurrentIndex = -1;

    // Adresser
    const addrResults = (addrData || []).map(item => ({
      type: "adresse",
      tekst: item.tekst,
      adgangsadresse: item.adgangsadresse
    }));

    // Stednavne
    let stedResults = [];
    if (stedData) {
      if (Array.isArray(stedData.results)) {
        stedResults = stedData.results.map(result => ({
          type: "stednavn",
          navn: result.visningstekst || result.navn,
          bbox: result.bbox || null,
          geometry: result.geometry
        }));
      } else if (Array.isArray(stedData)) {
        stedResults = stedData.map(result => ({
          type: "stednavn",
          navn: result.visningstekst || result.skrivemaade_officiel,
          bbox: result.bbox || null,
          geometry: result.geometri
        }));
      }
    }

    // Strandposter
    const combined = [...addrResults, ...stedResults, ...strandData];

    // Sorter => stednavne øverst
    combined.sort((a, b) => {
      if (a.type === "stednavn" && b.type === "adresse") return -1;
      if (a.type === "adresse" && b.type === "stednavn") return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });

    // Opret li for hver
    combined.forEach(obj => {
      const li = document.createElement("li");
      if (obj.type === "strandpost") {
        li.innerHTML = `🛟 ${obj.tekst}`;
      } else if (obj.type === "adresse") {
        li.innerHTML = `🏠 ${obj.tekst}`;
      } else if (obj.type === "stednavn") {
        li.innerHTML = `📍 ${obj.navn}`;
      }
      li.addEventListener("click", function() {
        // Hvis adresse => hent fuld data
        if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              // Koordinater i addressData.adgangspunkt.koordinater => [lon, lat]
              const [lon, lat] = addressData.adgangspunkt.koordinater;
              console.log("Placering (fra addressData):", lat, lon);

              // Vis koordinater i bund
              document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
              document.getElementById("coordinateBox").style.display = "block";

              // Zoom/markér
              placeMarkerAndZoom([lat, lon], obj.tekst);

              // Opdater infoBox (samme funktion som ved klik på kort)
              updateInfoBox(addressData, lat, lon);

              // Ryd lister
              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        }
        else if (obj.type === "stednavn" && obj.bbox && obj.bbox.coordinates && obj.bbox.coordinates[0] && obj.bbox.coordinates[0].length > 0) {
          const [x, y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([x, y], obj.navn);
        }
        else if (obj.type === "strandpost") {
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          if (currentMarker) {
            const props = obj.feature.properties;
            const ppl = props.ppl || "N/A";
            const opdateretDato = new Date().toLocaleString();
            currentMarker.bindPopup(`
              <strong>${obj.tekst}</strong><br>
              PPL: ${ppl}<br>
              Opdateret: ${opdateretDato}
            `).openPopup();
          }
        }
      });
      listElement.appendChild(li);
      searchItems.push(li);
    });
    listElement.style.display = combined.length > 0 ? "block" : "none";
  })
  .catch(err => console.error("Fejl i doSearch:", err));
}

/***************************************************
 * getNavngivenvejKommunedelGeometry
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  const url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  console.log("Henter navngivenvejkommunedel-data:", url);
  try {
    const r = await fetch(url);
    const data = await r.json();
    console.log("Svar fra navngivenvejkommunedel:", data);
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first.navngivenVej && first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje) {
        const wktString = first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje;
        console.log("Fandt WKT streng:", wktString);
        const geojson = wellknown.parse(wktString);
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
function placeMarkerAndZoom(coords, displayText) {
  console.log("placeMarkerAndZoom kaldt med:", coords, displayText);
  // Tjek om coords er UTM
  if (coords[0] > 90 || coords[1] > 90) {
    const converted = convertToWGS84(coords[0], coords[1]);
    coords = converted;
  }
  const lat = coords[0];
  const lon = coords[1];
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);

  // Sæt adressen i infoboks "address"
  document.getElementById("address").textContent = displayText;
  // Streetview opdateres
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  // Vis infobox
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej => henter statsvej fra geocloud
 ***************************************************/
async function checkForStatsvej(lat, lon) {
  console.log("Koordinater sendt til Geocloud:", lat, lon);
  const [utmX, utmY] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
  const buffer = 100;
  const bbox = `${utmX - buffer},${utmY - buffer},${utmX + buffer},${utmY + buffer}`;
  const url = `https://geocloud.vd.dk/CVF/wms?
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
    const resp = await fetch(url);
    const textData = await resp.text();
    console.log("Rå server response:", textData);
    if (textData.startsWith("Results")) {
      console.warn("Modtaget et tekst-svar, ikke JSON. Prøver at udtrække data...");
      const extractedData = parseTextResponse(textData);
      return extractedData;
    }
    const jsonData = JSON.parse(textData);
    console.log("JSON-parsed data:", jsonData);
    if (jsonData.features && jsonData.features.length > 0) {
      return jsonData.features[0].properties;
    } else {
      return null;
    }
  } catch (err) {
    console.error("Fejl ved hentning af vejdata:", err);
    return null;
  }
}

function parseTextResponse(text) {
  const lines = text.split("\n");
  const data = {};
  lines.forEach(line => {
    const parts = line.split(" = ");
    if (parts.length === 2) {
      const key = parts[0].trim();
      const value = parts[1].trim();
      data[key] = value;
    }
  });
  console.log("Parsed tekstbaserede data:", data);
  return data;
}

/***************************************************
 * Luk-knappen => #infoBox
 ***************************************************/
const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

/***************************************************
 * "Find X"-knap => intersection med Turf.js
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
  const line1 = turf.multiLineString(selectedRoad1.geometry.coordinates);
  const line2 = turf.multiLineString(selectedRoad2.geometry.coordinates);
  const intersection = turf.lineIntersect(line1, line2);
  console.log("Intersection result:", intersection);

  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];
    for (let i = 0; i < intersection.features.length; i++) {
      const feat = intersection.features[i];
      const coords = feat.geometry.coordinates;
      const [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);
      const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      console.log("Reverse geocoding for intersection:", revUrl);
      const revResp = await fetch(revUrl);
      const revData = await revResp.json();
      let popupText = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;
      const evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
      const notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}\\n${revData.postnr || ""} ${revData.postnrnavn || ""}`;
      popupText += `
        <br>
        <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
        <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
      `;
      const marker = L.marker([wgsLat, wgsLon]).addTo(map);
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

/***************************************************
 * Distance Options – Tegn cirkel med radius
 ***************************************************/
let currentCircle = null;
function toggleCircle(radius) {
  if (!currentMarker) {
    alert("Vælg venligst en adresse eller klik på kortet først.");
    return;
  }
  const latLng = currentMarker.getLatLng();
  if (currentCircle && currentCircle.getRadius() === radius) {
    map.removeLayer(currentCircle);
    currentCircle = null;
  } else {
    if (currentCircle) {
      map.removeLayer(currentCircle);
    }
    currentCircle = L.circle(latLng, {
      radius: radius,
      color: "blue",
      fillOpacity: 0.2
    }).addTo(map);
  }
}
document.getElementById("btn10").addEventListener("click", function() { toggleCircle(10000); });
document.getElementById("btn50").addEventListener("click", function() { toggleCircle(50000); });
document.getElementById("btn100").addEventListener("click", function() { toggleCircle(100000); });

/***************************************************
 * DOMContentLoaded => fokus på search
 ***************************************************/
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("search").focus();
});

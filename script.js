/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

// Cloudflare proxy til VD-reference
const VD_PROXY = "https://vd-proxy.anderskabel8.workers.dev";

/***************************************************
 * Utils
 ***************************************************/
function convertToWGS84(x, y) {
  // [x,y] er UTM (Easting, Northing). proj4 returnerer [lon,lat]
  const [lon, lat] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  return [lat, lon];
}

function copyToClipboard(str) {
  const finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr).catch(() => {});
}

function showCopyPopup(message) {
  const popup = document.createElement("div");
  popup.textContent = message;
  Object.assign(popup.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.7)",
    color: "white",
    padding: "10px 15px",
    borderRadius: "5px",
    zIndex: "1000"
  });
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 1500);
}

function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse") text = item.tekst || "";
  else if (item.type === "stednavn") text = item.navn || "";
  else if (item.type === "strandpost") text = item.tekst || "";

  const a = text.toLowerCase();
  const b = query.toLowerCase();
  if (a === b) return 0;
  if (a.startsWith(b)) return 1;
  if (a.includes(b)) return 2;
  return 3;
}

/***************************************************
 * 24h datacache markør til strandposter
 ***************************************************/
function getLastUpdated() { return localStorage.getItem("strandposterLastUpdated"); }
function setLastUpdated() { localStorage.setItem("strandposterLastUpdated", Date.now()); }
function shouldUpdateData() {
  const last = getLastUpdated();
  return !last || (Date.now() - parseInt(last, 10) > 86400000);
}

/***************************************************
 * Leaflet-kort & lag
 ***************************************************/
const map = L.map("map", {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

const osmLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur,© CVR API" }
).addTo(map);

const ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  { layers: "orto_foraar", format: "image/jpeg", transparent: false, version: "1.1.1", attribution: "Ortofoto © Kortforsyningen" }
);

const redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

const rutenummerLayer = L.tileLayer.wms("https://geocloud.vd.dk/VM/wms", {
  layers: "rutenummereret-vejnet",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "© Vejdirektoratet"
});

const falckAssLayer = L.geoJSON(null, {
  onEachFeature: (f, layer) => layer.bindPopup("<strong>" + (f.properties.tekst || "Falck Ass") + "</strong>"),
  style: () => ({ color: "orange" })
});
fetch("FalckStationer_data.json").then(r=>r.json()).then(d=>falckAssLayer.addData(d)).catch(()=>{});

const kommunegrænserLayer = L.geoJSON(null, {
  style: () => ({ color: "#3388ff", weight: 2, fillOpacity: 0 })
});
fetch("https://api.dataforsyningen.dk/kommuner?format=geojson")
  .then(r=>r.json()).then(d=>kommunegrænserLayer.addData(d)).catch(()=>{});

// DB-links “lag”
const dbSmsLayer     = L.layerGroup();
const dbJournalLayer = L.layerGroup();

// 25 km forskudt grænse
const border25Layer = L.layerGroup();
let originalBorderCoords = [];
fetch("dansk-tysk-grænse.geojson").then(r=>r.json()).then(g=>{
  originalBorderCoords = g.features[0].geometry.coordinates;
  const offsetCoords = originalBorderCoords.map(([lon,lat])=>{
    const [x,y]=proj4("EPSG:4326","EPSG:25832",[lon,lat]); const y2=y-25000;
    const [lon2,lat2]=proj4("EPSG:25832","EPSG:4326",[x,y2]); return [lat2,lon2];
  });
  L.polyline(offsetCoords,{color:"red",weight:2,dashArray:"5,5"}).addTo(border25Layer);
});
fetch("svensk-grænse.geojson").then(r=>r.json()).then(g=>{
  const swOffset = g.features[0].geometry.coordinates.map(([lon,lat])=>{
    const [x,y]=proj4("EPSG:4326","EPSG:25832",[lon,lat]); const y2=y+25000;
    const [lon2,lat2]=proj4("EPSG:25832","EPSG:4326",[x,y2]); return [lat2,lon2];
  });
  L.polyline(swOffset,{color:"red",weight:2,dashArray:"5,5"}).addTo(border25Layer);
});

// Ladestandere
const chargeMapLayer = L.layerGroup();

const baseMaps = { "OpenStreetMap": osmLayer, "Satellit": ortofotoLayer };
const overlayMaps = {
  "Strandposter": redningsnrLayer,
  "Falck Ass": falckAssLayer,
  "Kommunegrænser": kommunegrænserLayer,
  "DB SMS kort": dbSmsLayer,
  "DB Journal": dbJournalLayer,
  "25 km grænse": border25Layer,
  "Ladestandere": chargeMapLayer,
  "Rutenummereret vejnet": rutenummerLayer
};
L.control.layers(baseMaps, overlayMaps, { position: "topright" }).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

let currentMarker;

/***************************************************
 * Kommunedata (fra Kommuner.xlsx -> kommunedata.json)
 ***************************************************/
let kommuneInfo = {};
fetch("kommunedata.json").then(r=>r.json()).then(d=>{ kommuneInfo=d; }).catch(()=>{});

/***************************************************
 * Koordinatboks helpers
 ***************************************************/
function resetCoordinateBox() {
  const el = document.getElementById("coordinateBox");
  el.textContent = ""; el.style.display = "none";
}
function setCoordinateBox(lat, lon) {
  const el = document.getElementById("coordinateBox");
  const latFixed = lat.toFixed(6), lonFixed = lon.toFixed(6);
  el.innerHTML = `Koordinater: <span id="latVal">${latFixed}</span>, <span id="lonVal">${lonFixed}</span>`;
  el.style.display = "block";
  const latSpan = document.getElementById("latVal");
  const lonSpan = document.getElementById("lonVal");
  function copy() {
    latSpan.style.color = lonSpan.style.color = "red";
    navigator.clipboard.writeText(`${latFixed},${lonFixed}`).finally(()=>{
      setTimeout(()=>{ latSpan.style.color=""; lonSpan.style.color=""; }, 800);
    });
  }
  latSpan.onclick = copy; lonSpan.onclick = copy;
}

/***************************************************
 * Strandposter (lokal GeoJSON) – kun når laget tændes
 ***************************************************/
let allStrandposter = [];
let strandposterReady = false;

async function fetchAllStrandposter() {
  if (!shouldUpdateData() && allStrandposter.length) { strandposterReady = true; return; }

  // Prøv et par stier – brug den første der svarer OK
  const candidates = ["Strandposter.geojson", "Strandposter.json", "Strandposter"];
  let lastErr;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) { lastErr = new Error(r.statusText); continue; }
      const gj = await r.json();
      if (Array.isArray(gj.features)) {
        allStrandposter = gj.features;
        strandposterReady = true;
        setLastUpdated();
        return;
      }
    } catch (e) { lastErr = e; }
  }
  console.error("Kunne ikke hente strandposter lokalt:", lastErr);
}

// Hent data første gang STRANDPOSTER-laget tændes
map.on("overlayadd", async (e) => {
  if (e.layer === redningsnrLayer && allStrandposter.length === 0) {
    await fetchAllStrandposter();
  }
});

// Øvrige overlay-handlere
map.on("overlayadd", function(e) {
  if (e.layer === dbSmsLayer) {
    window.open("https://kort.dyrenesbeskyttelse.dk/db/dvc.nsf/kort","_blank");
    map.removeLayer(dbSmsLayer);
  } else if (e.layer === dbJournalLayer) {
    window.open("https://dvc.dyrenesbeskyttelse.dk/db/dvc.nsf/Efter%20journalnr?OpenView","_blank");
    map.removeLayer(dbJournalLayer);
  } else if (e.layer === chargeMapLayer) {
    if (!selectedRadius) {
      alert("Vælg radius først");
      chargeMapLayer.clearLayers();
      return;
    }
    chargeMapLayer.clearLayers();
    if (!currentMarker) return;
    const { lat, lng: lon } = currentMarker.getLatLng();
    const distKm = selectedRadius / 1000;
    fetch(
      "https://api.openchargemap.io/v3/poi/?output=json" +
      "&countrycode=DK&maxresults=10000" +
      `&latitude=${lat}&longitude=${lon}&distance=${distKm}&distanceunit=KM` +
      "&key=3c33b286-7067-426b-8e46-a727dd12f6f3"
    )
    .then(r=>r.json())
    .then(data=>{
      data.forEach(p=>{
        const la=p.AddressInfo?.Latitude, lo=p.AddressInfo?.Longitude;
        if (la && lo && currentMarker &&
            map.distance(currentMarker.getLatLng(), L.latLng(la, lo)) <= selectedRadius) {
          L.circleMarker([la,lo], { radius:8, color:"yellow", fillColor:"yellow", fillOpacity:1 })
           .addTo(chargeMapLayer);
        }
      });
    }).catch(()=>{});
  }
});

/***************************************************
 * Klik på kort => reverse geocoding => infobokse
 ***************************************************/
map.on("click", function(e) {
  const lat = e.latlng.lat, lon = e.latlng.lng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat,lon]).addTo(map);
  setCoordinateBox(lat, lon);
  const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  fetch(revUrl).then(r=>r.json()).then(data=>updateInfoBox(data,lat,lon)).catch(()=>{});
});

/***************************************************
 * updateInfoBox – adresse, kommune/politikreds, statsvej + km
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl   = document.getElementById("address");
  const extraInfoEl = document.getElementById("extra-info");
  const skråfotoLink= document.getElementById("skraafotoLink");
  const overlay     = document.getElementById("kommuneOverlay");

  let adresseStr, vejkode, kommunekode;
  let evaFormat, notesFormat;

  if (data.adgangsadresse) {
    adresseStr = data.adgangsadresse.adressebetegnelse ||
      `${data.adgangsadresse.vejnavn||""} ${data.adgangsadresse.husnr||""}, ${data.adgangsadresse.postnr||""} ${data.adgangsadresse.postnrnavn||""}`;
    evaFormat   = `${data.adgangsadresse.vejnavn||""},${data.adgangsadresse.husnr||""},${data.adgangsadresse.postnr||""}`;
    notesFormat = `${data.adgangsadresse.vejnavn||""} ${data.adgangsadresse.husnr||""}, ${data.adgangsadresse.postnr||""} ${data.adgangsadresse.postnrnavn||""}`;
    vejkode     = data.adgangsadresse.vejkode || "?";
    kommunekode = data.adgangsadresse.kommunekode || "?";
  } else if (data.adressebetegnelse) {
    adresseStr  = data.adressebetegnelse;
    evaFormat   = "?, ?, ?";
    notesFormat = "?, ?, ?";
    vejkode     = data.vejkode || "?";
    kommunekode = data.kommunekode || "?";
  } else {
    adresseStr  = `${data.vejnavn||"?"} ${data.husnr||""}, ${data.postnr||"?"} ${data.postnrnavn||""}`;
    evaFormat   = `${data.vejnavn||""},${data.husnr||""},${data.postnr||""}`;
    notesFormat = `${data.vejnavn||""} ${data.husnr||""}, ${data.postnr||""} ${data.postnrnavn||""}`;
    vejkode     = data.vejkode || "?";
    kommunekode = data.kommunekode || "?";
  }

  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = adresseStr;

  const actionsHtml = `
    <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${evaFormat}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Eva.Net</a>
    &nbsp;
    <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${notesFormat}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Notes</a>
  `;
  extraInfoEl.innerHTML = `<div id="info-actions" style="margin:6px 0;">${actionsHtml}</div><div id="info-meta"></div>`;
  const infoMetaEl = document.getElementById("info-meta");

  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "inline";
  skråfotoLink.onclick = (e)=>{ e.preventDefault(); copyToClipboard(adresseStr); showCopyPopup("Kopieret"); setTimeout(()=>window.open(skråfotoLink.href,"_blank"), 800); };

  overlay.textContent = `Kommunekode: ${kommunekode} | Vejkode: ${vejkode}`;
  overlay.style.display = "block";

  if (resultsList) resultsList.innerHTML = "";
  if (vej1List) vej1List.innerHTML = "";
  if (vej2List) vej2List.innerHTML = "";

  // Statsvej
  const statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");

  const vejstatus =
    statsvejData?.VEJSTATUS ?? statsvejData?.vejstatus ??
    statsvejData?.VEJ_STATUS ?? statsvejData?.status ?? null;

  const vejmyndighed =
    statsvejData?.VEJMYNDIGHED ?? statsvejData?.vejmyndighed ??
    statsvejData?.VEJMYND ?? statsvejData?.VEJMND ?? null;

  const hasStatsvej =
    statsvejData && (
      statsvejData.ADM_NR != null ||
      statsvejData.FORGRENING != null ||
      (statsvejData.BETEGNELSE && String(statsvejData.BETEGNELSE).trim() !== "") ||
      (statsvejData.VEJTYPE && String(statsvejData.VEJTYPE).trim() !== "")
    );

  const showBox = hasStatsvej || vejstatus || vejmyndighed;

  if (showBox) {
    let html = "";
    if (hasStatsvej) {
      html +=
        `<strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>` +
        `<strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>` +
        `<strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>` +
        `<strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>` +
        `<strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}`;
    }
    const beskrivelse = statsvejData.BESKRIVELSE ?? statsvejData.beskrivelse ?? null;
    if (beskrivelse && String(beskrivelse).trim() !== "") {
      if (html) html += "<br>";
      html += `<strong>Beskrivelse:</strong> ${beskrivelse}`;
    }
    if (vejstatus)     { if (html) html += "<br>"; html += `<strong>Vejstatus:</strong> ${vejstatus}`; }
    if (vejmyndighed)  { if (html) html += "<br>"; html += `<strong>Vejmyndighed:</strong> ${vejmyndighed}`; }

    statsvejInfoEl.innerHTML = html;

    if (hasStatsvej) {
      const kmText = await getKmAtPoint(lat, lon);
      if (kmText) statsvejInfoEl.innerHTML += `<br><strong>Km:</strong> ${kmText}`;
    }
    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }

  document.getElementById("infoBox").style.display = "block";

  // Kommune-info
  if (kommunekode !== "?") {
    try {
      const komResp = await fetch(`https://api.dataforsyningen.dk/kommuner/${kommunekode}`);
      if (komResp.ok) {
        const komData = await komResp.json();
        const kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          const info = kommuneInfo[kommunenavn];
          const doedeDyr  = info["Døde dyr"];
          const gaderVeje = info["Gader og veje"];
          const link      = info.gemLink;
          infoMetaEl.innerHTML += (link
            ? `Kommune: <a href="${link}" target="_blank">${kommunenavn}</a> | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`
            : `Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`);
        }
      }
    } catch {}
  }

  const politikredsNavn = data.politikredsnavn ?? data.adgangsadresse?.politikredsnavn ?? null;
  const politikredsKode = data.politikredskode ?? data.adgangsadresse?.politikredskode ?? null;
  if (politikredsNavn || politikredsKode) {
    const polititekst = politikredsKode ? `${politikredsNavn || ""} (${politikredsKode})` : `${politikredsNavn}`;
    infoMetaEl.innerHTML += `<br>Politikreds: ${polititekst}`;
  }
}

/***************************************************
 * Inputs + lister
 ***************************************************/
const searchInput = document.getElementById("search");
const clearBtn    = document.getElementById("clearSearch");
const resultsList = document.getElementById("results");
const vej1Input   = document.getElementById("vej1");
const vej2Input   = document.getElementById("vej2");
const vej1List    = document.getElementById("results-vej1");
const vej2List    = document.getElementById("results-vej2");

function addClearButton(inputElement, listElement) {
  const btn = document.createElement("span");
  btn.innerHTML = "&times;";
  btn.classList.add("clear-button");
  inputElement.parentElement.appendChild(btn);
  inputElement.addEventListener("input", () => btn.style.display = inputElement.value.length>0 ? "inline" : "none");
  btn.addEventListener("click", () => { inputElement.value=""; listElement.innerHTML=""; btn.style.display="none"; resetCoordinateBox(); });
  inputElement.addEventListener("keydown", (e)=>{ if (e.key==="Backspace" && inputElement.value.length===0){ listElement.innerHTML=""; resetCoordinateBox(); }});
  btn.style.display = "none";
}
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

// keyboard navigation state
let searchItems=[], searchCurrentIndex=-1;
let vej1Items=[], vej1CurrentIndex=-1;
let vej2Items=[], vej2CurrentIndex=-1;

/***************************************************
 * Søgefelt (#search)
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

  // Brugeren kan skrive “lat, lon”
  const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
  if (coordRegex.test(txt)) {
    const [, latS, lonS] = txt.match(coordRegex);
    const latNum = parseFloat(latS), lonNum = parseFloat(lonS);
    const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl).then(r=>r.json()).then(data=>{
      resultsList.innerHTML = "";
      placeMarkerAndZoom([latNum,lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
      setCoordinateBox(latNum, lonNum);
      updateInfoBox(data, latNum, lonNum);
    }).catch(()=>{});
  }
});

searchInput.addEventListener("keydown", function(e) {
  if (searchItems.length===0) return;
  if (e.key==="ArrowDown"){ e.preventDefault(); searchCurrentIndex=(searchCurrentIndex+1)%searchItems.length; highlightSearchItem(); }
  else if (e.key==="ArrowUp"){ e.preventDefault(); searchCurrentIndex=(searchCurrentIndex+searchItems.length-1)%searchItems.length; highlightSearchItem(); }
  else if (e.key==="Enter"){ e.preventDefault(); if (searchCurrentIndex>=0){ searchItems[searchCurrentIndex].click(); } }
  else if (e.key==="Backspace" && searchInput.value.length===0){ resetCoordinateBox(); }
});
function highlightSearchItem(){
  searchItems.forEach(li=>li.classList.remove("highlight"));
  if (searchCurrentIndex>=0 && searchCurrentIndex<searchItems.length){
    searchItems[searchCurrentIndex].classList.add("highlight");
  }
}
clearBtn.addEventListener("click", resetInfoBox);
function resetInfoBox(){
  document.getElementById("extra-info").textContent="";
  document.getElementById("skraafotoLink").style.display="none";
}

/***************************************************
 * Vej1/Vej2 (autocomplete via adgangsadresser)
 ***************************************************/
let selectedRoad1=null, selectedRoad2=null;

function doSearchRoad(query, listElement, inputField, which) {
  const addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(addrUrl).then(r=>r.json()).then(data=>{
    listElement.innerHTML=""; if (which==="vej1"){ vej1Items=[]; vej1CurrentIndex=-1; } else { vej2Items=[]; vej2CurrentIndex=-1; }
    data.sort((a,b)=>a.tekst.localeCompare(b.tekst));
    const unique=new Set();
    data.forEach(item=>{
      const vejnavn=item.adgangsadresse?.vejnavn || "Ukendt vej";
      const kommune=item.adgangsadresse?.postnrnavn || "Ukendt kommune";
      const postnr=item.adgangsadresse?.postnr || "?";
      const adgangsId=item.adgangsadresse?.id || null;
      const key=`${vejnavn}-${postnr}`; if (unique.has(key)) return; unique.add(key);
      const li=document.createElement("li"); li.textContent=`${vejnavn}, ${kommune} (${postnr})`;
      li.addEventListener("click", ()=>{
        inputField.value=vejnavn; listElement.innerHTML=""; listElement.style.display="none";
        if (!adgangsId) return;
        fetch(`https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`)
          .then(r=>r.json())
          .then(async detail=>{
            const sel = {
              vejnavn: vejnavn,
              kommunekode: detail.kommunekode,
              vejkode: detail.vejkode,
              husnummerId: detail.id,
              geometry: await getNavngivenvejKommunedelGeometry(detail.id)
            };
            if (inputField.id==="vej1") selectedRoad1=sel; else if (inputField.id==="vej2") selectedRoad2=sel;
          }).catch(()=>{});
      });
      listElement.appendChild(li);
      (which==="vej1"?vej1Items:vej2Items).push(li);
    });
    listElement.style.display = data.length>0 ? "block" : "none";
  }).catch(()=>{});
}

vej1Input.addEventListener("input", function(){
  const txt=vej1Input.value.trim();
  if (txt.length<2){ vej1List.innerHTML=""; vej1List.style.display="none"; vej1Items=[]; return; }
  doSearchRoad(txt, vej1List, vej1Input, "vej1");
});
vej2Input.addEventListener("input", function(){
  const txt=vej2Input.value.trim();
  if (txt.length<2){ vej2List.innerHTML=""; vej2List.style.display="none"; vej2Items=[]; return; }
  doSearchRoad(txt, vej2List, vej2Input, "vej2");
});

/***************************************************
 * Strandposter – lokal filtrering (kun når laget er tændt)
 ***************************************************/
function filterStrandposter(query) {
  if (!(map.hasLayer(redningsnrLayer) && strandposterReady)) return [];
  const q=(query||"").toLowerCase();
  return (allStrandposter||[])
    .map(f=>{
      const p=f.properties||{}, g=f.geometry||{};
      if (g.type!=="Point" || !Array.isArray(g.coordinates)) return null;
      const [lon,lat]=g.coordinates;
      const tekst = p.tekst ?? p.navn ?? p.label ?? (p.nr!=null ? `Strandpost ${p.nr}` : null) ?? "Strandpost";
      return { type:"strandpost", tekst, lat, lon };
    })
    .filter(o=>o && o.tekst && o.tekst.toLowerCase().includes(q));
}

/***************************************************
 * doSearch – adresser + stednavne + (evt.) strandposter
 ***************************************************/
function doSearch(query, listElement){
  const addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  const stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;

  const strandData = filterStrandposter(query);

  Promise.all([
    fetch(addrUrl).then(r=>r.json()).catch(()=>[]),
    fetch(stedUrl).then(r=>r.json()).catch(()=>({}))
  ])
  .then(([addrData, stedData])=>{
    listElement.innerHTML=""; searchItems=[]; searchCurrentIndex=-1;

    const addrResults = (addrData||[]).map(item=>({ type:"adresse", tekst:item.tekst, adgangsadresse:item.adgangsadresse }));

    let stedResults=[];
    if (Array.isArray(stedData?.results)) {
      stedResults = stedData.results.map(r=>({ type:"stednavn", navn:r.visningstekst||r.navn, bbox:r.bbox||null, geometry:r.geometry }));
    } else if (Array.isArray(stedData)) {
      stedResults = stedData.map(r=>({ type:"stednavn", navn:r.visningstekst||r.skrivemaade_officiel, bbox:r.bbox||null, geometry:r.geometri }));
    }

    const combined = [...addrResults, ...stedResults, ...strandData];

    // Tip: hvis brugeren skriver noget der ligner en strandpost, men laget er slukket
    const looksLikeStrand = /^[A-Za-z]?\d{2,4}$/i.test(query) || /strandpost/i.test(query);
    if (looksLikeStrand && !map.hasLayer(redningsnrLayer)) {
      combined.push({ type:"__hint__", tekst:'Tænd laget “Strandposter” for at søge i strandposter.' });
    }

    combined.sort((a,b)=>{
      if (a.type==="stednavn" && b.type==="adresse") return -1;
      if (a.type==="adresse" && b.type==="stednavn") return 1;
      return getSortPriority(a, query) - getSortPriority(b, query);
    });

    combined.forEach(obj=>{
      const li=document.createElement("li");

      if (obj.type==="__hint__"){
        li.innerHTML=`ℹ️ ${obj.tekst}`;
        li.style.color="#666"; li.style.cursor="default";
        listElement.appendChild(li); searchItems.push(li); return;
      }

      if (obj.type==="strandpost") li.innerHTML = `🛟 ${obj.tekst}`;
      else if (obj.type==="adresse") li.innerHTML = `🏠 ${obj.tekst}`;
      else if (obj.type==="stednavn") li.innerHTML = `📍 ${obj.navn}`;

      li.addEventListener("click", function(){
        if (obj.type==="adresse" && obj.adgangsadresse?.id){
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r=>r.json()).then(addressData=>{
              const [lon,lat]=addressData.adgangspunkt.koordinater;
              setCoordinateBox(lat, lon); placeMarkerAndZoom([lat,lon], obj.tekst);
              const revUrl=`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
              fetch(revUrl).then(r=>r.json()).then(rd=>updateInfoBox(rd,lat,lon)).catch(()=>{});
              resultsList.innerHTML=""; vej1List.innerHTML=""; vej2List.innerHTML="";
            }).catch(()=>{});
        }
        else if (obj.type==="stednavn" && obj.bbox?.coordinates?.[0]?.length>0){
          const [x,y] = obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([x,y], obj.navn);
          listElement.innerHTML=""; listElement.style.display="none";
        }
        else if (obj.type==="stednavn" && obj.geometry?.coordinates){
          const coordsArr = Array.isArray(obj.geometry.coordinates[0]) ? obj.geometry.coordinates[0] : obj.geometry.coordinates;
          placeMarkerAndZoom(coordsArr, obj.navn); // håndterer UTM i placeMarkerAndZoom
          listElement.innerHTML=""; listElement.style.display="none";
        }
        else if (obj.type==="strandpost"){
          setCoordinateBox(obj.lat, obj.lon);
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          listElement.innerHTML=""; listElement.style.display="none";
          const marker=currentMarker;
          const revUrl=`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`;
          fetch(revUrl).then(r=>r.json()).then(revData=>{
            const vejnavn = revData?.adgangsadresse?.vejnavn || revData?.vejnavn || "?";
            const husnr   = revData?.adgangsadresse?.husnr || revData?.husnr || "";
            const postnr  = revData?.adgangsadresse?.postnr || revData?.postnr || "?";
            const postnavn= revData?.adgangsadresse?.postnrnavn || revData?.postnrnavn || "";
            const adr     = `${vejnavn} ${husnr}, ${postnr} ${postnavn}`;
            const eva     = `${vejnavn},${husnr},${postnr}`;
            const notes   = `${vejnavn} ${husnr}, ${postnr} ${postnavn}`;
            marker.bindPopup(`
              <strong>${obj.tekst}</strong><br>${adr}<br>
              <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${eva}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Eva.Net</a>
              &nbsp;
              <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${notes}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Notes</a>
            `).openPopup();
            marker.on("popupclose", function(){
              map.removeLayer(marker); currentMarker=null;
              document.getElementById("infoBox").style.display="none";
              document.getElementById("statsvejInfoBox").style.display="none";
              resetCoordinateBox(); resultsList.innerHTML="";
            });
          }).catch(()=>{ marker.bindPopup(`<strong>${obj.tekst}</strong><br>(Reverse geocoding fejlede)`).openPopup(); });
        }
      });

      listElement.appendChild(li);
      searchItems.push(li);
    });

    listElement.style.display = combined.length>0 ? "block" : "none";
  })
  .catch(()=>{});
}

/***************************************************
 * getNavngivenvejKommunedelGeometry
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId){
  const url=`https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  try{
    const r=await fetch(url); const data=await r.json();
    if (Array.isArray(data) && data.length>0){
      const first=data[0];
      const wktString = first?.navngivenVej?.vejnavnebeliggenhed_vejnavnelinje;
      if (wktString){ return wellknown.parse(wktString); }
    }
  }catch(e){}
  return null;
}

/***************************************************
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom(coords, displayText){
  if (coords[0]>90 || coords[1]>90) coords = convertToWGS84(coords[0], coords[1]);
  const lat=coords[0], lon=coords[1];
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat,lon]).addTo(map);
  map.setView([lat,lon], 16);
  document.getElementById("address").textContent = displayText;
  document.getElementById("streetviewLink").href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * Statsvej (Geocloud) + km
 ***************************************************/
async function checkForStatsvej(lat, lon){
  const [utmX, utmY] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
  const b=100, bbox=`${utmX-b},${utmY-b},${utmX+b},${utmY+b}`;
  const url=`https://geocloud.vd.dk/CVF/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&INFO_FORMAT=application/json&TRANSPARENT=true&LAYERS=CVF:veje&QUERY_LAYERS=CVF:veje&SRS=EPSG:25832&WIDTH=101&HEIGHT=101&BBOX=${bbox}&X=50&Y=50`;
  try{
    const resp=await fetch(url); const text=await resp.text();
    if (text.startsWith("Results")) return parseTextResponse(text);
    const json=JSON.parse(text);
    return json.features?.[0]?.properties || {};
  }catch(e){ return {}; }
}
function parseTextResponse(text){
  const data={}; text.split("\n").forEach(line=>{
    const i=line.indexOf(" = "); if (i>0){ data[line.slice(0,i).trim()] = line.slice(i+3).trim(); }
  }); return data;
}

async function getKmAtPoint(lat, lon){
  try{
    const [x,y]=proj4("EPSG:4326","EPSG:25832",[lon,lat]);
    const stats = await checkForStatsvej(lat, lon);
    const roadNumber = stats.ADM_NR ?? stats.adm_nr ?? null;
    const roadPart   = stats.FORGRENING ?? stats.forgrening ?? 0;
    if (!roadNumber) return "";
    const url = `${VD_PROXY}/reference?geometry=POINT(${x}%20${y})&srs=EPSG:25832&roadNumber=${roadNumber}&roadPart=${roadPart}&format=json`;
    const resp=await fetch(url,{cache:"no-store"}); if (!resp.ok) return "";
    const data=await resp.json();
    const props = data?.properties ?? data?.features?.[0]?.properties ?? data;
    const from=props?.from??props?.FROM??props?.fra??null;
    const to=props?.to??props?.TO??props?.til??null;
    const kmtText = from?.kmtText ?? from?.KMTTEXT ?? to?.kmtText ?? to?.KMTTEXT ?? props?.kmtText ?? props?.KMTEKST ?? props?.kmtekst ?? props?.at?.kmtText ?? null;
    if (kmtText) return String(kmtText);
    const km=(from?.km ?? props?.km ?? props?.KM ?? null);
    const m =(from?.m  ?? props?.m  ?? props?.M  ?? props?.km_meter ?? null);
    if (km!=null && m!=null) return `${km}/${String(m).padStart(4,"0")}`;
    return "";
  }catch(e){ return ""; }
}

/***************************************************
 * Info-boks close
 ***************************************************/
const statsvejInfoBox = document.getElementById("statsvejInfoBox");
document.getElementById("statsvejCloseBtn").addEventListener("click", ()=>{
  statsvejInfoBox.style.display="none";
  document.getElementById("infoBox").style.display="none";
  resetCoordinateBox();
  if (currentMarker){ map.removeLayer(currentMarker); currentMarker=null; }
});
document.getElementById("infoCloseBtn").addEventListener("click", ()=>{
  document.getElementById("infoBox").style.display="none";
  document.getElementById("statsvejInfoBox").style.display="none";
  if (currentMarker){ map.removeLayer(currentMarker); currentMarker=null; }
  resetCoordinateBox(); resultsList.innerHTML=""; document.getElementById("kommuneOverlay").style.display="none";
});

/***************************************************
 * Find X (Turf.js)
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async ()=>{
  if (!selectedRoad1 || !selectedRoad2){ alert("Vælg venligst to veje først."); return; }
  if (!selectedRoad1.geometry || !selectedRoad2.geometry){ alert("Geometri ikke tilgængelig for en eller begge veje."); return; }
  const line1=turf.multiLineString(selectedRoad1.geometry.coordinates);
  const line2=turf.multiLineString(selectedRoad2.geometry.coordinates);
  const intersection=turf.lineIntersect(line1,line2);
  if (intersection.features.length===0){ alert("De valgte veje krydser ikke hinanden."); return; }
  const latLngs=[];
  for (const feat of intersection.features){
    const [x,y]=feat.geometry.coordinates;
    const [wgsLon,wgsLat]=proj4("EPSG:25832","EPSG:4326",[x,y]);
    latLngs.push([wgsLat,wgsLon]);
    const revUrl=`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
    const marker=L.marker([wgsLat,wgsLon]).addTo(map);
    try{
      const rd=await fetch(revUrl).then(r=>r.json());
      const adr = `${rd.vejnavn || "Ukendt"} ${rd.husnr || ""}, ${rd.postnr || "?"} ${rd.postnrnavn || ""}`;
      const eva = `${rd.vejnavn || ""},${rd.husnr || ""},${rd.postnr || ""}`;
      const notes = `${rd.vejnavn || ""} ${rd.husnr || ""}, ${rd.postnr || ""} ${rd.postnrnavn || ""}`;
      marker.bindPopup(`
        ${adr}<br>
        <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${eva}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Eva.Net</a>
        &nbsp;
        <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${notes}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Notes</a>
      `).openPopup();
    }catch{
      marker.bindPopup(`(${wgsLat.toFixed(6)}, ${wgsLon.toFixed(6)})<br>Reverse geocoding fejlede.`).openPopup();
    }
    setCoordinateBox(wgsLat, wgsLon);
    marker.on("popupclose", ()=>map.removeLayer(marker));
  }
  if (latLngs.length===1) map.setView(latLngs[0],16); else map.fitBounds(latLngs);
});

/***************************************************
 * Distance Options + ladestandere
 ***************************************************/
let currentCircle=null, selectedRadius=null;
function toggleCircle(radius){
  selectedRadius=radius;
  if (!currentMarker){ alert("Vælg venligst en adresse eller klik på kortet først."); return; }
  const latLng=currentMarker.getLatLng();
  if (currentCircle && currentCircle.getRadius()===radius){
    map.removeLayer(currentCircle); currentCircle=null; selectedRadius=null;
    if (map.hasLayer(chargeMapLayer)) map.removeLayer(chargeMapLayer);
  }else{
    if (currentCircle) map.removeLayer(currentCircle);
    currentCircle=L.circle(latLng,{radius, color:"blue", fillOpacity:0.2}).addTo(map);
    if (map.hasLayer(chargeMapLayer)) map.fire("overlayadd", { layer: chargeMapLayer });
  }
}
document.getElementById("btn10").addEventListener("click", ()=>toggleCircle(10000));
document.getElementById("btn25").addEventListener("click", ()=>toggleCircle(25000));
document.getElementById("btn50").addEventListener("click", ()=>toggleCircle(50000));
document.getElementById("btn100").addEventListener("click", ()=>toggleCircle(100000));

document.addEventListener("DOMContentLoaded", ()=>{ document.getElementById("search").focus(); });

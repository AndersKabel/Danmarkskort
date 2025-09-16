/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

// Cloudflare proxy til VD-reference
const VD_PROXY = "https://vd-proxy.anderskabel8.workers.dev";

function convertToWGS84(x, y) {
  // UTM -> WGS84, returnér [lat, lon]
  const [lon, lat] = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  return [lat, lon];
}

/***************************************************
 * Hjælpere: clipboard + “kopieret” popup
 ***************************************************/
function copyToClipboard(str) {
  const finalStr = String(str).replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr).catch(()=>{});
}

function showCopyPopup(message) {
  const popup = document.createElement("div");
  popup.textContent = message;
  Object.assign(popup.style, {
    position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.7)", color: "#fff", padding: "10px 15px",
    borderRadius: "5px", zIndex: 1000
  });
  document.body.appendChild(popup);
  setTimeout(()=>popup.remove(),1500);
}

/***************************************************
 * Sorteringsprioritet til søgeresultater
 ***************************************************/
function getSortPriority(item, query) {
  const q = (query||"").toLowerCase();
  const t = (item.type==="adresse"   ? item.tekst
           : item.type==="stednavn"  ? item.navn
           : item.type==="strandpost"? item.tekst
           : "")?.toLowerCase() || "";

  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q))  return 2;
  return 3;
}

/***************************************************
 * Kort + lag
 ***************************************************/
const map = L.map("map", { center:[56,10], zoom:7, zoomControl:false });

const osmLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur,© CVR API" }
).addTo(map);

const ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  { layers:"orto_foraar", format:"image/jpeg", transparent:false, version:"1.1.1", attribution:"Ortofoto © Kortforsyningen" }
);

// Strandposter (WMS synligt lag – søgning sker i lokal GeoJSON)
const redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers:"Redningsnummer", format:"image/png", transparent:true, version:"1.3.0", attribution:"Data: redningsnummer.dk"
});

// Rutenummereret vejnet
const rutenummerLayer = L.tileLayer.wms("https://geocloud.vd.dk/VM/wms", {
  layers:"rutenummereret-vejnet", format:"image/png", transparent:true, version:"1.3.0", attribution:"© Vejdirektoratet"
});

// Falck Ass (lokal GeoJSON)
const falckAssLayer = L.geoJSON(null, {
  onEachFeature: (feature, layer) => {
    const tekst = feature.properties?.tekst || "Falck Ass";
    layer.bindPopup("<strong>"+tekst+"</strong>");
  },
  style: ()=>({ color:"orange" })
});
fetch("FalckStationer_data.json")
  .then(r=>r.json())
  .then(g=>falckAssLayer.addData(g))
  .catch(err=>console.error("Falck Ass fejl:",err));

// Kommunegrænser
const kommunegrænserLayer = L.geoJSON(null, {
  style:()=>({ color:"#3388ff", weight:2, fillOpacity:0 })
});
fetch("https://api.dataforsyningen.dk/kommuner?format=geojson")
  .then(r=>r.json())
  .then(g=>kommunegrænserLayer.addData(g))
  .catch(err=>console.error("Kommunegrænser fejl:",err));

// Diverse “tomt” lag til knapper/åbn-link
const dbSmsLayer     = L.layerGroup();
const dbJournalLayer = L.layerGroup();

// 25 km grænselag
const border25Layer  = L.layerGroup();

// Ladestandere
const chargeMapLayer = L.layerGroup();

// 25 km fra DK-DE grænsen
let originalBorderCoords = [];
fetch("dansk-tysk-grænse.geojson").then(r=>r.json()).then(g=>{
  originalBorderCoords = g.features[0].geometry.coordinates;
  const offset = originalBorderCoords.map(([lon,lat])=>{
    let [x,y] = proj4("EPSG:4326","EPSG:25832",[lon,lat]); y -= 25000;
    [lon,lat] = proj4("EPSG:25832","EPSG:4326",[x,y]); return [lat,lon];
  });
  L.polyline(offset,{color:"red",weight:2,dashArray:"5,5"}).addTo(border25Layer);
});

// 25 km fra DK-SE (LineString)
fetch("svensk-grænse.geojson").then(r=>r.json()).then(g=>{
  const coords = g.features[0].geometry.coordinates;
  const offset = coords.map(([lon,lat])=>{
    let [x,y] = proj4("EPSG:4326","EPSG:25832",[lon,lat]); y += 25000;
    [lon,lat] = proj4("EPSG:25832","EPSG:4326",[x,y]); return [lat,lon];
  });
  L.polyline(offset,{color:"red",weight:2,dashArray:"5,5"}).addTo(border25Layer);
});

const baseMaps = {
  "OpenStreetMap": osmLayer,
  "Satellit": ortofotoLayer
};
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

L.control.layers(baseMaps, overlayMaps, { position:"topright" }).addTo(map);
L.control.zoom({ position:"bottomright" }).addTo(map);

let currentMarker = null;

/***************************************************
 * Kommunedata (til info-boksen)
 ***************************************************/
let kommuneInfo = {};
fetch("kommunedata.json")
  .then(r=>r.json())
  .then(d=>{ kommuneInfo = d; })
  .catch(err=>console.error("kommunedata.json fejl:",err));

/***************************************************
 * Koordinat-boks
 ***************************************************/
function resetCoordinateBox() {
  const el = document.getElementById("coordinateBox");
  el.textContent = ""; el.style.display = "none";
}
function setCoordinateBox(lat, lon) {
  const el = document.getElementById("coordinateBox");
  const la = Number(lat).toFixed(6), lo = Number(lon).toFixed(6);
  el.innerHTML = `Koordinater: <span id="latVal">${la}</span>, <span id="lonVal">${lo}</span>`;
  el.style.display = "block";
  const latSpan = document.getElementById("latVal");
  const lonSpan = document.getElementById("lonVal");
  function clickHandler(){
    latSpan.style.color = lonSpan.style.color = "red";
    navigator.clipboard.writeText(`${la},${lo}`).finally(()=>{
      setTimeout(()=>{latSpan.style.color=""; lonSpan.style.color="";},1000);
    });
  }
  latSpan.onclick = clickHandler;
  lonSpan.onclick = clickHandler;
}

/***************************************************
 * STRANDPOSTER – lokal GeoJSON + søgning
 ***************************************************/
let allStrandposter = [];
let strandposterReady = false;

function fetchAllStrandposter() {
  const localUrl = "Strandposter";
  return fetch(localUrl)
    .then(resp=>resp.json())
    .then(geojson=>{
      if (geojson?.features) {
        allStrandposter = geojson.features;
        strandposterReady = true;
      }
    })
    .catch(err=>console.error("Strandposter (lokal) fejl:",err));
}

// Hent data første gang laget tændes (robust check)
map.on("overlayadd", (event)=>{
  if (event.layer === redningsnrLayer || event.name === "Strandposter") {
    if (allStrandposter.length === 0) fetchAllStrandposter();
  }
});

/** klient-side søgning i allStrandposter (samme som din fungerende) */
function doSearchStrandposter(query) {
  const q = (query||"").toLowerCase();
  return new Promise((resolve)=>{
    const run = ()=>{
      const out = allStrandposter
        .filter(f => String(f?.properties?.StrandNr || "").toLowerCase().includes(q))
        .map(f=>{
          const rednr = f.properties?.StrandNr;
          const tekst = `Redningsnummer: ${rednr}`;
          const coords = f.geometry?.coordinates || [];
          let lat, lon;
          if (coords[0] > 90 || coords[1] > 90) [lat,lon] = convertToWGS84(coords[0],coords[1]);
          else { lon = coords[0]; lat = coords[1]; }
          return { type:"strandpost", tekst, lat, lon, feature:f };
        });
      resolve(out);
    };
    if (allStrandposter.length === 0) fetchAllStrandposter().then(run).catch(()=>resolve([]));
    else run();
  });
}

/***************************************************
 * Klik på kort => reverse geocoding => opdater sidepanel
 ***************************************************/
map.on("click", (e)=>{
  const lat = e.latlng.lat, lon = e.latlng.lng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat,lon]).addTo(map);
  setCoordinateBox(lat,lon);

  const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  fetch(revUrl).then(r=>r.json()).then(data=>updateInfoBox(data,lat,lon))
    .catch(err=>console.error("Reverse fejl:",err));
});

/***************************************************
 * updateInfoBox – adresse + kommune/links/statsvej
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");
  const overlay        = document.getElementById("kommuneOverlay");

  let adresseStr, vejkode, kommunekode;
  let evaFormat, notesFormat;

  if (data.adgangsadresse) {
    adresseStr  = data.adgangsadresse.adressebetegnelse ||
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

  // Top-handlinger
  extraInfoEl.innerHTML = `
    <div id="info-actions" style="margin:6px 0;">
      <a href="#" title="Kopier til Eva.net"
         onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}');
                  showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
      &nbsp;
      <a href="#" title="Kopier til Notes"
         onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFormat}');
                  showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
    </div>
    <div id="info-meta"></div>
  `;
  const infoMetaEl = document.getElementById("info-meta");

  // Skråfoto (med “kopier adresse” først)
  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "inline";
  skråfotoLink.onclick = function(e){
    e.preventDefault();
    copyToClipboard(adresseStr);
    const msg = document.createElement("div");
    msg.textContent = "Adressen er kopieret til udklipsholder.";
    Object.assign(msg.style,{
      position:"fixed", top:"20px", left:"50%", transform:"translateX(-50%)",
      background:"rgba(0,0,0,0.7)", color:"#fff", padding:"10px 15px",
      borderRadius:"5px", zIndex:1000
    });
    document.body.appendChild(msg);
    setTimeout(()=>{ msg.remove(); window.open(skråfotoLink.href,"_blank"); },1000);
  };

  overlay.textContent = `Kommunekode: ${kommunekode} | Vejkode: ${vejkode}`;
  overlay.style.display = "block";

  // Statsvej + kmtText
  let statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");

  const vejstatus = statsvejData?.VEJSTATUS ?? statsvejData?.vejstatus ?? null;
  const vejmynd   = statsvejData?.VEJMYNDIGHED ?? statsvejData?.vejmyndighed ?? null;

  const hasStatsvej = statsvejData && (
    statsvejData.ADM_NR != null || statsvejData.FORGRENING != null ||
    (statsvejData.BETEGNELSE && String(statsvejData.BETEGNELSE).trim()!=="") ||
    (statsvejData.VEJTYPE && String(statsvejData.VEJTYPE).trim()!=="")
  );

  const showBox = hasStatsvej || vejstatus || vejmynd;

  if (showBox) {
    let html = "";
    if (hasStatsvej) {
      html += `<strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
               <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
               <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
               <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
               <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}`;
    }
    const beskrivelse = statsvejData.BESKRIVELSE ?? statsvejData.beskrivelse ?? null;
    if (beskrivelse && String(beskrivelse).trim()!=="") {
      if (html) html += "<br>";
      html += `<strong>Beskrivelse:</strong> ${beskrivelse}`;
    }
    if (vejstatus) { if (html) html += "<br>"; html += `<strong>Vejstatus:</strong> ${vejstatus}`; }
    if (vejmynd)   { if (html) html += "<br>"; html   += `<strong>Vejmyndighed:</strong> ${vejmynd}`; }

    // KmtText (kun ved referencevej)
    if (hasStatsvej) {
      const kmText = await getKmAtPoint(lat, lon);
      if (kmText) html += `<br><strong>Km:</strong> ${kmText}`;
    }

    statsvejInfoEl.innerHTML = html;
    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }

  document.getElementById("infoBox").style.display = "block";

  // Kommune-opsummering + link (gemLink)
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
          if (link) {
            infoMetaEl.innerHTML += `<br>Kommune: <a href="${link}" target="_blank">${kommunenavn}</a> | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
          } else {
            infoMetaEl.innerHTML += `<br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
          }
        }
      }
    } catch {}
  }

  // Politikreds (fra reverse)
  const politikredsNavn = data.politikredsnavn ?? data.adgangsadresse?.politikredsnavn ?? null;
  const politikredsKode = data.politikredskode ?? data.adgangsadresse?.politikredskode ?? null;
  if (politikredsNavn || politikredsKode) {
    const polititekst = politikredsKode ? `${politikredsNavn||""} (${politikredsKode})` : `${politikredsNavn}`;
    infoMetaEl.innerHTML += `<br>Politikreds: ${polititekst}`;
  }
}

/***************************************************
 * Søgning – inputs og lister
 ***************************************************/
const searchInput = document.getElementById("search");
const clearBtn    = document.getElementById("clearSearch");
const resultsList = document.getElementById("results");
const vej1Input   = document.getElementById("vej1");
const vej2Input   = document.getElementById("vej2");
const vej1List    = document.getElementById("results-vej1");
const vej2List    = document.getElementById("results-vej2");

function addClearButton(input, list) {
  const btn = document.createElement("span");
  btn.innerHTML = "&times;";
  btn.classList.add("clear-button");
  input.parentElement.appendChild(btn);

  input.addEventListener("input", ()=>{
    btn.style.display = input.value.length>0 ? "inline" : "none";
  });

  btn.addEventListener("click", ()=>{
    input.value = "";
    list.innerHTML = "";
    btn.style.display = "none";
    resetCoordinateBox();
  });

  input.addEventListener("keydown", (e)=>{
    if (e.key==="Backspace" && input.value.length===0) {
      list.innerHTML = "";
      resetCoordinateBox();
    }
  });

  btn.style.display = "none";
}
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

// pile/enter i lister
let searchItems = [], searchCurrentIndex=-1;
let vej1Items   = [], vej1CurrentIndex=-1;
let vej2Items   = [], vej2CurrentIndex=-1;

/***************************************************
 * #search – live søgning (inkl. koordinat-input)
 ***************************************************/
searchInput.addEventListener("input", ()=>{
  const txt = searchInput.value.trim();
  if (txt.length<2) {
    clearBtn.style.display = "none";
    resultsList.innerHTML = "";
    document.getElementById("infoBox").style.display = "none";
    searchItems = [];
    return;
  }
  clearBtn.style.display = "inline";
  doSearch(txt, resultsList);

  // Koordinater (lat,lon)
  const m = txt.match(/^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/);
  if (m) {
    const latNum = parseFloat(m[1]);
    const lonNum = parseFloat(m[2]);
    const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl).then(r=>r.json()).then(data=>{
      resultsList.innerHTML = "";
      placeMarkerAndZoom([latNum,lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
      setCoordinateBox(latNum, lonNum);
      updateInfoBox(data, latNum, lonNum);
    });
  }
});

searchInput.addEventListener("keydown",(e)=>{
  if (searchItems.length===0) return;
  if (e.key==="ArrowDown") {
    e.preventDefault(); searchCurrentIndex=(searchCurrentIndex+1)%searchItems.length; highlightSearchItem();
  } else if (e.key==="ArrowUp") {
    e.preventDefault(); searchCurrentIndex=(searchCurrentIndex+searchItems.length-1)%searchItems.length; highlightSearchItem();
  } else if (e.key==="Enter") {
    e.preventDefault(); if (searchCurrentIndex>=0) searchItems[searchCurrentIndex].click();
  } else if (e.key==="Backspace" && searchInput.value.length===0) {
    resetCoordinateBox();
  }
});
function highlightSearchItem(){
  searchItems.forEach(li=>li.classList.remove("highlight"));
  if (searchCurrentIndex>=0 && searchCurrentIndex<searchItems.length)
    searchItems[searchCurrentIndex].classList.add("highlight");
}

clearBtn.addEventListener("click", ()=>{
  searchInput.value = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  resetCoordinateBox();
  resetInfoBox();
  searchInput.focus();
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker=null; }
  resultsList.innerHTML = "";
  document.getElementById("kommuneOverlay").style.display = "none";
});

/***************************************************
 * Vej1 / Vej2 – søgning i vejnavne
 ***************************************************/
function doSearchRoad(query, listElement, inputField, which) {
  const url = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(url).then(r=>r.json()).then(data=>{
    listElement.innerHTML = "";
    if (which==="vej1") { vej1Items=[]; vej1CurrentIndex=-1; }
    else { vej2Items=[]; vej2CurrentIndex=-1; }

    data.sort((a,b)=>a.tekst.localeCompare(b.tekst));
    const seen = new Set();

    data.forEach(item=>{
      const vejnavn   = item.adgangsadresse?.vejnavn || "Ukendt vej";
      const kommune   = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
      const postnr    = item.adgangsadresse?.postnr || "?";
      const adgangsId = item.adgangsadresse?.id || null;
      const key = `${vejnavn}-${postnr}`;
      if (seen.has(key)) return;
      seen.add(key);

      const li = document.createElement("li");
      li.textContent = `${vejnavn}, ${kommune} (${postnr})`;
      li.addEventListener("click", ()=>{
        inputField.value = vejnavn;
        listElement.innerHTML = "";
        listElement.style.display = "none";
        if (!adgangsId) return;
        const detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
        fetch(detailUrl).then(r=>r.json()).then(async detail=>{
          const roadSelection = {
            vejnavn,
            kommunekode: detail.kommunekode,
            vejkode: detail.vejkode,
            husnummerId: detail.id,
            geometry: await getNavngivenvejKommunedelGeometry(detail.id)
          };
          if (inputField.id==="vej1") window.selectedRoad1 = roadSelection;
          if (inputField.id==="vej2") window.selectedRoad2 = roadSelection;
        });
      });
      listElement.appendChild(li);
      if (which==="vej1") vej1Items.push(li); else vej2Items.push(li);
    });
    listElement.style.display = data.length>0 ? "block" : "none";
  });
}
vej1Input.addEventListener("input", ()=>{
  const txt = vej1Input.value.trim();
  if (txt.length<2){ vej1List.innerHTML=""; vej1List.style.display="none"; vej1Items=[]; return; }
  doSearchRoad(txt, vej1List, vej1Input, "vej1");
});
vej2Input.addEventListener("input", ()=>{
  const txt = vej2Input.value.trim();
  if (txt.length<2){ vej2List.innerHTML=""; vej2List.style.display="none"; vej2Items=[]; return; }
  doSearchRoad(txt, vej2List, vej2Input, "vej2");
});

/***************************************************
 * Kombineret søgning: adresser + stednavne + (evt.) strandposter
 ***************************************************/
function doSearch(query, listElement) {
  const addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  const stedUrl = `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;

  const strandPromise = (map.hasLayer(redningsnrLayer) && strandposterReady)
    ? doSearchStrandposter(query)
    : Promise.resolve([]);

  Promise.all([
    fetch(addrUrl).then(r=>r.json()).catch(()=>[]),
    fetch(stedUrl).then(r=>r.json()).catch(()=>({})),
    strandPromise
  ]).then(([addrData, stedData, strandData])=>{
    listElement.innerHTML = "";
    searchItems = []; searchCurrentIndex = -1;

    // Adresser
    const addrResults = (addrData||[]).map(item=>({
      type:"adresse",
      tekst:item.tekst,
      adgangsadresse:item.adgangsadresse
    }));

    // Stednavne (to mulige formater)
    let stedResults = [];
    if (stedData) {
      if (Array.isArray(stedData.results)) {
        stedResults = stedData.results.map(r=>({
          type:"stednavn",
          navn: r.visningstekst || r.navn,
          bbox: r.bbox || null,
          geometry: r.geometry
        }));
      } else if (Array.isArray(stedData)) {
        stedResults = stedData.map(r=>({
          type:"stednavn",
          navn: r.visningstekst || r.skrivemaade_officiel,
          bbox: r.bbox || null,
          geometry: r.geometri
        }));
      }
    }

    const combined = [...addrResults, ...stedResults, ...strandData];
    combined.sort((a,b)=>{
      // din tidligere specielle prioritet mellem stednavn/adresse
      if (a.type==="stednavn" && b.type==="adresse") return -1;
      if (a.type==="adresse" && b.type==="stednavn") return  1;
      return getSortPriority(a,query)-getSortPriority(b,query);
    });

    combined.forEach(obj=>{
      const li = document.createElement("li");
      li.innerHTML = (obj.type==="strandpost") ? `🛟 ${obj.tekst}`
                 : (obj.type==="adresse")    ? `🏠 ${obj.tekst}`
                 :                              `📍 ${obj.navn}`;

      li.addEventListener("click", ()=>{
        if (obj.type==="adresse" && obj.adgangsadresse?.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r=>r.json())
            .then(addressData=>{
              const [lon,lat] = addressData.adgangspunkt.koordinater;
              setCoordinateBox(lat,lon);
              placeMarkerAndZoom([lat,lon], obj.tekst);
              const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
              fetch(revUrl).then(r=>r.json()).then(reverseData=>{
                updateInfoBox(reverseData,lat,lon);
              }).catch(()=>{});
              resultsList.innerHTML=""; vej1List.innerHTML=""; vej2List.innerHTML="";
            });
        } else if (obj.type==="stednavn") {
          // bbox eller punkt-geometri
          if (obj.bbox?.coordinates?.[0]?.length>0) {
            const [x,y] = obj.bbox.coordinates[0][0];
            placeMarkerAndZoom([x,y], obj.navn);
          } else if (obj.geometry?.coordinates) {
            const coordsArr = Array.isArray(obj.geometry.coordinates[0])
              ? obj.geometry.coordinates[0] : obj.geometry.coordinates;
            placeMarkerAndZoom(coordsArr, obj.navn);
          }
          listElement.innerHTML=""; listElement.style.display="none";
        } else if (obj.type==="strandpost") {
          setCoordinateBox(obj.lat,obj.lon);
          placeMarkerAndZoom([obj.lat,obj.lon], obj.tekst);
          listElement.innerHTML=""; listElement.style.display="none";

          const marker = currentMarker;
          const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`;
          fetch(revUrl).then(r=>r.json()).then(revData=>{
            const vejnavn    = revData?.adgangsadresse?.vejnavn    || revData?.vejnavn || "?";
            const husnr      = revData?.adgangsadresse?.husnr      || revData?.husnr   || "";
            const postnr     = revData?.adgangsadresse?.postnr     || revData?.postnr  || "?";
            const postnrnavn = revData?.adgangsadresse?.postnrnavn || revData?.postnrnavn || "";
            const adresseStr = `${vejnavn} ${husnr}, ${postnr} ${postnrnavn}`;
            const evaFormat  = `${vejnavn},${husnr},${postnr}`;
            const notesFmt   = `${vejnavn} ${husnr}, ${postnr} ${postnrnavn}`;

            marker.bindPopup(`
              <strong>${obj.tekst}</strong><br>
              ${adresseStr}<br>
              <a href="#" title="Kopier til Eva.net" onclick="(function(el){ el.style.color='red'; copyToClipboard('${evaFormat}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Eva.Net</a>
              &nbsp;
              <a href="#" title="Kopier til Notes" onclick="(function(el){ el.style.color='red'; copyToClipboard('${notesFmt}'); showCopyPopup('Kopieret'); setTimeout(function(){ el.style.color=''; },1000); })(this); return false;">Notes</a>
            `).openPopup();

            marker.on("popupclose", ()=>{
              map.removeLayer(marker);
              currentMarker = null;
              document.getElementById("infoBox").style.display = "none";
              document.getElementById("statsvejInfoBox").style.display = "none";
              resetCoordinateBox();
              resultsList.innerHTML = "";
            });
          }).catch(()=>{
            marker.bindPopup(`<strong>${obj.tekst}</strong><br>(Reverse geocoding fejlede)`).openPopup();
          });
        }
      });

      listElement.appendChild(li);
      searchItems.push(li);
    });

    listElement.style.display = combined.length>0 ? "block" : "none";
  });
}

/***************************************************
 * DAR: navngiven vej geometri (WKT -> GeoJSON)
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  const url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  try {
    const r = await fetch(url); const data = await r.json();
    if (Array.isArray(data) && data.length>0) {
      const wktString = data[0]?.navngivenVej?.vejnavnebeliggenhed_vejnavnelinje;
      if (wktString) return wellknown.parse(wktString);
    }
  } catch (e) { console.error("getNavngivenvejKommunedelGeometry fejl:", e); }
  return null;
}

/***************************************************
 * Marker & zoom
 ***************************************************/
function placeMarkerAndZoom(coords, displayText) {
  let c = coords.slice(0,2);
  if (c[0]>90 || c[1]>90) c = convertToWGS84(c[0],c[1]);
  const [lat,lon] = c;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat,lon]).addTo(map);
  map.setView([lat,lon], 16);
  document.getElementById("address").textContent = displayText;
  document.getElementById("streetviewLink").href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * CVF: statsvej + kmtText
 ***************************************************/
async function checkForStatsvej(lat, lon) {
  const [utmX, utmY] = proj4("EPSG:4326","EPSG:25832",[lon,lat]);
  const buffer = 100;
  const bbox = `${utmX-buffer},${utmY-buffer},${utmX+buffer},${utmY+buffer}`;
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
  try {
    const resp = await fetch(url);
    const txt  = await resp.text();
    if (txt.startsWith("Results")) return parseTextResponse(txt);
    const json = JSON.parse(txt);
    return json.features?.[0]?.properties || {};
  } catch (e) {
    console.error("checkForStatsvej fejl:", e);
    return {};
  }
}
function parseTextResponse(text){
  const out={}; text.split("\n").forEach(line=>{
    const p=line.split(" = "); if(p.length===2) out[p[0].trim()]=p[1].trim();
  }); return out;
}

async function getKmAtPoint(lat, lon) {
  try {
    const [x,y] = proj4("EPSG:4326","EPSG:25832",[lon,lat]);
    const stats = await checkForStatsvej(lat,lon);
    const roadNumber = stats.ADM_NR ?? stats.adm_nr ?? null;
    const roadPart   = stats.FORGRENING ?? stats.forgrening ?? 0;
    if (!roadNumber) return "";

    const url = `${VD_PROXY}/reference?geometry=POINT(${x}%20${y})&srs=EPSG:25832&roadNumber=${roadNumber}&roadPart=${roadPart}&format=json`;
    const resp = await fetch(url, { cache:"no-store" });
    if (!resp.ok) return "";
    const data = await resp.json();
    const props = data?.properties ?? data?.features?.[0]?.properties ?? data;

    const from = props?.from ?? props?.FROM ?? null;
    const to   = props?.to   ?? props?.TO   ?? null;

    const kmtText =
      from?.kmtText ?? from?.KMTTEXT ??
      to?.kmtText   ?? to?.KMTTEXT   ??
      props?.kmtText?? props?.KMTEKST?? props?.kmtekst ?? null;

    if (kmtText) return String(kmtText);

    const km = (from?.km ?? props?.km ?? null);
    const m  = (from?.m  ?? props?.m  ?? props?.km_meter ?? null);
    if (km!=null && m!=null) return `${km}/${String(m).padStart(4,"0")}`;

    return "";
  } catch { return ""; }
}

/***************************************************
 * Statsvej/Info-bokse luk
 ***************************************************/
document.getElementById("statsvejCloseBtn").addEventListener("click", ()=>{
  document.getElementById("statsvejInfoBox").style.display="none";
  document.getElementById("infoBox").style.display="none";
  resetCoordinateBox();
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker=null; }
});
document.getElementById("infoCloseBtn").addEventListener("click", ()=>{
  document.getElementById("infoBox").style.display="none";
  document.getElementById("statsvejInfoBox").style.display="none";
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker=null; }
  resetCoordinateBox();
  resultsList.innerHTML="";
  document.getElementById("kommuneOverlay").style.display="none";
});

function resetInfoBox(){
  document.getElementById("extra-info").textContent="";
  document.getElementById("skraafotoLink").style.display="none";
}
vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", ()=>{
  vej1Input.value=""; vej1List.innerHTML=""; document.getElementById("infoBox").style.display="none"; resetCoordinateBox();
});
vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", ()=>{
  vej2Input.value=""; vej2List.innerHTML=""; document.getElementById("infoBox").style.display="none"; resetCoordinateBox();
});

/***************************************************
 * “Find X” – kryds mellem to valgte veje (Turf)
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async ()=>{
  const r1 = window.selectedRoad1, r2 = window.selectedRoad2;
  if (!r1 || !r2) return alert("Vælg venligst to veje først.");
  if (!r1.geometry || !r2.geometry) return alert("Geometri ikke tilgængelig for en eller begge veje.");

  const line1 = turf.multiLineString(r1.geometry.coordinates);
  const line2 = turf.multiLineString(r2.geometry.coordinates);
  const inter = turf.lineIntersect(line1, line2);

  if (inter.features.length===0) return alert("De valgte veje krydser ikke hinanden.");
  const pts = [];
  for (const feat of inter.features) {
    const [x,y] = feat.geometry.coordinates;
    const [lon,lat] = proj4("EPSG:25832","EPSG:4326",[x,y]); // proj tilbage
    pts.push([lat,lon]);
    const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
    const m = L.marker([lat,lon]).addTo(map);
    try{
      const rev = await fetch(revUrl).then(r=>r.json());
      const addressStr = `${rev.vejnavn||"Ukendt"} ${rev.husnr||""}, ${rev.postnr||"?"} ${rev.postnrnavn||""}`;
      const eva = `${rev.vejnavn||""},${rev.husnr||""},${rev.postnr||""}`;
      const notes = `${rev.vejnavn||""} ${rev.husnr||""}, ${rev.postnr||""} ${rev.postnrnavn||""}`;
      m.bindPopup(`
        ${addressStr}<br>
        <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${eva}');showCopyPopup('Kopieret');setTimeout(()=>el.style.color='',1000);})(this);return false;">Eva.Net</a>
        &nbsp;
        <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${notes}');showCopyPopup('Kopieret');setTimeout(()=>el.style.color='',1000);})(this);return false;">Notes</a>
      `).openPopup();
    } catch {
      m.bindPopup(`(${lat.toFixed(6)}, ${lon.toFixed(6)})<br>Reverse geocoding fejlede.`).openPopup();
    }
    setCoordinateBox(lat,lon);
    m.on("popupclose", ()=>map.removeLayer(m));
  }
  if (pts.length===1) map.setView(pts[0],16); else map.fitBounds(pts);
});

/***************************************************
 * Afstandscirkel + Ladestandere
 ***************************************************/
let currentCircle = null;
let selectedRadius = null;

function toggleCircle(radius) {
  selectedRadius = radius;
  if (!currentMarker) return alert("Vælg venligst en adresse eller klik på kortet først.");
  const latLng = currentMarker.getLatLng();

  if (currentCircle && currentCircle.getRadius()===radius) {
    map.removeLayer(currentCircle); currentCircle=null; selectedRadius=null;
    if (map.hasLayer(chargeMapLayer)) map.removeLayer(chargeMapLayer);
  } else {
    if (currentCircle) map.removeLayer(currentCircle);
    currentCircle = L.circle(latLng,{ radius, color:"blue", fillOpacity:0.2 }).addTo(map);
    if (map.hasLayer(chargeMapLayer)) map.fire("overlayadd",{ layer: chargeMapLayer });
  }
}
document.getElementById("btn10").addEventListener("click", ()=>{ selectedRadius=10000;  toggleCircle(10000);  });
document.getElementById("btn25").addEventListener("click", ()=>{ selectedRadius=25000;  toggleCircle(25000);  });
document.getElementById("btn50").addEventListener("click", ()=>{ selectedRadius=50000;  toggleCircle(50000);  });
document.getElementById("btn100").addEventListener("click",()=>{ selectedRadius=100000; toggleCircle(100000); });

map.on("overlayadd",(e)=>{
  if (e.layer===dbSmsLayer) {
    window.open("https://kort.dyrenesbeskyttelse.dk/db/dvc.nsf/kort","_blank");
    map.removeLayer(dbSmsLayer);
  } else if (e.layer===dbJournalLayer) {
    window.open("https://dvc.dyrenesbeskyttelse.dk/db/dvc.nsf/Efter%20journalnr?OpenView","_blank");
    map.removeLayer(dbJournalLayer);
  } else if (e.layer===chargeMapLayer) {
    if (!selectedRadius) { alert("Vælg radius først"); chargeMapLayer.clearLayers(); return; }
    chargeMapLayer.clearLayers();
    const {lat, lng:lon} = currentMarker.getLatLng();
    const distKm = selectedRadius/1000;
    fetch(
      "https://api.openchargemap.io/v3/poi/?output=json" +
      "&countrycode=DK&maxresults=10000" +
      `&latitude=${lat}&longitude=${lon}&distance=${distKm}&distanceunit=KM` +
      "&key=3c33b286-7067-426b-8e46-a727dd12f6f3"
    )
    .then(r=>r.json()).then(arr=>{
      arr.forEach(p=>{
        const la = p.AddressInfo?.Latitude, lo = p.AddressInfo?.Longitude;
        if (la && lo && currentMarker &&
            map.distance(currentMarker.getLatLng(), L.latLng(la,lo)) <= selectedRadius) {
          L.circleMarker([la,lo],{ radius:8, color:"yellow", fillColor:"yellow", fillOpacity:1 })
            .bindPopup(
              `<strong>${p.AddressInfo.Title||""}</strong><br>
               ${p.AddressInfo.AddressLine1||""}, ${p.AddressInfo.Town||""}<br>
               <strong>Power:</strong> ${p.Connections?.[0]?.PowerKW||"N/A"} kW<br>
               <strong>Type:</strong> ${p.Connections?.[0]?.ConnectionType?.Title||"N/A"}<br><br>
               <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${p.AddressInfo.AddressLine1||""},${p.AddressInfo.Town||""}');showCopyPopup('Kopieret til Eva.Net');setTimeout(()=>el.style.color='',1000);})(this);return false;">Eva.Net</a>
               &nbsp;
               <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${p.AddressInfo.AddressLine1||""} ${p.AddressInfo.Town||""}');showCopyPopup('Kopieret til Notes');setTimeout(()=>el.style.color='',1000);})(this);return false;">Notes</a>`
            ).addTo(chargeMapLayer);
        }
      });
    });
  }
});

document.addEventListener("DOMContentLoaded", ()=>document.getElementById("search").focus());

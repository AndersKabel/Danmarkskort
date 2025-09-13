/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");
function convertToWGS84(x, y) {
  const res = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  return [res[1], res[0]];
}

/***************************************************
 * Clipboard + lille toast
 ***************************************************/
function copyToClipboard(str) {
  const s = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(s).catch(()=>{});
}
function showCopyPopup(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position:"fixed", top:"20px", left:"50%", transform:"translateX(-50%)",
    background:"rgba(0,0,0,.7)", color:"#fff", padding:"10px 15px", borderRadius:"6px", zIndex:1000
  });
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1200);
}

/***************************************************
 * Sorteringsprioritet for søgeresultater
 ***************************************************/
function getSortPriority(item, query) {
  const t = (item.type==="stednavn" ? (item.navn||"") : (item.tekst||"")).toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;
  return 3;
}

/***************************************************
 * Leaflet-kort
 ***************************************************/
const map = L.map('map', { center: [56, 10], zoom: 7, zoomControl: false });

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur, © CVR API"
}).addTo(map);

const ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  { layers: "orto_foraar", format: "image/jpeg", transparent: false, version: "1.1.1", attribution: "Ortofoto © Kortforsyningen" }
);

const redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers:"Redningsnummer", format:"image/png", transparent:true, version:"1.3.0", attribution:"Data: redningsnummer.dk"
});

const falckAssLayer = L.geoJSON(null, {
  onEachFeature: (f, layer) => layer.bindPopup("<strong>"+(f.properties.tekst||"Falck Ass")+"</strong>"),
  style: ()=>({color:"orange"})
});
fetch("FalckStationer_data.json").then(r=>r.json()).then(d=>falckAssLayer.addData(d)).catch(()=>{});

const kommunegrænserLayer = L.geoJSON(null, { style:()=>({color:"#3388ff", weight:2, fillOpacity:0}) });
fetch("https://api.dataforsyningen.dk/kommuner?format=geojson").then(r=>r.json()).then(d=>kommunegrænserLayer.addData(d)).catch(()=>{});

/* Andre overlays */
const dbSmsLayer     = L.layerGroup();
const dbJournalLayer = L.layerGroup();
const border25Layer  = L.layerGroup();
const chargeMapLayer = L.layerGroup();

/* 25 km offset-linjer */
fetch("dansk-tysk-grænse.geojson").then(r=>r.json()).then(g=>{
  const coords = g.features[0].geometry.coordinates;
  const off = coords.map(c=>{ const [x,y]=proj4("EPSG:4326","EPSG:25832",[c[0],c[1]]); const [lon2,lat2]=proj4("EPSG:25832","EPSG:4326",[x,y-25000]); return [lat2,lon2]; });
  L.polyline(off,{color:"red",weight:2,dashArray:"5,5"}).addTo(border25Layer);
});
fetch("svensk-grænse.geojson").then(r=>r.json()).then(g=>{
  const coords = g.features[0].geometry.coordinates;
  const off = coords.map(c=>{ const [x,y]=proj4("EPSG:4326","EPSG:25832",[c[0],c[1]]); const [lon2,lat2]=proj4("EPSG:25832","EPSG:4326",[x,y+25000]); return [lat2,lon2]; });
  L.polyline(off,{color:"red",weight:2,dashArray:"5,5"}).addTo(border25Layer);
});

const baseMaps = { "OpenStreetMap": osmLayer, "Satellit": ortofotoLayer };
const overlayMaps = {
  "Strandposter": redningsnrLayer,
  "Falck Ass": falckAssLayer,
  "Kommunegrænser": kommunegrænserLayer,
  "DB SMS kort": dbSmsLayer,
  "DB Journal": dbJournalLayer,
  "25 km grænse": border25Layer,
  "Ladestandere": chargeMapLayer
};

const layerControl = L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

/* Åbn DB-sider som før */
map.on('overlayadd', function(e) {
  if (e.layer === dbSmsLayer) {
    window.open('https://kort.dyrenesbeskyttelse.dk/db/dvc.nsf/kort', '_blank'); map.removeLayer(dbSmsLayer);
  } else if (e.layer === dbJournalLayer) {
    window.open('https://dvc.dyrenesbeskyttelse.dk/db/dvc.nsf/Efter%20journalnr?OpenView', '_blank'); map.removeLayer(dbJournalLayer);
  } else if (e.layer === chargeMapLayer) {
    if (!selectedRadius) { alert("Vælg radius først"); chargeMapLayer.clearLayers(); return; }
    chargeMapLayer.clearLayers();
    const c = currentMarker?.getLatLng(); if (!c) return;
    const distKm = selectedRadius/1000;
    fetch('https://api.openchargemap.io/v3/poi/?output=json&countrycode=DK&maxresults=10000'
          +`&latitude=${c.lat}&longitude=${c.lng}&distance=${distKm}&distanceunit=KM`
          +'&key=3c33b286-7067-426b-8e46-a727dd12f6f3')
      .then(r=>r.json()).then(data=>{
        data.forEach(p=>{
          const lat=p.AddressInfo?.Latitude, lon=p.AddressInfo?.Longitude;
          if (lat && lon && map.distance(c, L.latLng(lat,lon)) <= selectedRadius) {
            L.circleMarker([lat,lon],{radius:8,color:'yellow',fillColor:'yellow',fillOpacity:1})
             .bindPopup('Ladestander').addTo(chargeMapLayer);
          }
        });
      }).catch(()=>{});
  }
});
L.control.zoom({ position: 'bottomright' }).addTo(map);

/***************************************************
 * Kommunedata
 ***************************************************/
let kommuneInfo = {};
fetch("kommunedata.json").then(r=>r.json()).then(d=>{kommuneInfo=d}).catch(()=>{});

/***************************************************
 * Koordinatboks
 ***************************************************/
function resetCoordinateBox(){ const b=document.getElementById("coordinateBox"); b.textContent=""; b.style.display="none"; }
function setCoordinateBox(lat, lon) {
  const b=document.getElementById("coordinateBox");
  const a=lat.toFixed(6), o=lon.toFixed(6);
  b.innerHTML=`Koordinater: <span id="latVal">${a}</span>, <span id="lonVal">${o}</span>`;
  b.style.display="block";
  const latEl=document.getElementById("latVal"), lonEl=document.getElementById("lonVal");
  function h(){ latEl.style.color="red"; lonEl.style.color="red"; navigator.clipboard.writeText(`${a},${o}`).finally(()=>setTimeout(()=>{latEl.style.color=""; lonEl.style.color="";},1000)); }
  latEl.addEventListener("click", h); lonEl.addEventListener("click", h);
}

/***************************************************
 * Strandposter – lazy load
 ***************************************************/
let allStrandposter=[], strandposterReady=false;
function fetchAllStrandposter(){
  return fetch("Strandposter").then(r=>r.json()).then(g=>{
    if (g.features){ allStrandposter=g.features; strandposterReady=true; }
  }).catch(()=>{});
}
map.on("overlayadd", e=>{
  if (e.name==="Strandposter" && allStrandposter.length===0) fetchAllStrandposter();
});

/***************************************************
 * Klik på kort
 ***************************************************/
let currentMarker=null;
map.on("click", e=>{
  const lat=e.latlng.lat, lon=e.latlng.lng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker=L.marker([lat,lon]).addTo(map);
  setCoordinateBox(lat, lon);
  fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
    .then(r=>r.json()).then(d=>updateInfoBox(d,lat,lon)).catch(()=>{});
});

/***************************************************
 * CVF: GetFeatureInfo (statsvej) – failsafe: returnerer {}
 ***************************************************/
async function checkForStatsvej(lat, lon){
  try{
    const [x,y]=proj4("EPSG:4326","EPSG:25832",[lon,lat]);
    const b=100, bbox=`${x-b},${y-b},${x+b},${y+b}`;
    const url=`https://geocloud.vd.dk/CVF/wms?
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
    const txt=await (await fetch(url)).text();
    if (txt.startsWith("Results")) return parseTextResponse(txt) || {};
    const json=JSON.parse(txt);
    return (json.features && json.features[0] && json.features[0].properties) ? json.features[0].properties : {};
  }catch(e){ return {}; }
}
function parseTextResponse(t){ const d={}; t.split("\n").forEach(l=>{ const p=l.split(" = "); if(p.length===2){ d[p[0].trim()]=p[1].trim(); } }); return d; }

/***************************************************
 * 🔹 CVF reference (km ved punkt) – prøv flere endpoints
 ***************************************************/
async function getKmAtPoint(lat, lon){
  try{
    const [x,y]=proj4("EPSG:4326","EPSG:25832",[lon,lat]);
    const bases = [
      "https://cvf.vd.dk/cvf/reference",
      "https://geocloud.vd.dk/CVF/reference"
    ];
    const layerNames = ["CVF:veje","cvf:veje"];
    for (const base of bases){
      for (const lname of layerNames){
        const url = `${base}?geometry=POINT(${x}%20${y})&srs=EPSG:25832&layers=${encodeURIComponent(lname)}&buffer=30&limit=1&format=json`;
        try{
          const raw = await (await fetch(url)).text();
          let data=null; try{ data=JSON.parse(raw); }catch{ data=null; }
          const props = data?.features?.[0]?.properties || data?.properties || null;
          if (!props) continue;

          // mulige feltvarianter
          const kmRaw   = props.km ?? props.KM ?? props.km_værdi ?? props.KM_VAERDI ?? props.km_value ?? null;
          const kmHelt  = props.km_helt ?? props.KM_HELT ?? props.KMHELT;
          const kmMeter = props.km_meter ?? props.KM_METER ?? props.KMMETER;
          const kmt     = props.KMT ?? props.kmt; // fx "35/0886"

          if (kmRaw!=null && kmRaw!==""){
            const v = (""+kmRaw).replace(",",".");
            return `km ${Number(v).toFixed(3)}`;
          }
          if (kmHelt!=null && kmMeter!=null) return `km ${kmHelt}+${kmMeter}`;
          if (typeof kmt==="string" && kmt.includes("/")){
            const [h,m]=kmt.split("/");
            return `km ${h}+${m}`;
          }
        }catch(e){ /* prøv næste kombination */ }
      }
    }
    return "";
  }catch(e){ return ""; }
}

/***************************************************
 * updateInfoBox
 ***************************************************/
async function updateInfoBox(data, lat, lon){
  const streetviewLink=document.getElementById("streetviewLink");
  const addressEl=document.getElementById("address");
  const extraInfoEl=document.getElementById("extra-info");
  const skråfotoLink=document.getElementById("skraafotoLink");
  const overlay=document.getElementById("kommuneOverlay");

  let adresseStr, vejkode, kommunekode, evaFormat, notesFormat;
  if (data.adgangsadresse){
    adresseStr=data.adgangsadresse.adressebetegnelse ||
      `${data.adgangsadresse.vejnavn||""} ${data.adgangsadresse.husnr||""}, ${data.adgangsadresse.postnr||""} ${data.adgangsadresse.postnrnavn||""}`;
    evaFormat   = `${data.adgangsadresse.vejnavn||""},${data.adgangsadresse.husnr||""},${data.adgangsadresse.postnr||""}`;
    notesFormat = `${data.adgangsadresse.vejnavn||""} ${data.adgangsadresse.husnr||""}, ${data.adgangsadresse.postnr||""} ${data.adgangsadresse.postnrnavn||""}`;
    vejkode     = data.adgangsadresse.vejkode||"?";
    kommunekode = data.adgangsadresse.kommunekode||"?";
  } else if (data.adressebetegnelse){
    adresseStr=data.adressebetegnelse; evaFormat="?, ?, ?"; notesFormat="?, ?, ?"; vejkode=data.vejkode||"?"; kommunekode=data.kommunekode||"?";
  } else {
    adresseStr=`${data.vejnavn||"?"} ${data.husnr||""}, ${data.postnr||"?"} ${data.postnrnavn||""}`;
    evaFormat=`${data.vejnavn||""},${data.husnr||""},${data.postnr||""}`;
    notesFormat=`${data.vejnavn||""} ${data.husnr||""}, ${data.postnr||""} ${data.postnrnavn||""}`;
    vejkode=data.vejkode||"?"; kommunekode=data.kommunekode||"?";
  }

  streetviewLink.href=`https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent=adresseStr;

  extraInfoEl.innerHTML = `
    <br>
    <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${evaFormat}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Eva.Net</a>
    &nbsp;
    <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${notesFormat}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Notes</a>
  `;

  skråfotoLink.href=`https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display="inline";
  skråfotoLink.onclick=function(ev){
    ev.preventDefault(); copyToClipboard(adresseStr);
    const m=document.createElement("div"); m.textContent="Adressen er kopieret til udklipsholder.";
    Object.assign(m.style,{position:"fixed",top:"20px",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,.7)",color:"#fff",padding:"10px 15px",borderRadius:"6px",zIndex:1000});
    document.body.appendChild(m); setTimeout(()=>{m.remove(); window.open(skråfotoLink.href,'_blank');},900);
  };

  overlay.textContent=`Kommunekode: ${kommunekode} | Vejkode: ${vejkode}`;
  overlay.style.display="block";

  if (resultsList) resultsList.innerHTML="";
  if (vej1List)    vej1List.innerHTML="";
  if (vej2List)    vej2List.innerHTML="";

  // Statsvej-info
  const stats = await checkForStatsvej(lat, lon);
  const statsEl=document.getElementById("statsvejInfo");
  if (stats && Object.keys(stats).length>0){
    statsEl.innerHTML =
      `<strong>Administrativt nummer:</strong> ${stats.ADM_NR||"Ukendt"}<br>
       <strong>Forgrening:</strong> ${stats.FORGRENING||"Ukendt"}<br>
       <strong>Vejnavn:</strong> ${stats.BETEGNELSE||"Ukendt"}<br>
       <strong>Bestyrer:</strong> ${stats.BESTYRER||"Ukendt"}<br>
       <strong>Vejtype:</strong> ${stats.VEJTYPE||"Ukendt"}`;
    // Km-tekst
    const kmText = await getKmAtPoint(lat, lon);
    if (kmText) statsEl.innerHTML += `<br><strong>Kilometer:</strong> ${kmText}`;
    document.getElementById("statsvejInfoBox").style.display="block";
  } else {
    statsEl.innerHTML=""; document.getElementById("statsvejInfoBox").style.display="none";
  }
  document.getElementById("infoBox").style.display="block";

  // Kommune-link/info
  if (kommunekode!=="?"){
    try{
      const r=await fetch(`https://api.dataforsyningen.dk/kommuner/${kommunekode}`);
      if (r.ok){
        const kd=await r.json(); const navn=kd.navn||"";
        if (navn && kommuneInfo[navn]){
          const info=kommuneInfo[navn]; const doede=info["Døde dyr"]; const goveje=info["Gader og veje"]; const link=info.gemLink;
          extraInfoEl.innerHTML += link
            ? `<br>Kommune: <a href="${link}" target="_blank">${navn}</a> | Døde dyr: ${doede} | Gader og veje: ${goveje}`
            : `<br>Kommune: ${navn} | Døde dyr: ${doede} | Gader og veje: ${goveje}`;
        }
      }
    }catch(_){}
  }
}

/***************************************************
 * Søgning / UI
 ***************************************************/
const searchInput  = document.getElementById("search");
const clearBtn     = document.getElementById("clearSearch");
const resultsList  = document.getElementById("results");
const vej1Input    = document.getElementById("vej1");
const vej2Input    = document.getElementById("vej2");
const vej1List     = document.getElementById("results-vej1");
const vej2List     = document.getElementById("results-vej2");

function addClearButton(input, listEl){
  const btn=document.createElement("span"); btn.innerHTML="&times;"; btn.classList.add("clear-button");
  input.parentElement.appendChild(btn);
  input.addEventListener("input", ()=> btn.style.display = input.value.length>0 ? "inline" : "none");
  btn.addEventListener("click", ()=>{ input.value=""; listEl.innerHTML=""; btn.style.display="none"; resetCoordinateBox(); });
  input.addEventListener("keydown", e=>{ if(e.key==="Backspace" && input.value.length===0){ listEl.innerHTML=""; resetCoordinateBox(); } });
  btn.style.display="none";
}
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

let searchItems=[], searchCurrentIndex=-1, vej1Items=[], vej1CurrentIndex=-1, vej2Items=[], vej2CurrentIndex=-1;

searchInput.addEventListener("input", ()=>{
  const txt = searchInput.value.trim();
  if (txt.length<2){ clearBtn.style.display="none"; resultsList.innerHTML=""; document.getElementById("infoBox").style.display="none"; searchItems=[]; return; }
  clearBtn.style.display="inline"; doSearch(txt, resultsList);
  const re=/^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/; if(re.test(txt)){
    const m=txt.match(re); const lat=+m[1], lon=+m[2];
    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`).then(r=>r.json()).then(d=>{
      resultsList.innerHTML=""; placeMarkerAndZoom([lat,lon],`Koordinater: ${lat.toFixed(5)}, ${lon.toFixed(5)}`); setCoordinateBox(lat,lon); updateInfoBox(d,lat,lon);
    }); return;
  }
});
searchInput.addEventListener("keydown", e=>{
  if (searchItems.length===0) return;
  if (e.key==="ArrowDown"){ e.preventDefault(); searchCurrentIndex=(searchCurrentIndex+1)%searchItems.length; highlightSearchItem(); }
  else if (e.key==="ArrowUp"){ e.preventDefault(); searchCurrentIndex=(searchCurrentIndex+searchItems.length-1)%searchItems.length; highlightSearchItem(); }
  else if (e.key==="Enter"){ e.preventDefault(); if (searchCurrentIndex>=0) searchItems[searchCurrentIndex].click(); }
  else if (e.key==="Backspace" && searchInput.value.length===0) resetCoordinateBox();
});
function highlightSearchItem(){ searchItems.forEach(li=>li.classList.remove("highlight")); if (searchCurrentIndex>=0) searchItems[searchCurrentIndex].classList.add("highlight"); }
clearBtn.addEventListener("click", ()=> resetInfoBox());
function resetInfoBox(){ document.getElementById("extra-info").textContent=""; document.getElementById("skraafotoLink").style.display="none"; }

/***************************************************
 * Vej1 / Vej2 – søgning
 ***************************************************/
vej1Input.addEventListener("input", ()=>{ const t=vej1Input.value.trim(); if(t.length<2){ vej1List.innerHTML=""; vej1List.style.display="none"; vej1Items=[]; return; } doSearchRoad(t, vej1List, vej1Input,"vej1"); });
vej1Input.addEventListener("keydown", e=>{
  if (e.key==="Backspace") document.getElementById("infoBox").style.display="none";
  if (vej1Items.length===0) return;
  if (e.key==="ArrowDown"){ e.preventDefault(); vej1CurrentIndex=(vej1CurrentIndex+1)%vej1Items.length; highlightVej1Item(); }
  else if (e.key==="ArrowUp"){ e.preventDefault(); vej1CurrentIndex=(vej1CurrentIndex+vej1Items.length-1)%vej1Items.length; highlightVej1Item(); }
  else if (e.key==="Enter"){ e.preventDefault(); if (vej1CurrentIndex>=0) vej1Items[vej1CurrentIndex].click(); }
});
function highlightVej1Item(){ vej1Items.forEach(li=>li.classList.remove("highlight")); if (vej1CurrentIndex>=0) vej1Items[vej1CurrentIndex].classList.add("highlight"); }

vej2Input.addEventListener("input", ()=>{ const t=vej2Input.value.trim(); if(t.length<2){ vej2List.innerHTML=""; vej2List.style.display="none"; vej2Items=[]; return; } doSearchRoad(t, vej2List, vej2Input,"vej2"); });
vej2Input.addEventListener("keydown", e=>{
  document.getElementById("infoBox").style.display="none";
  if (vej2Items.length===0) return;
  if (e.key==="ArrowDown"){ e.preventDefault(); vej2CurrentIndex=(vej2CurrentIndex+1)%vej2Items.length; highlightVej2Item(); }
  else if (e.key==="ArrowUp"){ e.preventDefault(); vej2CurrentIndex=(vej2CurrentIndex+vej2Items.length-1)%vej2Items.length; highlightVej2Item(); }
  else if (e.key==="Enter"){ e.preventDefault(); if (vej2CurrentIndex>=0) vej2Items[vej2CurrentIndex].click(); }
  else if (e.key==="Backspace" && vej2Input.value.length===0) resetCoordinateBox();
});
function highlightVej2Item(){ vej2Items.forEach(li=>li.classList.remove("highlight")); if (vej2CurrentIndex>=0) vej2Items[vej2CurrentIndex].classList.add("highlight"); }

/***************************************************
 * Ryd-knapper
 ***************************************************/
vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", ()=>{ vej1Input.value=""; vej1List.innerHTML=""; document.getElementById("infoBox").style.display="none"; resetCoordinateBox(); });
vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", ()=>{ vej2Input.value=""; vej2List.innerHTML=""; document.getElementById("infoBox").style.display="none"; resetCoordinateBox(); });

/***************************************************
 * doSearchRoad
 ***************************************************/
let selectedRoad1=null, selectedRoad2=null;
function doSearchRoad(query, listEl, inputEl, which){
  const url=`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  fetch(url).then(r=>r.json()).then(data=>{
    listEl.innerHTML=""; if(which==="vej1"){ vej1Items=[]; vej1CurrentIndex=-1; } else { vej2Items=[]; vej2CurrentIndex=-1; }
    data.sort((a,b)=>a.tekst.localeCompare(b.tekst));
    const uniq=new Set();
    data.forEach(it=>{
      const vej=it.adgangsadresse?.vejnavn||"Ukendt vej";
      const kom=it.adgangsadresse?.postnrnavn||"Ukendt kommune";
      const pn =it.adgangsadresse?.postnr||"?";
      const id =it.adgangsadresse?.id||null;
      const key=`${vej}-${pn}`; if(uniq.has(key)) return; uniq.add(key);
      const li=document.createElement("li"); li.textContent=`${vej}, ${kom} (${pn})`;
      li.addEventListener("click", ()=>{
        inputEl.value=vej; listEl.innerHTML=""; listEl.style.display="none"; if(!id) return;
        fetch(`https://api.dataforsyningen.dk/adgangsadresser/${id}?struktur=mini`).then(r=>r.json()).then(async d=>{
          const sel={ vejnavn:vej, kommunekode:d.kommunekode, vejkode:d.vejkode, husnummerId:d.id };
          sel.geometry = await getNavngivenvejKommunedelGeometry(d.id);
          if (inputEl.id==="vej1") selectedRoad1=sel; else selectedRoad2=sel;
        });
      });
      listEl.appendChild(li); if(which==="vej1") vej1Items.push(li); else vej2Items.push(li);
    });
    listEl.style.display = data.length>0 ? "block" : "none";
  }).catch(()=>{});
}

/***************************************************
 * Strandposter – klientsøgning
 ***************************************************/
function doSearchStrandposter(q){
  q=q.toLowerCase();
  return new Promise(resolve=>{
    function run(){
      const res = allStrandposter.filter(f=> (f.properties.StrandNr||"").toLowerCase().includes(q)).map(f=>{
        const c=f.geometry.coordinates; let lat,lon;
        if (c[0]>90 || c[1]>90){ [lat,lon]=convertToWGS84(c[0],c[1]); } else { lon=c[0]; lat=c[1]; }
        return { type:"strandpost", tekst:`Redningsnummer: ${f.properties.StrandNr}`, lat, lon, feature:f };
      });
      resolve(res);
    }
    if (allStrandposter.length===0) fetchAllStrandposter().then(run).catch(()=>resolve([])); else run();
  });
}

/***************************************************
 * doSearch – kombinerer kilder
 ***************************************************/
function doSearch(query, listEl){
  const addrUrl=`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  const stedUrl=`https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;
  const strandPromise = (map.hasLayer(redningsnrLayer) && strandposterReady) ? doSearchStrandposter(query) : Promise.resolve([]);
  Promise.all([
    fetch(addrUrl).then(r=>r.json()).catch(()=>[]),
    fetch(stedUrl).then(r=>r.json()).catch(()=>({})),
    strandPromise
  ])
  .then(([addrData, stedData, strandData])=>{
    listEl.innerHTML=""; searchItems=[]; searchCurrentIndex=-1;
    const addrResults = (addrData||[]).map(it=>({type:"adresse", tekst:it.tekst, adgangsadresse:it.adgangsadresse}));
    let stedResults=[];
    if (Array.isArray(stedData?.results)){
      stedResults = stedData.results.map(r=>({type:"stednavn", navn:r.visningstekst||r.navn, bbox:r.bbox||null, geometry:r.geometry}));
    } else if (Array.isArray(stedData)){
      stedResults = stedData.map(r=>({type:"stednavn", navn:r.visningstekst||r.skrivemaade_officiel, bbox:r.bbox||null, geometry:r.geometri}));
    }
    const combined=[...addrResults, ...stedResults, ...strandData].sort((a,b)=>{
      if (a.type==="stednavn" && b.type==="adresse") return -1;
      if (a.type==="adresse" && b.type==="stednavn") return 1;
      return getSortPriority(a,query) - getSortPriority(b,query);
    });
    combined.forEach(obj=>{
      const li=document.createElement("li");
      li.innerHTML = obj.type==="strandpost" ? `🛟 ${obj.tekst}` : obj.type==="adresse" ? `🏠 ${obj.tekst}` : `📍 ${obj.navn}`;
      li.addEventListener("click", ()=>{
        if (obj.type==="adresse" && obj.adgangsadresse?.id){
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`).then(r=>r.json()).then(ad=>{
            const [lon,lat]=ad.adgangspunkt.koordinater;
            setCoordinateBox(lat,lon); placeMarkerAndZoom([lat,lon], obj.tekst);
            fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
              .then(r=>r.json()).then(rev=>updateInfoBox(rev,lat,lon)).catch(()=>{});
            updateInfoBox(ad,lat,lon);
            resultsList.innerHTML=""; vej1List.innerHTML=""; vej2List.innerHTML="";
          });
        } else if (obj.type==="stednavn" && obj.bbox?.coordinates?.[0]?.length){
          const [x,y]=obj.bbox.coordinates[0][0]; placeMarkerAndZoom([x,y], obj.navn); listEl.innerHTML=""; listEl.style.display="none";
        } else if (obj.type==="stednavn" && obj.geometry?.coordinates){
          const c = Array.isArray(obj.geometry.coordinates[0]) ? obj.geometry.coordinates[0] : obj.geometry.coordinates;
          placeMarkerAndZoom(c, obj.navn); listEl.innerHTML=""; listEl.style.display="none";
        } else if (obj.type==="strandpost"){
          setCoordinateBox(obj.lat,obj.lon); placeMarkerAndZoom([obj.lat,obj.lon], obj.tekst);
          listEl.innerHTML=""; listEl.style.display="none";
          const marker=currentMarker;
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${obj.lon}&y=${obj.lat}&struktur=flad`).then(r=>r.json()).then(rev=>{
            const vej=rev?.adgangsadresse?.vejnavn||rev?.vejnavn||"?";
            const hus=rev?.adgangsadresse?.husnr||rev?.husnr||"";
            const pn =rev?.adgangsadresse?.postnr||rev?.postnr||"?";
            const by =rev?.adgangsadresse?.postnrnavn||rev?.postnrnavn||"";
            const adr=`${vej} ${hus}, ${pn} ${by}`;
            const eva=`${vej},${hus},${pn}`;
            const note=`${vej} ${hus}, ${pn} ${by}`;
            marker.bindPopup(`<strong>${obj.tekst}</strong><br>${adr}<br>
              <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${eva}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Eva.Net</a>
              &nbsp;
              <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${note}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Notes</a>`).openPopup();
            marker.on("popupclose", ()=>{ map.removeLayer(marker); currentMarker=null; document.getElementById("infoBox").style.display="none"; document.getElementById("statsvejInfoBox").style.display="none"; resetCoordinateBox(); resultsList.innerHTML=""; });
          }).catch(()=> marker.bindPopup(`<strong>${obj.tekst}</strong><br>(Reverse geocoding fejlede)`).openPopup());
        }
      });
      listEl.appendChild(li); searchItems.push(li);
    });
    listEl.style.display = combined.length>0 ? "block" : "none";
  }).catch(()=>{});
}

/***************************************************
 * Vejgeometri fra DAR
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId){
  try{
    const url=`https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
    const data=await (await fetch(url)).json();
    const first=data?.[0];
    const wkt=first?.navngivenVej?.vejnavnebeliggenhed_vejnavnelinje;
    return wkt ? wellknown.parse(wkt) : null;
  }catch(e){ return null; }
}

/***************************************************
 * Marker + zoom
 ***************************************************/
function placeMarkerAndZoom(coords, label){
  if (coords[0]>90 || coords[1]>90) coords=convertToWGS84(coords[0],coords[1]);
  const [lat,lon]=coords;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker=L.marker([lat,lon]).addTo(map);
  map.setView([lat,lon], 16);
  document.getElementById("address").textContent=label;
  document.getElementById("streetviewLink").href=`https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  document.getElementById("infoBox").style.display="block";
}

/***************************************************
 * Info-bokse – luk
 ***************************************************/
document.getElementById("statsvejCloseBtn").addEventListener("click", ()=>{
  document.getElementById("statsvejInfoBox").style.display="none";
  document.getElementById("infoBox").style.display="none";
  resetCoordinateBox(); if (currentMarker){ map.removeLayer(currentMarker); currentMarker=null; }
});
document.getElementById("infoCloseBtn").addEventListener("click", ()=>{
  document.getElementById("infoBox").style.display="none";
  document.getElementById("statsvejInfoBox").style.display="none";
  if (currentMarker){ map.removeLayer(currentMarker); currentMarker=null; }
  resetCoordinateBox(); resultsList.innerHTML=""; document.getElementById("kommuneOverlay").style.display="none";
});

/***************************************************
 * Find kryds (Turf)
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async ()=>{
  if (!selectedRoad1 || !selectedRoad2){ alert("Vælg venligst to veje først."); return; }
  if (!selectedRoad1.geometry || !selectedRoad2.geometry){ alert("Geometri ikke tilgængelig for en eller begge veje."); return; }
  const line1=turf.multiLineString(selectedRoad1.geometry.coordinates);
  const line2=turf.multiLineString(selectedRoad2.geometry.coordinates);
  const inter=turf.lineIntersect(line1, line2);
  if (inter.features.length===0) { alert("De valgte veje krydser ikke hinanden."); return; }
  const pts=[];
  for (const f of inter.features){
    const [lon,lat]=proj4("EPSG:25832","EPSG:4326",[f.geometry.coordinates[0], f.geometry.coordinates[1]]);
    pts.push([lat,lon]);
    const marker=L.marker([lat,lon]).addTo(map);
    const url=`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
    try{
      const rev=await (await fetch(url)).json();
      const adr=`${rev.vejnavn||"Ukendt"} ${rev.husnr||""}, ${rev.postnr||"?"} ${rev.postnrnavn||""}`;
      const eva=`${rev.vejnavn||""},${rev.husnr||""},${rev.postnr||""}`;
      const note=`${rev.vejnavn||""} ${rev.husnr||""}, ${rev.postnr||""} ${rev.postnrnavn||""}`;
      marker.bindPopup(`${adr}<br>
        <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${eva}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Eva.Net</a>
        &nbsp;
        <a href="#" onclick="(function(el){el.style.color='red';copyToClipboard('${note}');showCopyPopup('Kopieret');setTimeout(function(){el.style.color='';},800);})(this);return false;">Notes</a>`).openPopup();
    }catch(_){ marker.bindPopup(`(${lat.toFixed(6)}, ${lon.toFixed(6)})<br>Reverse geocoding fejlede.`).openPopup(); }
    marker.on("popupclose", ()=> map.removeLayer(marker));
  }
  if (pts.length===1) map.setView(pts[0],16); else map.fitBounds(pts);
});

/***************************************************
 * Distance-cirkel + ladestandere
 ***************************************************/
let currentCircle=null, selectedRadius=null;
function toggleCircle(r){
  selectedRadius=r;
  if (!currentMarker){ alert("Vælg venligst en adresse eller klik på kortet først."); return; }
  const ll=currentMarker.getLatLng();
  if (currentCircle && currentCircle.getRadius()===r){
    map.removeLayer(currentCircle); currentCircle=null; selectedRadius=null;
    if (map.hasLayer(chargeMapLayer)) map.removeLayer(chargeMapLayer);
  } else {
    if (currentCircle) map.removeLayer(currentCircle);
    currentCircle=L.circle(ll,{radius:r,color:"blue",fillOpacity:.2}).addTo(map);
    if (map.hasLayer(chargeMapLayer)) map.fire('overlayadd',{layer:chargeMapLayer});
  }
}
document.getElementById("btn10").addEventListener("click", ()=>{ selectedRadius=10000; toggleCircle(10000); });
document.getElementById("btn25").addEventListener("click", ()=>{ selectedRadius=25000; toggleCircle(25000); });
document.getElementById("btn50").addEventListener("click", ()=>{ selectedRadius=50000; toggleCircle(50000); });
document.getElementById("btn100").addEventListener("click", ()=>{ selectedRadius=100000; toggleCircle(100000); });
document.addEventListener("DOMContentLoaded", ()=> document.getElementById("search").focus() );

/***************************************************
 * 🔎 Auto-tilføj “Km-markører (CVF)” overlay
 * Vi finder lagnavn via GetCapabilities på cvf.vd.dk.
 ***************************************************/
(async function autoAddKmLayer(){
  const capUrls = [
    "https://cvf.vd.dk/cvf/wms?service=WMS&request=GetCapabilities",
    "https://geocloud.vd.dk/CVF/wms?service=WMS&request=GetCapabilities"
  ];
  let chosen = null;
  for (const url of capUrls){
    try{
      const xmlTxt = await (await fetch(url)).text();
      const dom = new DOMParser().parseFromString(xmlTxt, "text/xml");
      // find første layer hvor Name eller Title matcher “km”
      const layers = [...dom.querySelectorAll("Layer>Layer")];
      const hit = layers.find(n=>{
        const name  = n.querySelector("Name")?.textContent || "";
        const title = n.querySelector("Title")?.textContent || "";
        return /km|kilom/i.test(name) || /km|kilom/i.test(title);
      });
      if (hit){
        const name = hit.querySelector("Name").textContent;
        chosen = { base: url.split("?")[0], layerName: name };
        break;
      }
    }catch(_){ /* prøv næste */ }
  }
  // Fald tilbage til et par gætværk-navne hvis vi ikke må hente capabilities pga. CORS
  if (!chosen){
    chosen = { base: "https://cvf.vd.dk/cvf/wms", layerName: "CVF:KM_MARKORER" };
  }
  // Opret overlay
  const kmLayer = L.tileLayer.wms(chosen.base, {
    layers: chosen.layerName,
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    attribution: "© Vejdirektoratet / CVF"
  });
  layerControl.addOverlay(kmLayer, "Km-markører (CVF)");
})();

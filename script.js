/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");
function convertToWGS84(x, y) {
  let result = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  return [result[1], result[0]]; // [lat, lon]
}

/***************************************************
 * Hjælpefunktion til at kopiere tekst
 ***************************************************/
function copyToClipboard(str) {
  let finalStr = str.replace(/\\n/g, "\n");
  navigator.clipboard.writeText(finalStr)
    .then(() => console.log("Copied to clipboard:", finalStr))
    .catch(err => console.error("Could not copy text:", err));
}

/***************************************************
 * Sorteringsprioritet
 ***************************************************/
function getSortPriority(item, query) {
  let text = "";
  if (item.type === "adresse") text = item.tekst || "";
  else if (item.type === "stednavn") text = item.navn || "";
  else if (item.type === "strandpost") text = item.tekst || "";
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText === lowerQuery) return 0;
  if (lowerText.startsWith(lowerQuery)) return 1;
  if (lowerText.includes(lowerQuery)) return 2;
  return 3;
}

/***************************************************
 * Leaflet-kort + lag
 ***************************************************/
const map = L.map("map", {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});
const osmLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur" }
).addTo(map);
const ortofotoLayer = L.tileLayer.wms(
  "https://api.dataforsyningen.dk/orto_foraar_DAF?service=WMS&request=GetCapabilities&token=a63a88838c24fc85d47f32cde0ec0144",
  { layers: "orto_foraar", format: "image/jpeg", transparent: false, version: "1.1.1", attribution: "Ortofoto © Kortforsyningen" }
);
const redningsnrLayer = L.tileLayer.wms(
  "https://kort.strandnr.dk/geoserver/nobc/ows",
  { layers: "Redningsnummer", format: "image/png", transparent: true, version: "1.3.0", attribution: "Data: redningsnummer.dk" }
);
const baseMaps = { "OpenStreetMap": osmLayer, "Satellit": ortofotoLayer };
const overlayMaps = { "Strandposter": redningsnrLayer };
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
 * Strandposter
 ***************************************************/
let allStrandposter = [];
function fetchAllStrandposter() {
  const wfsUrl = "https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=nobc:Redningsnummer&outputFormat=application/json";
  return fetch(wfsUrl)
    .then(resp => resp.json())
    .then(geojson => {
      if (geojson.features) {
        allStrandposter = geojson.features;
      }
    })
    .catch(err => console.error("Fejl ved hentning af strandposter:", err));
}
function doSearchStrandposter(query) {
  query = query.toLowerCase();
  return new Promise(resolve => {
    function filterAndMap() {
      const results = allStrandposter.filter(f => {
        const rednr = (f.properties.StrandNr || "").toLowerCase();
        return rednr.includes(query);
      }).map(f => {
        const coords = f.geometry.coordinates; // [lon, lat]
        let lat, lon;
        if (coords[0]>90 || coords[1]>90) {
          let c = convertToWGS84(coords[0], coords[1]);
          lat = c[0]; lon = c[1];
        } else {
          lon = coords[0]; lat = coords[1];
        }
        return {
          type: "strandpost",
          tekst: "Redningsnummer: " + (f.properties.StrandNr||""),
          lat: lat, lon: lon,
          feature: f
        };
      });
      resolve(results);
    }
    if (allStrandposter.length === 0) {
      fetchAllStrandposter().then(filterAndMap).catch(() => resolve([]));
    } else {
      filterAndMap();
    }
  });
}
map.on("overlayadd", e => {
  if (e.name==="Strandposter" && allStrandposter.length===0) {
    fetchAllStrandposter();
  }
});

/***************************************************
 * Klik på kort => reverse geocoding
 ***************************************************/
map.on("click", e => {
  const lat = e.latlng.lat, lon = e.latlng.lng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lon]).addTo(map);
  document.getElementById("coordinateBox").textContent = `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";
  const revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  fetch(revUrl)
    .then(r => r.json())
    .then(data => updateInfoBox(data, lat, lon))
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * updateInfoBox => viser alt i #infoBox
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  // 1) Fuldt adressestreng
  const adresseStr = `${data.vejnavn||"?"} ${data.husnr||""}, ${data.postnr||"?"} ${data.postnrnavn||""}`;
  document.getElementById("address").textContent = adresseStr;

  // 2) Sæt search-felt = fuld adresse
  const searchInput = document.getElementById("search");
  searchInput.value = adresseStr;

  // 3) Streetview, Skråfoto
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  const skraafotoLink = document.getElementById("skraafotoLink");
  skraafotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skraafotoLink.style.display = "block";

  // 4) Ekstra info
  const extraInfoEl = document.getElementById("extra-info");
  extraInfoEl.innerHTML = ""; // Ryd
  // Eva.Net / Notes links
  const evaFormat = `${data.vejnavn||""},${data.husnr||""},${data.postnr||""}`;
  const notesFormat = `${data.vejnavn||""} ${data.husnr||""}\\n${data.postnr||""} ${data.postnrnavn||""}`;
  extraInfoEl.innerHTML += `
    <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
    <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
  `;

  // 5) Statsvej
  const statsvejData = await checkForStatsvej(lat, lon);
  if (statsvejData) {
    extraInfoEl.innerHTML += `
      <br><strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR||"Ukendt"}
      <br><strong>Forgrening:</strong> ${statsvejData.FORGRENING||"Ukendt"}
      <br><strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE||"Ukendt"}
      <br><strong>Bestyrer:</strong> ${statsvejData.BESTYRER||"Ukendt"}
      <br><strong>Vejtype:</strong> ${statsvejData.VEJTYPE||"Ukendt"}
    `;
  }

  // 6) Kommune => Døde dyr / Gader og veje
  if (data.kommunekode) {
    try {
      const komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
      const komResp = await fetch(komUrl);
      if (komResp.ok) {
        const komData = await komResp.json();
        const kommunenavn = komData.navn||"";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          const info = kommuneInfo[kommunenavn];
          const doedeDyr = info["Døde dyr"];
          const gaderVeje= info["Gader og veje"];
          extraInfoEl.innerHTML += `<br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
        }
      }
    } catch(e) {
      console.error("Kunne ikke hente kommuneinfo:", e);
    }
  }

  // 7) Vis #infoBox
  document.getElementById("infoBox").style.display = "block";

  // 8) Kommunekode + vejkode i nederste venstre => #kommuneOverlay
  const kk = data.kommunekode || "";
  const vk = data.vejkode || "";
  const overlay = document.getElementById("kommuneOverlay");
  if (kk || vk) {
    overlay.style.display = "block";
    overlay.textContent = `Kommunekode: ${kk} | Vejkode: ${vk}`;
  } else {
    overlay.style.display = "none";
  }
}

/***************************************************
 * Luk infoBox
 ***************************************************/
const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";
  document.getElementById("kommuneOverlay").style.display = "none";
  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

/***************************************************
 * Søgefelter
 ***************************************************/
const search   = document.getElementById("search");
const clearBtn = document.getElementById("clearSearch");
const resultsList = document.getElementById("results");

const vej1Input = document.getElementById("vej1");
const vej2Input = document.getElementById("vej2");
const vej1List  = document.getElementById("results-vej1");
const vej2List  = document.getElementById("results-vej2");

/* Tilføj clear-button-liste-funktion */
function addClearButton(inputElement, listElement) {
  const btn = document.createElement("span");
  btn.innerHTML = "&times;";
  btn.classList.add("clear-button");
  inputElement.parentElement.appendChild(btn);

  inputElement.addEventListener("input", function() {
    btn.style.display = inputElement.value.length>0 ? "inline" : "none";
  });
  btn.addEventListener("click", function() {
    inputElement.value = "";
    listElement.innerHTML = "";
    btn.style.display="none";
  });
  inputElement.addEventListener("keydown", function(e) {
    if(e.key==="Backspace" && inputElement.value.length===0) {
      listElement.innerHTML="";
    }
  });
  btn.style.display="none";
}
addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

/***************************************************
 * Piletaster
 ***************************************************/
let searchItems = [], searchCurrentIndex = -1;
let vej1Items = [], vej1CurrentIndex=-1;
let vej2Items = [], vej2CurrentIndex=-1;

/***************************************************
 * #search => doSearch
 ***************************************************/
search.addEventListener("input", function() {
  const txt = search.value.trim();
  if(txt.length<2) {
    clearBtn.style.display="none";
    resultsList.innerHTML="";
    document.getElementById("infoBox").style.display="none";
    searchItems=[];
    return;
  }
  clearBtn.style.display="inline";
  doSearch(txt, resultsList);
});

search.addEventListener("keydown", function(e) {
  if(searchItems.length===0) return;
  if(e.key==="ArrowDown") {
    e.preventDefault();
    searchCurrentIndex = (searchCurrentIndex+1)%searchItems.length;
    highlightSearchItem();
  } else if(e.key==="ArrowUp") {
    e.preventDefault();
    searchCurrentIndex=(searchCurrentIndex+searchItems.length-1)%searchItems.length;
    highlightSearchItem();
  } else if(e.key==="Enter") {
    e.preventDefault();
    if(searchCurrentIndex>=0) {
      searchItems[searchCurrentIndex].click();
    }
  }
});
function highlightSearchItem() {
  searchItems.forEach(li=>li.classList.remove("highlight"));
  if(searchCurrentIndex>=0 && searchCurrentIndex<searchItems.length) {
    searchItems[searchCurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Vej1 => doSearchRoad
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if(txt.length<2) {
    vej1List.innerHTML="";
    vej1List.style.display="none";
    vej1Items=[];
    return;
  }
  doSearchRoad(txt, vej1List, vej1Input,"vej1");
});
vej1Input.addEventListener("keydown", function(e) {
  if(vej1Items.length===0) return;
  if(e.key==="ArrowDown") {
    e.preventDefault();
    vej1CurrentIndex=(vej1CurrentIndex+1)%vej1Items.length;
    highlightVej1Item();
  } else if(e.key==="ArrowUp") {
    e.preventDefault();
    vej1CurrentIndex=(vej1CurrentIndex+vej1Items.length-1)%vej1Items.length;
    highlightVej1Item();
  } else if(e.key==="Enter") {
    e.preventDefault();
    if(vej1CurrentIndex>=0) vej1Items[vej1CurrentIndex].click();
  }
});
function highlightVej1Item() {
  vej1Items.forEach(li=>li.classList.remove("highlight"));
  if(vej1CurrentIndex>=0 && vej1CurrentIndex<vej1Items.length) {
    vej1Items[vej1CurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Vej2 => doSearchRoad
 ***************************************************/
vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if(txt.length<2) {
    vej2List.innerHTML="";
    vej2List.style.display="none";
    vej2Items=[];
    return;
  }
  doSearchRoad(txt, vej2List, vej2Input,"vej2");
});
vej2Input.addEventListener("keydown", function(e) {
  if(vej2Items.length===0) return;
  if(e.key==="ArrowDown") {
    e.preventDefault();
    vej2CurrentIndex=(vej2CurrentIndex+1)%vej2Items.length;
    highlightVej2Item();
  } else if(e.key==="ArrowUp") {
    e.preventDefault();
    vej2CurrentIndex=(vej2CurrentIndex+vej2Items.length-1)%vej2Items.length;
    highlightVej2Item();
  } else if(e.key==="Enter") {
    e.preventDefault();
    if(vej2CurrentIndex>=0) vej2Items[vej2CurrentIndex].click();
  }
});
function highlightVej2Item() {
  vej2Items.forEach(li=>li.classList.remove("highlight"));
  if(vej2CurrentIndex>=0 && vej2CurrentIndex<vej2Items.length) {
    vej2Items[vej2CurrentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Clear-knap => reset
 ***************************************************/
clearBtn.addEventListener("click", function() {
  search.value="";
  resultsList.innerHTML="";
  clearBtn.style.display="none";
  document.getElementById("infoBox").style.display="none";
  document.getElementById("coordinateBox").style.display="none";
  document.getElementById("kommuneOverlay").style.display="none";
  if(currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker=null;
  }
});

/***************************************************
 * doSearchRoad => autocomplete for vej1/vej2
 ***************************************************/
async function doSearchRoad(query,listElement,inputField,which) {
  const url=`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  try {
    const r=await fetch(url);
    const data=await r.json();
    listElement.innerHTML="";
    if(which==="vej1") { vej1Items=[]; vej1CurrentIndex=-1; }
    else { vej2Items=[]; vej2CurrentIndex=-1; }
    data.sort((a,b)=>a.tekst.localeCompare(b.tekst));
    const unique=new Set();
    data.forEach(item=>{
      const vejnavn=item.adgangsadresse?.vejnavn||"Ukendt vej";
      const kommune=item.adgangsadresse?.postnrnavn||"Ukendt";
      const postnr=item.adgangsadresse?.postnr||"?";
      const adgangsId=item.adgangsadresse?.id||null;
      const key=`${vejnavn}-${postnr}`;
      if(unique.has(key)) return;
      unique.add(key);
      const li=document.createElement("li");
      li.textContent=`${vejnavn}, ${kommune} (${postnr})`;
      li.addEventListener("click", async ()=>{
        inputField.value=vejnavn;
        listElement.innerHTML="";
        listElement.style.display="none";
        if(!adgangsId) return;
        try {
          const detailUrl=`https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
          const detailResp=await fetch(detailUrl);
          const detailData=await detailResp.json();
          const roadSelection={
            vejnavn:vejnavn,
            kommunekode:detailData.kommunekode,
            vejkode:detailData.vejkode,
            husnummerId:detailData.id
          };
          const geometry=await getNavngivenvejKommunedelGeometry(detailData.id);
          roadSelection.geometry=geometry;
          if(which==="vej1") selectedRoad1=roadSelection;
          else selectedRoad2=roadSelection;
          console.log("Selected road:",roadSelection);
        } catch(err) {
          console.error("Fejl i fetch /adgangsadresser/{id}:",err);
        }
      });
      listElement.appendChild(li);
      if(which==="vej1") vej1Items.push(li);
      else vej2Items.push(li);
    });
    listElement.style.display=data.length>0?"block":"none";
  } catch(err) {
    console.error("Fejl i doSearchRoad:",err);
  }
}

/***************************************************
 * doSearch => kombinerer adresser, stednavne, strandposter
 ***************************************************/
function doSearch(query,listElement) {
  const addrUrl=`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;
  const stedUrl=`https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=${encodeURIComponent(query)}&limit=100&token=a63a88838c24fc85d47f32cde0ec0144`;
  const strandPromise = map.hasLayer(redningsnrLayer)? doSearchStrandposter(query):Promise.resolve([]);
  
  Promise.all([
    fetch(addrUrl).then(r=>r.json()).catch(_=>[]),
    fetch(stedUrl).then(r=>r.json()).catch(_=>{}),
    strandPromise
  ])
  .then(([addrData,stedData,strandData])=>{
    listElement.innerHTML="";
    searchItems=[];
    searchCurrentIndex=-1;
    const addrResults=(addrData||[]).map(item=>({ type:"adresse", tekst:item.tekst, adgangsadresse:item.adgangsadresse }));
    let stedResults=[];
    if(stedData) {
      if(Array.isArray(stedData.results)) {
        stedResults=stedData.results.map(res=>({
          type:"stednavn",
          navn:res.visningstekst||res.navn,
          bbox:res.bbox||null,
          geometry:res.geometry
        }));
      } else if(Array.isArray(stedData)) {
        stedResults=stedData.map(res=>({
          type:"stednavn",
          navn:res.visningstekst||res.skrivemaade_officiel,
          bbox:res.bbox||null,
          geometry:res.geometri
        }));
      }
    }
    const combined=[...addrResults,...stedResults,...strandData];
    combined.sort((a,b)=>{
      if(a.type==="stednavn" && b.type==="adresse") return -1;
      if(a.type==="adresse" && b.type==="stednavn") return 1;
      return getSortPriority(a, query)-getSortPriority(b, query);
    });
    
    combined.forEach(obj=>{
      const li=document.createElement("li");
      if(obj.type==="strandpost") li.textContent=obj.tekst;
      else if(obj.type==="adresse") li.textContent=obj.tekst;
      else if(obj.type==="stednavn") li.textContent=obj.navn;
      li.addEventListener("click",()=>{
        // Hvis adresse => kald detail
        if(obj.type==="adresse"&&obj.adgangsadresse&&obj.adgangsadresse.id) {
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r=>r.json())
            .then(fullAdr=>{
              const [lon,lat]=fullAdr.adgangspunkt.koordinater;
              // Koordinater i bund
              document.getElementById("coordinateBox").textContent=`Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
              document.getElementById("coordinateBox").style.display="block";
              // Zoom
              placeMarkerAndZoom([lat, lon], obj.tekst);
              // InfoBox
              updateInfoBox(fullAdr, lat, lon);
              listElement.innerHTML="";
              vej1List.innerHTML="";
              vej2List.innerHTML="";
            })
            .catch(err=>console.error("Fejl i adressedetaljer:",err));
        }
        else if(obj.type==="stednavn"&&obj.bbox&&obj.bbox.coordinates&&obj.bbox.coordinates[0]) {
          const [x,y]=obj.bbox.coordinates[0][0];
          placeMarkerAndZoom([y, x], obj.navn);
        }
        else if(obj.type==="strandpost") {
          placeMarkerAndZoom([obj.lat,obj.lon],obj.tekst);
        }
      });
      listElement.appendChild(li);
      searchItems.push(li);
    });
    listElement.style.display=combined.length>0?"block":"none";
  })
  .catch(err=>console.error("Fejl i doSearch:",err));
}

/***************************************************
 * getNavngivenvejKommunedelGeometry
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  const url=`https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  try {
    const resp=await fetch(url);
    const data=await resp.json();
    if(Array.isArray(data)&&data.length>0) {
      const first=data[0];
      if(first.navngivenVej && first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje) {
        const wkt=first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje;
        const geojson=wellknown.parse(wkt);
        return geojson;
      }
    }
  } catch(err){
    console.error("Fejl i getNavngivenvejKommunedelGeometry:",err);
  }
  return null;
}

/***************************************************
 * checkForStatsvej => geocloud
 ***************************************************/
async function checkForStatsvej(lat, lon){
  const [utmX,utmY]=proj4("EPSG:4326","EPSG:25832",[lon,lat]);
  const buffer=100;
  const bbox=`${utmX-buffer},${utmY-buffer},${utmX+buffer},${utmY+buffer}`;
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
  try{
    const r=await fetch(url);
    const textData=await r.text();
    if(textData.startsWith("Results")) return null;
    const json=JSON.parse(textData);
    if(json.features&&json.features.length>0){
      return json.features[0].properties;
    }
    else return null;
  } catch(err){
    console.error("Fejl ved statsvej:",err);
    return null;
  }
}

/***************************************************
 * Luk infoBox => sæt alt til "ingenting"
 ***************************************************/
document.getElementById("infoCloseBtn").addEventListener("click",()=>{
  document.getElementById("infoBox").style.display="none";
  document.getElementById("coordinateBox").style.display="none";
  document.getElementById("kommuneOverlay").style.display="none";
  if(currentMarker){
    map.removeLayer(currentMarker);
    currentMarker=null;
  }
});

/***************************************************
 * "Find X"-knap => intersection
 ***************************************************/
let selectedRoad1=null, selectedRoad2=null;
document.getElementById("findKrydsBtn").addEventListener("click",async ()=>{
  if(!selectedRoad1||!selectedRoad2){
    alert("Vælg to veje først!");
    return;
  }
  if(!selectedRoad1.geometry||!selectedRoad2.geometry){
    alert("Geometri mangler på en eller begge veje");
    return;
  }
  let l1=turf.multiLineString(selectedRoad1.geometry.coordinates);
  let l2=turf.multiLineString(selectedRoad2.geometry.coordinates);
  let intersection=turf.lineIntersect(l1,l2);
  if(intersection.features.length===0){
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs=[];
    for(let f of intersection.features){
      let [lon,lat]=proj4("EPSG:25832","EPSG:4326",[f.geometry.coordinates[0],f.geometry.coordinates[1]]);
      let revUrl=`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
      let revData=await fetch(revUrl).then(r=>r.json());
      let popupText=`
        ${revData.vejnavn||"Ukendt"} ${revData.husnr||""},
        ${revData.postnr||"?"} ${revData.postnrnavn||""}
      `;
      let evaFmt=`${revData.vejnavn||""},${revData.husnr||""},${revData.postnr||""}`;
      let notesFmt=`${revData.vejnavn||""} ${revData.husnr||""}\\n${revData.postnr||""} ${revData.postnrnavn||""}`;
      popupText+=`
        <br>
        <a href="#" onclick="copyToClipboard('${evaFmt}');return false;">Eva.Net</a> |
        <a href="#" onclick="copyToClipboard('${notesFmt}');return false;">Notes</a>
      `;
      let marker=L.marker([lat,lon]).addTo(map);
      marker.bindPopup(popupText.trim()).openPopup();
      latLngs.push([lat,lon]);
    }
    if(latLngs.length===1){
      map.setView(latLngs[0],16);
    } else {
      map.fitBounds(latLngs);
    }
  }
});

/***************************************************
 * Distance-knapper
 ***************************************************/
let currentCircle=null;
function toggleCircle(radius){
  if(!currentMarker){
    alert("Vælg en adresse eller klik på kortet først.");
    return;
  }
  let latLng=currentMarker.getLatLng();
  if(currentCircle && currentCircle.getRadius()===radius){
    map.removeLayer(currentCircle);
    currentCircle=null;
  } else {
    if(currentCircle) map.removeLayer(currentCircle);
    currentCircle=L.circle(latLng,{
      radius:radius,
      color:"blue",
      fillOpacity:0.2
    }).addTo(map);
  }
}
document.getElementById("btn10").addEventListener("click",()=>toggleCircle(10000));
document.getElementById("btn50").addEventListener("click",()=>toggleCircle(50000));
document.getElementById("btn100").addEventListener("click",()=>toggleCircle(100000));

document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("search").focus();
});

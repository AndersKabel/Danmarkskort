/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
    let result = proj4("EPSG:25832", "EPSG:4326", [y, x]); // Bytter x og y
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
var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
    }
).addTo(map);

L.control.layers({ "OpenStreetMap": osmLayer }, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Klik på kort => /adgangsadresser/reverse
 ***************************************************/
map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

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
function updateInfoBox(data, lat, lon) {
    const streetviewLink = document.getElementById("streetviewLink");
    const addressEl = document.getElementById("address");
    const resultsList = document.getElementById("results");
    const vej1List = document.getElementById("results-vej1");
    const vej2List = document.getElementById("results-vej2");

    const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    addressEl.textContent = adresseStr;

    if (resultsList) resultsList.innerHTML = "";
    if (vej1List) vej1List.innerHTML = "";
    if (vej2List) vej2List.innerHTML = "";

    document.getElementById("infoBox").style.display = "block";
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
});

searchInput.addEventListener("keydown", function(e) {
    if (items.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "Tab") {
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
        items[currentIndex].scrollIntoView({ block: "nearest" });
    }
}

/***************************************************
 * doSearch => henter addresses + stednavne
 ***************************************************/
function doSearch(query, listElement) {
    let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

    fetch(addrUrl)
        .then(response => response.json())
        .then(data => {
            listElement.innerHTML = "";
            items = [];  
            currentIndex = -1;

            data.forEach(obj => {
                let li = document.createElement("li");
                li.textContent = obj.tekst;

                li.addEventListener("click", function() {
                    searchInput.value = obj.tekst;
                    listElement.innerHTML = "";
                });

                listElement.appendChild(li);
                items.push(li);
            });
        })
        .catch(error => console.error("Fejl ved hentning af adresser:", error));
}

/***************************************************
 * doSearchRoad => henter vejnavne
 ***************************************************/
function doSearchRoad(query, listElement, inputField) {
    let roadUrl = `https://api.dataforsyningen.dk/vejnavne?navn=${encodeURIComponent(query)}&struktur=flad`;

    fetch(roadUrl)
        .then(response => response.json())
        .then(data => {
            listElement.innerHTML = "";
            items = [];
            currentIndex = -1;

            data.forEach((road, index) => {
                let li = document.createElement("li");
                li.textContent = `${road.navn}, ${road.kommune.navn}`;
                li.setAttribute("data-index", index);

                li.addEventListener("click", function () {
                    inputField.value = road.navn;
                    listElement.innerHTML = "";
                });

                listElement.appendChild(li);
                items.push(li);
            });
        })
        .catch(error => console.error("Fejl ved hentning af vejnavne:", error));
}

/***************************************************
 * placeMarkerAndZoom => Zoom + marker
 ***************************************************/
function placeMarkerAndZoom([lat, lon], displayText) {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 16);

    document.getElementById("address").textContent = displayText;
    document.getElementById("streetviewLink").href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * handleKeyNavigation => Styrer piletaster i søgeresultater
 ***************************************************/
function handleKeyNavigation(e, listElement) {
    let items = listElement.getElementsByTagName("li");

    if (items.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        currentIndex = (currentIndex + 1) % items.length;
        highlightItem(items);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        currentIndex = (currentIndex + items.length - 1) % items.length;
        highlightItem(items);
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (currentIndex >= 0) {
            items[currentIndex].click();
        }
    }
}

// Definer koordinatsystem EPSG:25832
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
function convertToWGS84(x, y) {
    return proj4("EPSG:25832", "EPSG:4326", [x, y]);
}

// Initialiser kortet
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

var baseMaps = { "OpenStreetMap": osmLayer };
L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Marker ved klik på kort
var currentMarker;
map.on('click', function (e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`)
        .then(response => response.json())
        .then(data => {
            console.log("Reverse geocoding resultat:", data);
            const streetviewLink = document.getElementById("streetviewLink");
            const chosenAddress  = document.getElementById("chosenAddress");
            const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, `
                             + `${data.postnr || "?"} ${data.postnrnavn || ""}`;

            streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
            chosenAddress.textContent = adresseStr;
            document.getElementById("infoBox").style.display = "block";
        })
        .catch(err => {
            console.error("Fejl ved reverse geocoding:", err);
        });
});

// Håndtering af søgefelter
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Array til piletaster i #search-resultater
var items = [];
var currentIndex = -1;

// Indtastning i #search
searchInput.addEventListener("input", function() {
    if (searchInput.value.trim() === "") {
        clearBtn.style.display = "none";
        resultsList.innerHTML = "";
    } else {
        clearBtn.style.display = "inline";
        doAutocomplete(searchInput.value, resultsList);
    }
});

// TAB => ryk fokus til første <li>, men vi bruger piletaster i selve <li> elements
// Enter => se "keydown" i <li> i doAutocomplete

// Ryd søgning ved klik på kryds
clearBtn.addEventListener("click", function() {
    searchInput.value = "";
    resultsList.innerHTML = "";
    clearBtn.style.display = "none";
    document.getElementById("infoBox").style.display = "none";
});

// Indtastning i vej1
vej1Input.addEventListener("input", function() {
    const txt = vej1Input.value.trim();
    if (txt === "") {
        vej1List.innerHTML = "";
        return;
    }
    doAutocomplete(txt, vej1List);
});

// Indtastning i vej2
vej2Input.addEventListener("input", function() {
    const txt = vej2Input.value.trim();
    if (txt === "") {
        vej2List.innerHTML = "";
        return;
    }
    doAutocomplete(txt, vej2List);
});

// Autocomplete
function doAutocomplete(query, listElement) {
    fetch("https://api.dataforsyningen.dk/adresser/autocomplete?q=" + encodeURIComponent(query))
        .then(resp => resp.json())
        .then(data => {
            listElement.innerHTML = "";
            console.log("Auto data for '" + query + "':", data);

            // Hvis det er #search's resultater => nulstil items til piletaster
            if (listElement === resultsList) {
                items = [];
                currentIndex = -1;
            }

            data.forEach(item => {
                let li = document.createElement("li");
                li.textContent = item.tekst;

                // Gør li fokuserbar med TAB
                li.tabIndex = 0;

                // Ved fokus => highlight
                li.addEventListener("focus", () => {
                    removeAllHighlights(listElement);
                    li.classList.add("highlight");
                });

                // Ved blur => fjern highlight
                li.addEventListener("blur", () => {
                    li.classList.remove("highlight");
                });

                // Ved piletast + enter => vælg
                li.addEventListener("keydown", (e) => {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (li.nextElementSibling) {
                            li.nextElementSibling.focus();
                        }
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (li.previousElementSibling) {
                            li.previousElementSibling.focus();
                        }
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        selectAddress(item, listElement);
                    }
                });

                // Ved klik => vælg
                li.addEventListener("click", () => {
                    selectAddress(item, listElement);
                });

                listElement.appendChild(li);

                // Hvis det er #search => tilføj i items-liste (hvis du vil håndtere i input)
                if (listElement === resultsList) {
                    items.push(li);
                }
            });

            // Sæt evt. fokus på første li, hvis det er #search
            if (listElement === resultsList && items.length > 0) {
                items[0].focus();
            }
        })
        .catch(err => console.error("Fejl i autocomplete:", err));
}

// Fjern highlight på alle <li> i en liste
function removeAllHighlights(ul) {
    let all = ul.querySelectorAll("li");
    all.forEach(li => li.classList.remove("highlight"));
}

// Når en adresse er valgt
function selectAddress(item, listElement) {
    if (listElement === resultsList) {
        searchInput.value = item.tekst;
    } else if (listElement === vej1List) {
        vej1Input.value = item.tekst;
    } else if (listElement === vej2List) {
        vej2Input.value = item.tekst;
    }
    listElement.innerHTML = "";
    placeMarkerAndZoom(item);
    showStreetViewLink(item);
}

// Zoom + markør
function placeMarkerAndZoom(item) {
    // Antag x,y findes i item.data.x / item.data.y
    // Juster hvis dine data ligger andetsteds
    let x = item.data.x;
    let y = item.data.y;

    let coords = convertToWGS84(x, y);
    let lat = coords[1];
    let lon = coords[0];

    map.setView([lat, lon], 17);
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);
}

// StreetView-link
function showStreetViewLink(item) {
    let x = item.data.x;
    let y = item.data.y;

    let coords = convertToWGS84(x, y);
    let lat = coords[1];
    let lon = coords[0];

    const streetviewLink = document.getElementById("streetviewLink");
    streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
    document.getElementById("infoBox").style.display = "block";
}

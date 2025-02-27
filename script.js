// Definer koordinatsystem EPSG:25832
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs");
function convertToWGS84(x, y) {
    return proj4("EPSG:25832", "EPSG:4326", [x, y]);
}

// Initialiser kortet – deaktiver standard zoom-knapper
var map = L.map('map', {
    center: [56, 10],
    zoom: 7,
    zoomControl: false
});

// Definer OpenStreetMap-lag med kildehenvisning
var osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
    }
).addTo(map);

// Opret lag-kontrol
var baseMaps = { "OpenStreetMap": osmLayer };
L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Variabel til marker (placeres ved klik)
var currentMarker;

/* KLIK PÅ KORT => MARKER + GEOCODING */
map.on('click', function (e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon]).addTo(map);

    // Reverse geocoding
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

            // Vis info-boksen
            document.getElementById("infoBox").style.display = "block";
        })
        .catch(err => {
            console.error("Fejl ved reverse geocoding:", err);
        });
});

/* HÅNDTERING AF SØGEFELT OG KRYDS (×) */

// Hent elementerne fra HTML
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

// NYE felter:
var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

searchInput.addEventListener("input", function() { // Når brugeren skriver i #search => vis/skjul kryds
    if (searchInput.value.trim() === "") {
        clearBtn.style.display = "none";
        resultsList.innerHTML = "";
    } else {
        clearBtn.style.display = "inline";
        doAutocomplete(searchInput.value, resultsList); // Kald autocomplete-funktion for #search
    }
});

clearBtn.addEventListener("click", function() { // 2) Klik på krydset => ryd felt + ryd søgeresultater + skjul kryds + skjul boks
    searchInput.value = "";
    resultsList.innerHTML = "";
    clearBtn.style.display = "none";

    // Skjul evt. boksen
    document.getElementById("infoBox").style.display = "none";
});

vej1Input.addEventListener("input", function() {
    const txt = vej1Input.value.trim();
    if (txt === "") {
        vej1List.innerHTML = "";
        return;
    }
    doAutocomplete(txt, vej1List);
});

vej2Input.addEventListener("input", function() {
    const txt = vej2Input.value.trim();
    if (txt === "") {
        vej2List.innerHTML = "";
        return;
    }
    doAutocomplete(txt, vej2List);
});

/* Autocomplete Funktion */
function doAutocomplete(query, listElement) {
    fetch("https://api.dataforsyningen.dk/adresser/autocomplete?q=" + encodeURIComponent(query))
        .then(resp => resp.json())
        .then(data => {
            listElement.innerHTML = ""; // Ryd gammel liste
console.log("Auto data for '" + query + "':", data);            
            
            
            data.forEach(item => { // Tilføj et <li> for hvert forslag
                let li = document.createElement("li"); // item.forslagstekst kan fx ligne "Bjerlev Hedevej 16, 7300 Jelling"
                li.textContent = item.forslagstekst;
                li.addEventListener("click", () => { // Klik på forslaget => sæt det i feltet
                    if (listElement === resultsList) { // Sæt fuld tekst i input
                        searchInput.value = item.forslagstekst; // Det var #search
                    } else if (listElement === vej1List) {
                        vej1Input.value = item.forslagstekst;
                    } else if (listElement === vej2List) {
                        vej2Input.value = item.forslagstekst;
                    }
                    listElement.innerHTML = ""; // Ryd listen, så den lukker
                });
                listElement.appendChild(li);
            });
        })
        .catch(err => console.error("Fejl i autocomplete:", err));
}

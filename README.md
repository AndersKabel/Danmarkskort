# Danmarkskort

Funktions- og interaktionsoversigt for script.js
📁 1. Hjælpefunktioner
convertToWGS84(x, y)
Parametre: x (easting), y (northing)

Returnerer: [latitude, longitude] i WGS84

Afhænger af: proj4

Bruges til: Konvertering af koordinater fra UTM (EPSG:25832) til WGS84

copyToClipboard(str)
Parametre: str (tekst der skal kopieres)

Bruges til: At kopiere tekst til udklipsholder

Interagerer med: navigator.clipboard

showCopyPopup(message)
Parametre: message (tekst der vises i popup)

Bruges til: Midlertidig visning af feedback ved kopiering

getSortPriority(item, query)
Parametre: item (søgeelement), query (brugerens søgetekst)

Returnerer: Sorteringsvægt (0–3) baseret på match

Bruges i: doSearch til at sortere søgeresultater

🗂️ 2. Dataopdateringsfunktioner (strandposter)
getLastUpdated(), setLastUpdated(), shouldUpdateData()
Bruges til: Cache-tjek om strandposter skal hentes igen

Afhænger af: localStorage

Interagerer med: fetchAllStrandposter()

fetchAllStrandposter()
Henter: GeoJSON med redningsnumre

Lagrer i: allStrandposter

Afhænger af: Data fra geoserver.nobc

🗺️ 3. Kort og lag
Initialisering
Variabel: map (Leaflet)

Baselag: osmLayer, ortofotoLayer

Overlays: redningsnrLayer, falckAssLayer, kommunegrænserLayer

setCoordinateBox(lat, lon) og resetCoordinateBox()
Bruges til: Vise/rydde koordinatvisning og håndtere kopiering

Interagerer med: DOM-elementet #coordinateBox

🔍 4. Søgefunktionalitet
doSearch(query, listElement)
Henter data fra:

Adgangsadresser (autocomplete)

Stednavne

Strandposter (hvis lag aktivt)

Sorterer og viser: Resultatliste

Interagerer med: DOM (ul-lister), updateInfoBox(...), placeMarkerAndZoom(...)

Reverse geocoding: Kaldes kun når der vælges en adresse

📌 5. Kortinteraktioner
map.on('click', ...)
Effekt: Marker placeres, reverse-geocode kaldes, infoBox vises

Kalder: setCoordinateBox(...), updateInfoBox(...)

🧾 6. InfoBox
updateInfoBox(data, lat, lon)
Viser: Adresse, links til Notes/Eva.net, skråfoto, koordinater

Henter: Vejkode, kommunekode, statsveje og kommuneoplysninger

Afhænger af: DOM (fx #address, #extra-info, #kommuneOverlay)

Bruges af: Søgeresultat, kortklik

🧰 7. UI & Event handlers
addClearButton(input, list)
Tilføjer ❌-knap til søgefelter

Input listeners
Søgefelt #search: input → doSearch

Søgefelter til vej 1 og vej 2: visning og nulstilling af lister

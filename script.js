// Funktion til at finde kryds
document.getElementById('findIntersection').addEventListener('click', function () {
    var road1 = document.getElementById('road1').value.trim().toLowerCase();
    var road2 = document.getElementById('road2').value.trim().toLowerCase();

    if (road1.length < 2 || road2.length < 2) {
        alert('Indtast mindst 2 bogstaver for begge veje.');
        return;
    }

    fetch(`https://api.dataforsyningen.dk/adresser?vejnavn=${road1}`)
        .then(response => response.json())
        .then(data1 => {
            fetch(`https://api.dataforsyningen.dk/adresser?vejnavn=${road2}`)
                .then(response => response.json())
                .then(data2 => {
                    var intersection = findIntersection(data1, data2);

                    if (intersection) {
                        var [lon, lat] = intersection.adgangspunkt.koordinater;
                        placeMarkerAndZoom([lon, lat], `${road1} og ${road2}`);
                    } else {
                        alert('Ingen kryds fundet mellem de to veje.');
                    }
                });
        })
        .catch(err => console.error('Fejl ved vejnavneopslag:', err));
});

// Hjælpefunktion til at finde fælles punkt mellem to veje
function findIntersection(road1Data, road2Data) {
    for (var addr1 of road1Data) {
        for (var addr2 of road2Data) {
            if (addr1.adgangspunkt.koordinater[0] === addr2.adgangspunkt.koordinater[0] &&
                addr1.adgangspunkt.koordinater[1] === addr2.adgangspunkt.koordinater[1]) {
                return addr1; // Returner det første fundne kryds
            }
        }
    }
    return null; // Ingen kryds fundet
}

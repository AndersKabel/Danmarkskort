// Funktion til at finde kryds mellem to veje
document.getElementById('findIntersection').addEventListener('click', function () {
    const road1 = document.getElementById('road1').value.trim();
    const road2 = document.getElementById('road2').value.trim();

    if (!road1 || !road2) {
        alert("Indtast venligst begge vejnavne.");
        return;
    }

    fetch(`https://api.dataforsyningen.dk/vejstykker?navn=${road1}`)
        .then(res => res.json())
        .then(data1 => {
            if (data1.length === 0) {
                alert(`Vejnavn '${road1}' blev ikke fundet.`);
                return;
            }

            fetch(`https://api.dataforsyningen.dk/vejstykker?navn=${road2}`)
                .then(res => res.json())
                .then(data2 => {
                    if (data2.length === 0) {
                        alert(`Vejnavn '${road2}' blev ikke fundet.`);
                        return;
                    }

                    const intersections = findIntersections(data1, data2);

                    if (intersections.length > 0) {
                        const [lon, lat] = intersections[0];
                        placeMarkerAndZoom([lon, lat], `Kryds mellem ${road1} og ${road2}`);
                    } else {
                        alert("Ingen kryds fundet mellem de to veje.");
                    }
                });
        });
});

// Funktion til at finde kryds mellem to sæt vejforløb
function findIntersections(road1Data, road2Data) {
    const road1Coordinates = road1Data.flatMap(road => road.geometri.coordinates);
    const road2Coordinates = road2Data.flatMap(road => road.geometri.coordinates);

    const intersections = [];

    road1Coordinates.forEach(coord1 => {
        road2Coordinates.forEach(coord2 => {
            if (Math.abs(coord1[0] - coord2[0]) < 0.0001 && Math.abs(coord1[1] - coord2[1]) < 0.0001) {
                intersections.push(coord1); // Tilføj koordinat, hvis de er tæt på hinanden
            }
        });
    });

    return intersections;
}

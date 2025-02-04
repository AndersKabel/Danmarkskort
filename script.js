// Initialiser kortet
        var map = L.map('map').setView([56, 10], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        var currentMarker;
        var currentLayerGroup = null; // Holder referencen til det nuværende aktive lag
        var selectedLayerType = "none"; // Holder styr på det valgte lag

        // Klik på kortet for at finde en adresse
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
                    document.getElementById('address').innerHTML = `
                        Adresse: ${data.vejnavn || "ukendt"} ${data.husnr || ""}, ${data.postnr || "ukendt"} ${data.postnrnavn || ""}
                        <br>
                        <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
                    `;
                })
                .catch(err => console.error('Fejl ved reverse geocoding:', err));
        });

        // Søgefunktion
        document.getElementById('search').addEventListener('input', function () {
            var query = this.value.trim();
            if (query.length < 2) return;

            fetch(`https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${query}`)
                .then(response => response.json())
                .then(data => {
                    var results = document.getElementById('results');
                    results.innerHTML = '';

                    data.forEach(item => {
                        var li = document.createElement('li');
                        li.textContent = item.tekst;
                        li.addEventListener('click', function () {
                            fetch(`https://api.dataforsyningen.dk/adgangsadresser/${item.adgangsadresse.id}`)
                                .then(res => res.json())
                                .then(addressData => {
                                    var [lon, lat] = addressData.adgangspunkt.koordinater;
                                    placeMarkerAndZoom([lon, lat], item.tekst);
                                });
                        });
                        results.appendChild(li);
                    });
                });
        });

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
            const road1Coordinates = road1Data.flatMap(road => road.geometri?.coordinates || []);
            const road2Coordinates = road2Data.flatMap(road => road.geometri?.coordinates || []);

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

        // Funktion til placering af markør
        function placeMarkerAndZoom([lon, lat], addressText) {
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }

            currentMarker = L.marker([lat, lon]).addTo(map);
            map.setView([lat, lon], 16);

            document.getElementById('address').innerHTML = `
                Valgt adresse: ${addressText}
                <br>
                <a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Åbn i Google Street View</a>
            `;
        }

        // Ryd søgning
        document.getElementById('clearSearch').addEventListener('click', function () {
            document.getElementById('search').value = '';
            document.getElementById('results').innerHTML = '';
            if (currentMarker) {
                map.removeLayer(currentMarker);
                currentMarker = null;
            }
            document.getElementById('address').innerHTML = 'Klik på kortet eller søg efter en adresse';
        });
    </script>
</body>
</html>

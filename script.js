var map = L.map('map').setView([56, 10], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

map.on('click', function(e) {
    var lat = e.latlng.lat;
    var lon = e.latlng.lng;
    fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('address').innerText = `Adresse: ${data.vejnavn} ${data.husnr}, ${data.postnr} ${data.postnrnavn}`;
        })
        .catch(err => console.error(err));
});

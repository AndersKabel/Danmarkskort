// Lag-håndtering
document.querySelectorAll('input[name="layer"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
        const layerType = this.value;

        // Fjern det nuværende lag, hvis det eksisterer
        if (currentLayerGroup) {
            map.removeLayer(currentLayerGroup);
            currentLayerGroup = null; // Nulstil referencen
        }

        // Hvis "Ingen" vælges, gør intet mere
        if (layerType === "none") {
            currentLayerType = null; // Ingen aktiv lagtype
            return;
        }

        // Gem den nye lagtype og hent POI-data
        currentLayerType = layerType;
        fetchPOIData(layerType);
    });
});

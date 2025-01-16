body {
    margin: 0;
    font-family: Arial, sans-serif;
}

#map {
    height: 500px;
    width: 100%;
}

.autocomplete-results {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #ddd;
    max-height: 150px;
    overflow-y: auto;
    background: white;
    position: absolute;
    z-index: 1000;
    width: 300px;
}

.autocomplete-results li {
    padding: 10px;
    cursor: pointer;
}

.autocomplete-results li:hover {
    background-color: #f1f1f1;
}

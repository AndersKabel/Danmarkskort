/***************************************************
 * MÅLEVÆRKTØJ — Danmarkskort
 *
 * Fri måling hvor hvert segment kan låses til en præcis længde.
 * Klik punkter på kortet; hver linje viser sin længde i meter.
 * Klik på tallet for at taste en eksakt længde — endepunktet
 * flyttes langs den retning der allerede er trukket, så
 * retningen bevares og kun længden rettes.
 *
 * Låste segmenter markeres med hængelås og bevarer deres længde
 * når foranliggende punkter flyttes.
 *
 * Afhængigheder: Leaflet (global map), proj4 (EPSG:25832).
 * Afstande måles i UTM-planet, ikke geodætisk — over få hundrede
 * meter er forskellen under en centimeter, og til gengæld bliver
 * "flyt punktet 2,5 m i denne retning" matematisk entydigt.
 ***************************************************/

var _maalAktiv     = false;   // tegnetilstand til/fra
var _maalPunkter   = [];      // [{lat, lon}]
var _maalLaas      = [];      // laast laengde i meter for segment i (null = fri)
var _maalLukket    = false;   // er formen lukket til en polygon
var _maalLag       = null;    // L.layerGroup med alt tegnet
var _maalRedigerer = null;    // index paa segment der redigeres netop nu

// ── Projektion ───────────────────────────────────────────────────
// Alle beregninger sker i meter i EPSG:25832.
function _maalTilUTM(lat, lon) {
  var p = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
  return { x: p[0], y: p[1] };
}
function _maalTilWGS(x, y) {
  var p = proj4("EPSG:25832", "EPSG:4326", [x, y]);
  return { lat: p[1], lon: p[0] };
}

function _maalAfstand(a, b) {
  var p = _maalTilUTM(a.lat, a.lon);
  var q = _maalTilUTM(b.lat, b.lon);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

// Formatér med det antal decimaler der giver mening ved den længde
function _maalFormat(m) {
  if (m < 10)   return m.toFixed(2).replace(".", ",") + " m";
  if (m < 1000) return m.toFixed(1).replace(".", ",") + " m";
  return (m / 1000).toFixed(2).replace(".", ",") + " km";
}

/***************************************************
 * Sæt segment i til en præcis længde.
 * Endepunktet flyttes langs den eksisterende retning, så
 * retningen bevares. Alle efterfølgende punkter flyttes med
 * samme forskydning, så formen ikke deformeres bagude.
 ***************************************************/
function _maalSaetLaengde(i, meter) {
  if (i < 0 || i >= _maalPunkter.length - 1) return;
  if (!(meter > 0)) return;

  var a = _maalTilUTM(_maalPunkter[i].lat,     _maalPunkter[i].lon);
  var b = _maalTilUTM(_maalPunkter[i + 1].lat, _maalPunkter[i + 1].lon);
  var dx = b.x - a.x, dy = b.y - a.y;
  var nu = Math.hypot(dx, dy);
  if (nu < 0.001) return;   // uden retning kan vi ikke skalere

  var nyX = a.x + (dx / nu) * meter;
  var nyY = a.y + (dy / nu) * meter;
  var flytX = nyX - b.x, flytY = nyY - b.y;

  // Flyt endepunktet og alt efter det, så resten af formen følger med
  for (var j = i + 1; j < _maalPunkter.length; j++) {
    var p = _maalTilUTM(_maalPunkter[j].lat, _maalPunkter[j].lon);
    var ny = _maalTilWGS(p.x + flytX, p.y + flytY);
    _maalPunkter[j] = ny;
  }
  _maalLaas[i] = meter;
  _maalTegn();
}

/***************************************************
 * Genopret låste længder efter at et punkt er trukket.
 * Køres fra det flyttede punkt og fremad, så en låst længde
 * ikke går tabt når noget foran den rykker sig.
 ***************************************************/
function _maalGenoprettLaase(fraIndex) {
  for (var i = fraIndex; i < _maalPunkter.length - 1; i++) {
    if (_maalLaas[i] == null) continue;
    var a = _maalTilUTM(_maalPunkter[i].lat,     _maalPunkter[i].lon);
    var b = _maalTilUTM(_maalPunkter[i + 1].lat, _maalPunkter[i + 1].lon);
    var dx = b.x - a.x, dy = b.y - a.y;
    var nu = Math.hypot(dx, dy);
    if (nu < 0.001) continue;
    var nyX = a.x + (dx / nu) * _maalLaas[i];
    var nyY = a.y + (dy / nu) * _maalLaas[i];
    var flytX = nyX - b.x, flytY = nyY - b.y;
    for (var j = i + 1; j < _maalPunkter.length; j++) {
      var p = _maalTilUTM(_maalPunkter[j].lat, _maalPunkter[j].lon);
      _maalPunkter[j] = _maalTilWGS(p.x + flytX, p.y + flytY);
    }
  }
}

// Areal via skolisseformlen i UTM-planet
function _maalAreal() {
  if (_maalPunkter.length < 3) return 0;
  var pts = _maalPunkter.map(function(p) { return _maalTilUTM(p.lat, p.lon); });
  var sum = 0;
  for (var i = 0; i < pts.length; i++) {
    var j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum / 2);
}

/***************************************************
 * Tegner alt forfra. Enkelt og hurtigt nok ved de
 * få punkter der er i spil.
 ***************************************************/
function _maalTegn() {
  if (!_maalLag) return;
  _maalLag.clearLayers();
  if (!_maalPunkter.length) { _maalOpdaterPanel(); return; }

  var latlngs = _maalPunkter.map(function(p) { return [p.lat, p.lon]; });

  // Flade når formen er lukket
  if (_maalLukket && _maalPunkter.length >= 3) {
    L.polygon(latlngs, {
      color: "#e67e22", weight: 2, fillColor: "#e67e22",
      fillOpacity: 0.15, interactive: false
    }).addTo(_maalLag);
  } else if (_maalPunkter.length >= 2) {
    L.polyline(latlngs, {
      color: "#e67e22", weight: 3, interactive: false
    }).addTo(_maalLag);
  }

  // Måletal midt på hvert segment
  var antal = _maalLukket ? _maalPunkter.length : _maalPunkter.length - 1;
  for (var i = 0; i < antal; i++) {
    var a = _maalPunkter[i];
    var b = _maalPunkter[(i + 1) % _maalPunkter.length];
    var laengde = _maalAfstand(a, b);
    var laast = _maalLaas[i] != null;
    var midt = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];

    var html;
    if (_maalRedigerer === i) {
      html = '<div class="maal-label maal-label-rediger">'
        + '<input type="number" step="0.01" min="0.01" class="maal-input" value="'
        + laengde.toFixed(2) + '"> m</div>';
    } else {
      html = '<div class="maal-label' + (laast ? " maal-label-laast" : "") + '" data-seg="' + i + '">'
        + (laast ? "\uD83D\uDD12 " : "") + _maalFormat(laengde)
        + (laast ? ' <span class="maal-laas-fra" data-seg="' + i + '" title="Lås op">\u00D7</span>' : "")
        + "</div>";
    }

    L.marker(midt, {
      icon: L.divIcon({ className: "", html: html, iconSize: null }),
      interactive: true, keyboard: false
    }).addTo(_maalLag);
  }

  // Trækbare hjørnehåndtag
  _maalPunkter.forEach(function(p, idx) {
    var m = L.marker([p.lat, p.lon], {
      draggable: true,
      icon: L.divIcon({ className: "", html: '<div class="maal-handle"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7] })
    }).addTo(_maalLag);

    m.on("drag", function(e) {
      _maalPunkter[idx] = { lat: e.latlng.lat, lon: e.latlng.lng };
      _maalOpdaterPanel();
    });
    m.on("dragend", function(e) {
      _maalPunkter[idx] = { lat: e.latlng.lat, lon: e.latlng.lng };
      // Et flyttet punkt kan bryde en låst længde længere fremme
      _maalGenoprettLaase(Math.max(0, idx - 1));
      _maalTegn();
    });
    // Højreklik fjerner punktet
    m.on("contextmenu", function(ev) {
      if (ev.originalEvent) ev.originalEvent.preventDefault();
      _maalPunkter.splice(idx, 1);
      _maalLaas.splice(idx, 1);
      if (_maalPunkter.length < 3) _maalLukket = false;
      _maalTegn();
    });
  });

  _maalOpdaterPanel();
  _maalBindLabels();
}

// Klik på et måletal åbner indtastning
function _maalBindLabels() {
  document.querySelectorAll(".maal-label[data-seg]").forEach(function(el) {
    el.addEventListener("click", function(ev) {
      if (ev.target.classList.contains("maal-laas-fra")) {
        ev.stopPropagation();
        _maalLaas[parseInt(ev.target.dataset.seg, 10)] = null;
        _maalTegn();
        return;
      }
      _maalRedigerer = parseInt(el.dataset.seg, 10);
      _maalTegn();
      var input = document.querySelector(".maal-input");
      if (input) { input.focus(); input.select(); }
    });
  });

  var input = document.querySelector(".maal-input");
  if (!input) return;
  var afslut = function(gem) {
    var i = _maalRedigerer;
    var v = parseFloat(String(input.value).replace(",", "."));
    _maalRedigerer = null;
    if (gem && v > 0) _maalSaetLaengde(i, v);
    else _maalTegn();
  };
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter")  { e.preventDefault(); afslut(true); }
    if (e.key === "Escape") { e.preventDefault(); afslut(false); }
  });
  input.addEventListener("blur", function() { afslut(true); });
  // Klik i feltet må ikke sætte et nyt punkt på kortet
  input.addEventListener("click", function(e) { e.stopPropagation(); });
}

function _maalOpdaterPanel() {
  var el = document.getElementById("maalStatus");
  if (!el) return;
  if (!_maalPunkter.length) {
    el.innerHTML = '<span style="color:#8a97a5">Klik på kortet for at sætte første punkt</span>';
    return;
  }
  var samlet = 0;
  var antal = _maalLukket ? _maalPunkter.length : _maalPunkter.length - 1;
  for (var i = 0; i < antal; i++) {
    samlet += _maalAfstand(_maalPunkter[i], _maalPunkter[(i + 1) % _maalPunkter.length]);
  }
  var html = "<b>" + _maalPunkter.length + "</b> punkter &middot; "
    + (_maalLukket ? "Omkreds" : "Længde") + ": <b>" + _maalFormat(samlet) + "</b>";
  if (_maalLukket && _maalPunkter.length >= 3) {
    var a = _maalAreal();
    html += "<br>Areal: <b>" + (a < 10000
      ? a.toFixed(1).replace(".", ",") + " m\u00B2"
      : (a / 10000).toFixed(3).replace(".", ",") + " ha") + "</b>";
  }
  el.innerHTML = html;
}

/***************************************************
 * Til/fra og panel
 ***************************************************/
function _maalKlikPaaKort(e) {
  if (!_maalAktiv) return;
  if (_maalLukket) return;   // formen er lukket; ryd eller åbn et nyt
  _maalPunkter.push({ lat: e.latlng.lat, lon: e.latlng.lng });
  _maalLaas.push(null);
  _maalTegn();
}

function maalStart() {
  if (_maalAktiv) return;
  _maalAktiv = true;
  if (!_maalLag) _maalLag = L.layerGroup().addTo(map);
  map.on("click", _maalKlikPaaKort);
  document.getElementById("maalPanel").style.display = "block";
  var btn = document.getElementById("maalToggleBtn");
  if (btn) btn.classList.add("maal-btn-aktiv");
  // Kortets egen klikhåndtering må ikke sætte markører imens
  if (typeof window.__maalPauseKortKlik === "function") window.__maalPauseKortKlik(true);
  _maalOpdaterPanel();
}

function maalStop() {
  _maalAktiv = false;
  map.off("click", _maalKlikPaaKort);
  document.getElementById("maalPanel").style.display = "none";
  var btn = document.getElementById("maalToggleBtn");
  if (btn) btn.classList.remove("maal-btn-aktiv");
  if (typeof window.__maalPauseKortKlik === "function") window.__maalPauseKortKlik(false);
}

function maalRyd() {
  _maalPunkter = [];
  _maalLaas = [];
  _maalLukket = false;
  _maalRedigerer = null;
  _maalTegn();
}

function maalLuk() {
  if (_maalPunkter.length < 3) return;
  _maalLukket = !_maalLukket;
  _maalTegn();
}

function initMaalModul() {
  var knap = document.getElementById("maalToggleBtn");
  if (knap) knap.addEventListener("click", function() {
    _maalAktiv ? maalStop() : maalStart();
  });
  var ryd = document.getElementById("maalRydBtn");
  if (ryd) ryd.addEventListener("click", maalRyd);
  var luk = document.getElementById("maalLukBtn");
  if (luk) luk.addEventListener("click", maalLuk);
  var afslut = document.getElementById("maalAfslutBtn");
  if (afslut) afslut.addEventListener("click", maalStop);
}

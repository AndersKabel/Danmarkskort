/* ================================================================
   leverandoer-modul.js  –  Leverandøroversigt til Danmarkskort
   ================================================================
   Gemmer/henter data i SharePoint via Cloudflare Worker.
   Afhænger af globale variabler fra script.js:
     • map            (Leaflet map-instans)
     • kommuneGeoJSON (hentet fra Dataforsyningen)
   ================================================================ */

// ── KONFIGURATION ────────────────────────────────────────────────
const LEV_SP_WORKER = "https://danmarkskort-sp.anderskabel8.workers.dev";

// Leverandør-kategorier (eksterne firmaer)
const LEV_KATEGORIER = [
  { id: "u3500", navn: "Autoleverandør u. 3500 kg.", ikon: "🚗" },
  { id: "o3500", navn: "Autoleverandør o. 3500 kg.", ikon: "🚛" },
];

// Egne enheder-kategorier (Falcks egne biler/reddere)
const EGNE_KATEGORIER = [
  { id: "tma_vogn",    navn: "TMA vogn",              ikon: "🚧" },
  { id: "tavletrailer",navn: "Tavletrailer",           ikon: "🪧" },
  { id: "dyr_smaadyr", navn: "Dyreredning / smådyr",  ikon: "🐾" },
  { id: "dyr_ko",      navn: "Dyreredning / ko",      ikon: "🐄" },
  { id: "drift_hjem",  navn: "Drift fra hjem",        ikon: "🏠" },
  { id: "mors",        navn: "Mors biler",             ikon: "🚌" },
  { id: "liggende",    navn: "Liggende",               ikon: "🛏️" },
  { id: "forflytning", navn: "Forflytning",            ikon: "🚑" },
  { id: "vejrenser",   navn: "Vejrenser",              ikon: "🧹" },
  { id: "skytter",     navn: "Skytter",                ikon: "🎯" },
];

// ── LEAFLET LAG ──────────────────────────────────────────────────
const _levKatLag = {};
LEV_KATEGORIER.forEach(k => { _levKatLag[k.id] = L.layerGroup(); });
var redigerLeverandoerLayer = L.layerGroup();
var levTilgaengeligLayer    = L.layerGroup();

const _enhedKatLag = {};
EGNE_KATEGORIER.forEach(k => { _enhedKatLag[k.id] = L.layerGroup(); });
var redigerEnhederLayer = L.layerGroup();
var stationerLayer      = L.layerGroup();
var uadLayer            = L.layerGroup();

// Returnerer true hvis enheden er UAD lige nu
function _erUAD(enhed) {
  if (!enhed?.uad) return false;
  if (enhed.uad.type === "manuel") return true;
  if (enhed.uad.type === "tidsrum") {
    const nu  = Date.now();
    const fra = enhed.uad.fra ? new Date(enhed.uad.fra).getTime() : 0;
    const til = enhed.uad.til ? new Date(enhed.uad.til).getTime() : Infinity;
    return nu >= fra && nu <= til;
  }
  return false;
}

// Returnerer UAD-badge HTML til brug i lister og popups
function _uadBadge(enhed) {
  if (!enhed?.uad) return "";
  if (enhed.uad.type === "manuel")
    return `<span style="background:#e74c3c;color:#fff;border-radius:4px;padding:1px 5px;font-size:11px;font-weight:700;margin-left:4px">UAD</span>`;
  if (enhed.uad.type === "tidsrum" && enhed.uad.til) {
    const til = new Date(enhed.uad.til);
    const hhmm = til.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const dato = til.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
    const nu = Date.now();
    const tilMs = til.getTime();
    const label = tilMs - nu < 86400000 ? `UAD til ${hhmm}` : `UAD til ${dato} ${hhmm}`;
    return `<span style="background:#e67e22;color:#fff;border-radius:4px;padding:1px 5px;font-size:11px;font-weight:700;margin-left:4px">${label}</span>`;
  }
  return "";
}

// ── STATE ────────────────────────────────────────────────────────
let _levData          = [];
let _levPostnrMap     = {};
let _levHighlights    = [];
let _levLoginProgress = false;
let _levLoaded        = false;
let _levTilgInterval  = null;

let _enhedData   = [];
let _enhedLoaded = false;
let _enhedAabne  = new Set(); // Husker hvilke kategorisektioner der er foldet ud (tom = alle lukket)

let _levLayerCtrl  = null; // Reference til Leaflet layer control (bruges til at afmarker checkboxes)
let _levAktivRolle = null; // Aktiv session-rolle: "admin" | "drift" | "read" | null

// ── BOOT ─────────────────────────────────────────────────────────
async function initLeverandoerModul() {
  _levLoadPostnrMap();
  _levBuildControl();
  _levBuildUI();

  // Hook ind i placeMarkerAndZoom så afstande opdateres når ny adresse søges
  if (typeof placeMarkerAndZoom === "function") {
    const _orig = window.placeMarkerAndZoom;
    window.placeMarkerAndZoom = function() {
      const r = _orig.apply(this, arguments);
      if (_enhedLoaded) setTimeout(_enhedRenderLag, 150);
      return r;
    };
  }

  // Opdater afstande også ved direkte klik på kortet
  map.on("click", function() {
    if (_enhedLoaded) setTimeout(_enhedRenderLag, 300);
  });
}

// ── LEAFLET LAYER CONTROL ────────────────────────────────────────
function _levBuildControl() {
  // Custom HTML-panel erstatter L.control.layers
  // Ingen Leaflet hover-logik — fuld kontrol over åbn/luk
  const wrap = document.createElement('div');
  wrap.className = 'lev-disp-ctrl';

  const levRows = LEV_KATEGORIER.map(k =>
    `<label class="lev-disp-row"><input type="checkbox" data-lag="lev-${k.id}"> ${k.ikon} ${k.navn}</label>`
  ).join('');
  const enhedRows = EGNE_KATEGORIER.map(k =>
    `<label class="lev-disp-row"><input type="checkbox" data-lag="enhed-${k.id}"> ${k.ikon} ${k.navn}</label>`
  ).join('');

  wrap.innerHTML = `
    <button class="lev-disp-toggle" id="levDispToggle">Disp</button>
    <div class="lev-disp-panel" id="levDispPanel">
      <div class="lev-disp-section">${levRows}
        <label class="lev-disp-row"><input type="checkbox" data-lag="tilgaengelig"> 🟢 Tilgængelige leverandører</label>
      </div>
      <div class="lev-disp-divider"></div>
      <div class="lev-disp-section">${enhedRows}
        <label class="lev-disp-row"><input type="checkbox" data-lag="stationer"> 🏠 Stationer</label>
        <label class="lev-disp-row"><input type="checkbox" data-lag="uad"> 🔴 Ude af drift</label>
      </div>
      <div class="lev-disp-divider"></div>
      <div class="lev-disp-section lev-disp-rediger">
        <button class="lev-disp-rediger-btn" id="levRedigerLev">✏️ Rediger leverandører</button>
        <button class="lev-disp-rediger-btn" id="levRedigerEnheder">✏️ Rediger egne enheder</button>
      </div>
    </div>
  `;
  map.getContainer().appendChild(wrap);

  const toggleBtn = document.getElementById('levDispToggle');
  const panel     = document.getElementById('levDispPanel');

  // Disp-knap: tjek session og åbn/luk panel
  toggleBtn.addEventListener('click', async function (e) {
    e.stopPropagation();
    if (!panel.classList.contains('lev-disp-panel-aaben')) {
      try {
        const me = await fetch(`${LEV_SP_WORKER}/auth/me`, { credentials: 'include' });
        if (me.ok) {
          panel.classList.add('lev-disp-panel-aaben');
        } else {
          const ok = await _levEnsureDisponering();
          if (ok) panel.classList.add('lev-disp-panel-aaben');
        }
      } catch (err) {
        console.warn('Disp session-tjek fejlede:', err);
      }
    } else {
      panel.classList.remove('lev-disp-panel-aaben');
    }
  });

  // Klik paa kortet lukker panelet (via Leaflet event — interfererer ikke med marker-placement)
  map.on('click', function () {
    panel.classList.remove('lev-disp-panel-aaben');
  });

  // Stop klik inde i panelet fra at boble op til kortet
  L.DomEvent.disableClickPropagation(panel);

  // Checkbox-handlers
  wrap.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
    cb.addEventListener('change', async function () {
      const lag = cb.dataset.lag;
      let layer = null;
      if (lag === 'tilgaengelig')         layer = levTilgaengeligLayer;
      else if (lag === 'stationer')       layer = stationerLayer;
      else if (lag === 'uad')             layer = uadLayer;
      else if (lag.startsWith('lev-'))    layer = _levKatLag[lag.slice(4)];
      else if (lag.startsWith('enhed-'))  layer = _enhedKatLag[lag.slice(6)];
      if (!layer) return;

      if (cb.checked) {
        map.addLayer(layer);
        // Tilgængelige leverandører
        if (lag === 'tilgaengelig') {
          await _levTilgLoad();
          _levTilgInterval = setInterval(_levTilgLoad, 180_000);
        }
        // Leverandør-kategorier
        const erLevKat = lag.startsWith('lev-');
        if (erLevKat && !_levLoaded) await _levLoad();
        // Egne enheder
        const erEnhedKat = lag.startsWith('enhed-');
        if (erEnhedKat && !_enhedLoaded) {
          const ok = await _levEnsureDisponering();
          if (!ok) { map.removeLayer(layer); cb.checked = false; }
          else await _enhedLoad();
        }
        // Stationer
        if (lag === 'stationer') {
          if (!_enhedLoaded) {
            const ok = await _levEnsureDisponering();
            if (!ok) { map.removeLayer(layer); cb.checked = false; return; }
            await _enhedLoad();
          }
          _enhedRenderLag();
        }
        // UAD
        if (lag === 'uad') {
          if (!_enhedLoaded) {
            const ok = await _levEnsureDisponering();
            if (!ok) { map.removeLayer(layer); cb.checked = false; return; }
            await _enhedLoad();
          }
          _enhedRenderLag();
        }
      } else {
        map.removeLayer(layer);
        // Stop tilgængelighedsinterval når laget fjernes
        if (lag === 'tilgaengelig') {
          clearInterval(_levTilgInterval);
          _levTilgInterval = null;
          levTilgaengeligLayer.clearLayers();
        }
      }
    });
  });

  // Rediger-knapper
  document.getElementById('levRedigerLev').addEventListener('click', async function (e) {
    e.stopPropagation();
    panel.classList.remove('lev-disp-panel-aaben');
    await _levOpenAdmin();
  });
  document.getElementById('levRedigerEnheder').addEventListener('click', async function (e) {
    e.stopPropagation();
    panel.classList.remove('lev-disp-panel-aaben');
    await _enhedOpenAdmin();
  });

  // Gem wrap som _levLayerCtrl (bruges af _levUncheckLayer)
  _levLayerCtrl = wrap;

}

// ── LAYER CONTROL HELPERS ───────────────────────────────────────
function _levUncheckLayer(layer) {
  if (!_levLayerCtrl) return;
  _levLayerCtrl.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
    const lag = cb.dataset.lag;
    let l = null;
    if (lag === 'tilgaengelig')         l = levTilgaengeligLayer;
    else if (lag && lag.startsWith('lev-'))   l = _levKatLag[lag.slice(4)];
    else if (lag && lag.startsWith('enhed-')) l = _enhedKatLag[lag.slice(6)];
    if (l === layer) cb.checked = false;
  });
}

// ── SP AUTH ──────────────────────────────────────────────────────
async function _levSpFetch(path, options) {
  const url  = LEV_SP_WORKER + path;
  const opts = Object.assign({}, options || {});
  opts.credentials = "include";
  if (!opts.headers) opts.headers = {};

  let resp = await fetch(url, opts);
  if (resp.status === 401) {
    const ok = await _levEnsureLogin();
    if (!ok) return resp;
    resp = await fetch(url, opts);
  }
  return resp;
}

// Drift-login: kraever rolle 'drift' eller 'admin' - bruges til redigering
async function _levEnsureDrift() {
  if (_levLoginProgress) return false;
  _levLoginProgress = true;
  try {
    const me = await fetch(`${LEV_SP_WORKER}/auth/me`, { credentials: "include" });
    if (me.ok) {
      const data = await me.json();
      _levAktivRolle = data.role || null;
      if (data.role === "admin" || data.role === "drift") return true;
      // Har kun læse-session — bed om driftkoordinator-kode
    }
    const code = prompt("Redigering kræver driftkoordinatorkode:");
    if (!code?.trim()) return false;
    const login = await fetch(`${LEV_SP_WORKER}/auth/login`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() })
    });
    if (!login.ok) {
      const err = await login.json().catch(() => ({}));
      if (err.error === "too_many_attempts") {
        alert("For mange fejlede forsøg — prøv igen om en time.");
      } else {
        alert("Forkert kode – prøv igen.");
      }
      return false;
    }
    const data = await login.json();
    if (data.role !== "admin" && data.role !== "drift") {
      alert("Denne kode giver ikke redigeringsadgang.");
      return false;
    }
    _levVelkomst(data.role);
    return true;
  } finally {
    _levLoginProgress = false;
  }
}
// Alias for bagudkompatibilitet
const _levEnsureLogin = _levEnsureDrift;

// Disponering-login: accepterer admin eller read-session
async function _levEnsureDisponering() {
  if (_levLoginProgress) return false;
  _levLoginProgress = true;
  try {
    const me = await fetch(`${LEV_SP_WORKER}/auth/me`, { credentials: "include" });
    if (me.ok) {
      const meData = await me.json().catch(() => ({}));
      _levAktivRolle = meData.role || null;
      return true; // enhver gyldig session
    }

    const code = prompt("Disponering kræver login — indtast adgangskoden:");
    if (!code?.trim()) return false;
    const login = await fetch(`${LEV_SP_WORKER}/auth/login`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() })
    });
    if (!login.ok) {
      const err = await login.json().catch(() => ({}));
      if (err.error === "too_many_attempts") {
        alert("For mange fejlede forsøg — prøv igen om en time.");
      } else {
        alert("Forkert kode – prøv igen.");
      }
      return false;
    }
    // Velkomstbesked baseret paa rolle
    const loginData = await login.json().catch(() => ({}));
    _levVelkomst(loginData.role);
    return true;
  } finally {
    _levLoginProgress = false;
  }
}

// Velkomst-toast ved login
function _levVelkomst(role) {
  _levAktivRolle = role || null;
  const beskeder = {
    admin:  "Velkommen, administrator 👋",
    drift:  "Velkommen, driftkoordinator 👋",
    read:   "Velkommen, disponent 👋"
  };
  const tekst = beskeder[role] || "Velkommen 👋";
  const toast = document.createElement('div');
  toast.textContent = tekst;
  toast.style.cssText = [
    "position:fixed","top:60px","left:50%","transform:translateX(-50%)",
    "background:#1a6fa3","color:#fff","padding:10px 22px",
    "border-radius:8px","font-size:15px","font-weight:600",
    "z-index:9999","pointer-events:none","box-shadow:0 2px 8px rgba(0,0,0,0.25)",
    "transition:opacity 0.4s"
  ].join(";");
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; }, 2000);
  setTimeout(() => { toast.remove(); }, 2500);
}

// ── DATA LOADING ─────────────────────────────────────────────────
async function _levLoad() {
  try {
    // GET /leverandoerer kræver gyldig session (samme niveau som /enheder)
    const resp = await _levSpFetch("/leverandoerer");
    if (!resp || !resp.ok) { console.warn("Leverandørdata fejlede:", resp?.status); return; }
    const data = await resp.json();
    _levData   = data.leverandoerer || [];
    _levLoaded = true;
    _levBuildMarkers();
  } catch (e) {
    console.warn("Leverandørmodul: load fejlede", e);
  }
}

async function _levLoadPostnrMap() {
  try {
    const r    = await fetch("https://api.dataforsyningen.dk/postnumre?format=json");
    const data = await r.json();

    // Vent på at kommuneGeoJSON er klar (loadet af script.js) – maks 8 sek
    let tries = 0;
    while (!kommuneGeoJSON?.features?.length && tries++ < 80) {
      await new Promise(res => setTimeout(res, 100));
    }

    // Byg navn→kode opslag fra kommuneGeoJSON: "Ringsted" → "0329"
    const navnTilKode = {};
    (kommuneGeoJSON?.features || []).forEach(f => {
      const navn = f.properties?.navn;
      const kode = f.properties?.kode;
      if (navn && kode) navnTilKode[navn.toLowerCase()] = kode;
    });

    _levPostnrMap = {};
    data.forEach(p => {
      // Primær strategi: match postnummerets bynavn mod kommunenavn ("4100 Ringsted" → Ringsted Kommune)
      const kodeByNavn = navnTilKode[p.navn?.toLowerCase()];
      if (kodeByNavn) {
        _levPostnrMap[p.nr] = [kodeByNavn];
      } else {
        // Fallback: første kommune i API-arrayet (størst geometrisk overlap)
        _levPostnrMap[p.nr] = (p.kommuner || []).slice(0, 1).map(k => k.kode);
      }
    });
  } catch (e) { console.warn("Leverandørmodul: postnr-kort fejlede", e); }
}

// ── MARKØRER ─────────────────────────────────────────────────────
// Bindes både ved popupopen OG ved setPopupContent (klik -> fuld popup)
function _levBindPopupHandlers(el) {
  if (!el) return;
  el.querySelectorAll(".lev-popup-vogn-hdr-click").forEach(hdr => {
    if (hdr.dataset.handlerBound) return;
    hdr.dataset.handlerBound = "1";
    hdr.addEventListener("click", () => {
      const detail = hdr.nextElementSibling;
      if (!detail) return;
      const open = detail.style.display !== "none";
      detail.style.display = open ? "none" : "block";
      hdr.classList.toggle("lev-popup-vogn-hdr-open", !open);
    });
  });
  el.querySelectorAll(".lev-popup-vogn-img-full").forEach(img => {
    if (img.dataset.handlerBound) return;
    img.dataset.handlerBound = "1";
    img.addEventListener("click", e => { e.stopPropagation(); _levLightbox(img.src); });
  });
}

function _levBuildMarkers() {
  LEV_KATEGORIER.forEach(k => _levKatLag[k.id].clearLayers());

  (_levData || []).filter(l => l.aktiv !== false).forEach(lev => {
    // Støt både nyt (kategorier[]) og gammelt (kategori) format
    const kategorier = (lev.kategorier?.length ? lev.kategorier : (lev.kategori ? [lev.kategori] : []));
    if (!kategorier.length) return;

    (lev.arbejdsAdresser || []).forEach(adr => {
      if (!adr.lat || !adr.lon) return;

      // Brug adressens egne kategorier hvis sat, ellers arv fra leverandøren
      const adrKategorier = (adr.kategorier?.length) ? adr.kategorier : kategorier;

      // Én markør per kategori-lag
      adrKategorier.forEach(katId => {
        const katLag = _levKatLag[katId];
        if (!katLag) return;

        let closeTimer = null;
        let isFullOpen = false;
        const marker = L.marker([adr.lat, adr.lon], { icon: _levIcon(lev, katId) })
          .bindPopup(_levMiniPopupHTML(lev, adr), { maxWidth: 280, className: "lev-leaflet-popup" })
          .on("mouseover", function () {
            if (isFullOpen) return;
            clearTimeout(closeTimer);
            this.setPopupContent(_levMiniPopupHTML(lev, adr));
            this.openPopup();
            _levHighlight(lev, adr);
          })
          .on("mouseout", function () {
            if (isFullOpen) return;
            const self = this;
            closeTimer = setTimeout(() => {
              self.closePopup();
              _levClearHighlights();
            }, 250);
          })
          .on("click", function () {
            clearTimeout(closeTimer);
            isFullOpen = true;
            this.setPopupContent(_levFullPopupHTML(lev, adr));
            this.openPopup();
            _levHighlight(lev, adr);
            // Bind handlers direkte efter setPopupContent — popupopen fyrer ikke ved content-skift
            const popup = this.getPopup();
            if (popup) setTimeout(() => _levBindPopupHandlers(popup.getElement(), closeTimer), 0);
          })
          .on("popupclose", function () {
            isFullOpen = false;
            _levClearHighlights();
          })
          .on("popupopen", function () {
            const el = this.getPopup().getElement();
            if (!el) return;
            el.addEventListener("mouseenter", () => clearTimeout(closeTimer));
            el.addEventListener("mouseleave", () => {
              if (isFullOpen) return;
              const self = this;
              closeTimer = setTimeout(() => {
                self.closePopup();
                _levClearHighlights();
              }, 250);
            });
            _levBindPopupHandlers(el, closeTimer);
          });

        katLag.addLayer(marker);
      });
    });
  });
}

// ── TILGÆNGELIGHED – LAG ─────────────────────────────────────────
async function _levTilgLoad() {
  try {
    const resp = await fetch(`${LEV_SP_WORKER}/tilgaengelig`);
    if (!resp.ok) { console.warn("Tilgængelighed: fejl", resp.status); return; }
    const data = await resp.json();
    const aktive = data.aktive || [];
    _levTilgBuildMarkers(aktive);

    // Vis besked hvis ingen er tilgængelige
    if (aktive.length === 0) _levTilgToast("Ingen leverandører meldt tilgængelig");
  } catch (e) {
    console.warn("Tilgængelighed: load fejlede", e);
  }
}

function _levTilgToast(besked) {
  const eksisterende = document.getElementById("lev-tilg-toast");
  if (eksisterende) eksisterende.remove();

  const toast = document.createElement("div");
  toast.id = "lev-tilg-toast";
  toast.textContent = besked;
  toast.style.cssText = [
    "position:fixed", "bottom:60px", "left:50%", "transform:translateX(-50%)",
    "background:rgba(0,0,0,0.75)", "color:#fff", "padding:10px 20px",
    "border-radius:8px", "font-size:14px", "z-index:9999",
    "pointer-events:none", "white-space:nowrap",
    "transition:opacity 0.4s"
  ].join(";");
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; }, 2500);
  setTimeout(() => { toast.remove(); }, 3000);
}

function _levTilgBuildMarkers(aktive) {
  levTilgaengeligLayer.clearLayers();

  // Gruppér alle records per unik position (lat/lon)
  const byPos = new Map();
  aktive.forEach(rec => {
    (rec.adresser || []).forEach(adr => {
      if (!adr.lat || !adr.lon) return;
      const key = `${parseFloat(adr.lat).toFixed(5)},${parseFloat(adr.lon).toFixed(5)}`;
      if (!byPos.has(key)) byPos.set(key, { lat: adr.lat, lon: adr.lon, label: adr.label, records: [] });
      byPos.get(key).records.push(rec);
    });
  });

  // Én markør per unik position
  byPos.forEach(({ lat, lon, label, records }) => {
    const farve = records[0].levFarve || "#27ae60";
    const kat   = LEV_KATEGORIER.find(k => k.id === records[0].levKategori);
    const antal = records.length;

    // Byg én popup-række per tilgængelig vogn
    const vognRækker = records.map(rec => {
      const fraStr = rec.fra ? new Date(rec.fra).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }) : "?";
      const tilStr = rec.til ? new Date(rec.til).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }) : "?";
      return `
        <div class="lev-popup-row">
          🚗 <b>Vogn ${_esc(rec.vognNr)}</b>${rec.vognReg ? " · " + _esc(rec.vognReg) : ""}
          ${rec.vognBesk ? "<br><small>" + _esc(rec.vognBesk) + "</small>" : ""}
          <br>⏰ <b>${fraStr} → ${tilStr}</b>
          ${rec.bemærkning ? "<br>💬 <i>" + _esc(rec.bemærkning) + "</i>" : ""}
        </div>`;
    }).join('<hr class="lev-hr">');

    const popupHTML = `
      <div class="lev-popup">
        <div class="lev-popup-top" style="border-left:4px solid ${_esc(farve)}">
          <b>🟢 ${_esc(records[0].levNavn)}</b>
          <span class="lev-popup-sub">${kat ? kat.ikon + " " + kat.navn : ""}${label ? " · " + _esc(label) : ""}</span>
        </div>
        ${vognRækker}
      </div>`;

    const icon = L.divIcon({
      className: "",
      html: `<div class="lev-marker-icon" style="background:${_esc(farve)};box-shadow:0 0 0 3px #fff,0 0 0 5px ${_esc(farve)}">${antal > 1 ? antal + "🟢" : "🟢"}</div>`,
      iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14]
    });

    L.marker([lat, lon], { icon })
      .bindPopup(popupHTML, { maxWidth: 320, className: "lev-leaflet-popup" })
      .addTo(levTilgaengeligLayer);
  });
}

function _levIcon(lev, katId) {
  const kat     = LEV_KATEGORIER.find(k => k.id === (katId || lev.kategorier?.[0] || lev.kategori));
  const initial = kat ? kat.ikon : (lev.navn || "?")[0].toUpperCase();
  const color   = lev.farve || "#3498db";
  return L.divIcon({
    className:   "",
    html:        `<div class="lev-marker-icon" style="background:${color}">${initial}</div>`,
    iconSize:    [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14]
  });
}

// Mini popup (hover): kun navn, tlf, email
function _levMiniPopupHTML(lev, adr) {
  const c = lev.farve || "#3498db";
  let h = `<div class="lev-popup lev-popup-mini">
    <div class="lev-popup-top" style="border-left:4px solid ${c}">
      <b>${_esc(lev.navn)}</b>
      ${adr.label ? `<span class="lev-popup-sub">${_esc(adr.label)}</span>` : ""}
    </div>`;
  // Sorter: prioritet 1 (lavest tal) = vises foerst = hoejest prioritet
  const tlf = [...(lev.kontakt?.telefonnumre || [])].sort((a,b) => (a.prioritet||99)-(b.prioritet||99));
  tlf.forEach(t => {
    h += `<div class="lev-popup-row">📞 <a href="tel:${_esc('+45'+t.tlf.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(t.tlf)}</a>`;
    if (t.label) h += ` <span style="color:#aaa;font-size:11px">(${_esc(t.label)})</span>`;
    h += `</div>`;
  });
  if (lev.kontakt?.email)
    h += `<div class="lev-popup-row">✉️ <a href="mailto:${_esc(lev.kontakt.email)}">${_esc(lev.kontakt.email)}</a></div>`;
  if ((lev.vogne||[]).length)
    h += `<div class="lev-popup-klik-hint">Klik for vogne og detaljer →</div>`;
  h += `</div>`;
  return h;
}

// Fuld popup (klik): adresse, vogne med expand
function _levFullPopupHTML(lev, adr) {
  const c = lev.farve || "#3498db";
  let h = `<div class="lev-popup">
    <div class="lev-popup-top" style="border-left:4px solid ${c}">
      <b>${_esc(lev.navn)}</b>
      ${adr.label ? `<span class="lev-popup-sub">${_esc(adr.label)}</span>` : ""}
    </div>
    <div class="lev-popup-row">📍 ${_esc(adr.vej)}, ${_esc(adr.postnr)} ${_esc(adr.by)}</div>`;

  // Sorter: prioritet 1 = hoejest prioritet = vises foerst
  const tlf = [...(lev.kontakt?.telefonnumre || [])].sort((a,b) => (a.prioritet||99)-(b.prioritet||99));
  if (tlf.length) {
    h += `<hr class="lev-hr">`;
    tlf.forEach(t => {
      h += `<div class="lev-popup-row">📞 <a href="tel:${_esc('+45'+t.tlf.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(t.tlf)}</a>`;
      if (t.label) h += ` <span style="color:#aaa;font-size:11px">(${_esc(t.label)})</span>`;
      h += `</div>`;
    });
  }
  if (lev.kontakt?.email)
    h += `<div class="lev-popup-row">✉️ <a href="mailto:${_esc(lev.kontakt.email)}">${_esc(lev.kontakt.email)}</a></div>`;

  const alleVogne = lev.vogne || [];
  const vogne = alleVogne.filter(v =>
    !v.adresseIds?.length || v.adresseIds.includes(adr.id)
  );
  if (vogne.length) {
    h += `<hr class="lev-hr"><div class="lev-popup-section-hdr">🚗 Vogne (${vogne.length})</div>`;
    vogne.forEach(v => {
      const harDetaljer = !!(v.billede || v.reg || v.ladhøjde || v.totalLast || v.lastGrill || v.infoTekst);
      h += `<div class="lev-popup-vogn-row">`;
      h += `<div class="lev-popup-vogn-hdr${harDetaljer ? ' lev-popup-vogn-hdr-click' : ''}">`;
      h += `<span>🚗 <b>Vogn ${_esc(v.vognnummer || "?")}</b>`;
      if (v.beskrivelse) h += ` <span class="lev-popup-vogn-besk" style="font-weight:400;color:#555"> — ${_esc(v.beskrivelse)}</span>`;
      h += `</span>`;
      if (harDetaljer) h += `<span class="lev-popup-vogn-toggle">▶</span>`;
      h += `</div>`;
      if (harDetaljer) {
        h += `<div class="lev-popup-vogn-detail">`;
        if (v.billede) h += `<img src="${_esc(v.billede)}" class="lev-popup-vogn-img-full" alt="" onerror="this.style.display='none'" title="Klik for fuld størrelse">`;
        const specs = [];
        if (v.reg)       specs.push(`Reg.nr.: <b>${_esc(v.reg)}</b>`);
        if (v.ladhøjde) specs.push(`Ladhøjde: <b>${_esc(v.ladhøjde)}</b>`);
        if (v.totalLast) specs.push(`Total last: <b>${_esc(v.totalLast)}</b>`);
        if (v.lastGrill) specs.push(`Last grill: <b>${_esc(v.lastGrill)}</b>`);
        if (specs.length) h += `<div class="lev-popup-vogn-specs">${specs.join(' &nbsp;·&nbsp; ')}</div>`;
        if (v.infoTekst) h += `<div class="lev-popup-vogn-info">${_esc(v.infoTekst)}</div>`;
        h += `</div>`;
      }
      h += `</div>`;
    });
  }

  const pnr = (adr?.prioritetsPostnumre?.length)
    ? adr.prioritetsPostnumre : (lev.prioritetsPostnumre || []);
  if (pnr.length) {
    const vis = pnr.slice(0, 10).join(", ");
    const ekstra = pnr.length > 10 ? ` +${pnr.length - 10} mere` : "";
    h += `<hr class="lev-hr"><div class="lev-popup-prio">📮 Prioritet: ${vis}${ekstra}</div>`;
  }
  h += `</div>`;
  return h;
}

// ── HIGHLIGHT POSTNUMRE (via primær kommune) ──────────────────────
function _levHighlight(lev, adr) {
  _levClearHighlights();
  const pnr = (adr?.prioritetsPostnumre?.length)
    ? adr.prioritetsPostnumre
    : (lev.prioritetsPostnumre || []);
  if (!kommuneGeoJSON?.features || !pnr.length) return;

  const farve = lev.farve || "#3498db";

  // Brug kun den PRIMÆRE kommune per postnummer (størst overlap – index 0 fra API)
  const koder = new Set(
    pnr.flatMap(p => _levPostnrMap[String(p).trim()] || [])
  );
  if (!koder.size) return;

  kommuneGeoJSON.features.forEach(feat => {
    const kode = feat.properties?.kode;
    if (!kode || !koder.has(kode)) return;
    const lay = L.geoJSON(feat, {
      style: { color: farve, weight: 2, fillColor: farve, fillOpacity: 0.25 },
      interactive: false
    }).addTo(map);
    _levHighlights.push(lay);
  });
}

function _levClearHighlights() {
  _levHighlights.forEach(l => map.removeLayer(l));
  _levHighlights = [];
}

// ── ADMIN UI ─────────────────────────────────────────────────────
function _levBuildUI() {
  document.body.insertAdjacentHTML("beforeend", `
    <div id="levAdminPanel" class="lev-panel">
      <div class="lev-panel-hdr">
        <span id="levPanelTitle">🚛 Leverandørstyring</span>
        <button id="levPanelLuk" class="lev-panel-luk-btn" title="Luk panel">✕</button>
      </div>
      <div id="levPanelBody" class="lev-panel-body"></div>
    </div>`);
  document.getElementById("levPanelLuk").addEventListener("click", _levClosePanel);
}

async function _levOpenAdmin() {
  const ok = await _levEnsureLogin();
  if (!ok) return;
  if (!_levLoaded) await _levLoad();
  document.getElementById("levAdminPanel").classList.add("lev-panel-open");
  _levShowListe();
}

function _levClosePanel() {
  document.getElementById("levAdminPanel").classList.remove("lev-panel-open");
}

// ── LISTE ────────────────────────────────────────────────────────
function _levShowListe() {
  document.getElementById("levPanelTitle").textContent = "🚛 Leverandørstyring";
  const body = document.getElementById("levPanelBody");

  // Byg en række for én leverandør
  function _levRaekke(lev) {
    const kats = (lev.kategorier?.length ? lev.kategorier : (lev.kategori ? [lev.kategori] : []))
      .map(id => LEV_KATEGORIER.find(k => k.id === id)).filter(Boolean);
    const katTekst = kats.length ? kats.map(k => k.ikon + " " + k.navn).join(" + ") : "Ingen kategori";
    return `
      <div class="lev-list-row" data-id="${lev.id}">
        <span class="lev-list-dot" style="background:${lev.farve || '#aaa'}"></span>
        <div class="lev-list-info">
          <span class="lev-list-navn">${_esc(lev.navn || "Navnløs")}</span>
          <span class="lev-list-meta">
            ${katTekst} ·
            ${(lev.arbejdsAdresser || []).length} adr. ·
            ${(lev.vogne || []).length} vogne
            ${lev.aktiv === false ? " · <em style='color:#e74c3c'>inaktiv</em>" : ""}
          </span>
        </div>
        <span class="lev-list-arrow">›</span>
      </div>`;
  }

  // Filtrer og render listen
  function _levRenderFiltreret(soegeTekst) {
    const q = (soegeTekst || "").toLowerCase().trim();
    const data = _levData || [];
    const filtreret = q === "" ? data : data.filter(lev => {
      const kats = (lev.kategorier?.length ? lev.kategorier : (lev.kategori ? [lev.kategori] : []))
        .map(id => LEV_KATEGORIER.find(k => k.id === id)).filter(Boolean)
        .map(k => (k.navn + " " + k.ikon).toLowerCase()).join(" ");
      return (lev.navn || "").toLowerCase().includes(q)
        || kats.includes(q)
        || (lev.arbejdsAdresser || []).some(a =>
            (a.vej || "").toLowerCase().includes(q) ||
            (a.by  || "").toLowerCase().includes(q));
    });
    const rækker = filtreret.map(_levRaekke).join("")
      || `<p class="lev-empty">${q ? "Ingen leverandører matcher søgningen." : "Ingen leverandører endnu.<br>Klik \"+ Ny leverandør\" for at starte."}</p>`;
    document.getElementById("levListeContainer").innerHTML = rækker;
    body.querySelectorAll(".lev-list-row").forEach(row =>
      row.addEventListener("click", () => _levShowForm(row.dataset.id))
    );
  }

  body.innerHTML = `
    <div class="lev-list-toolbar">
      <button id="levNyBtn"      class="lev-btn-primary">+ Ny leverandør</button>
      <button id="levRefreshBtn" class="lev-btn-secondary">↻ Opdater</button>
      <input id="levSoeg" type="search" placeholder="Søg navn, kategori, adresse…"
        style="flex:1;min-width:0;padding:8px 8px;font-size:13px;border:1px solid #ccc;border-radius:7px">
    </div>
    <div id="levListeContainer" class="lev-list-container"></div>`;

  _levRenderFiltreret("");

  document.getElementById("levNyBtn").addEventListener("click", () => _levShowForm(null));
  document.getElementById("levRefreshBtn").addEventListener("click", async () => {
    const btn = document.getElementById("levRefreshBtn");
    btn.textContent = "⏳ Opdaterer...";
    btn.disabled = true;
    _levLoaded = false;
    await _levLoad();
    _levShowListe();
    const tid = new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    const nyBtn = document.getElementById("levRefreshBtn");
    if (nyBtn) {
      nyBtn.textContent = `✅ Opdateret ${tid}`;
      setTimeout(() => {
        const b = document.getElementById("levRefreshBtn");
        if (b) b.textContent = "↻ Opdater";
      }, 3000);
    }
  });
  document.getElementById("levSoeg").addEventListener("input", function () {
    _levRenderFiltreret(this.value);
  });
}

// ── FORMULAR ─────────────────────────────────────────────────────
function _levShowForm(id) {
  let lev  = id ? (_levData || []).find(l => l.id === id) : null;
  const isNy = !lev;
  if (isNy) {
    lev = {
      id: "lev-" + Date.now(), navn: "", farve: "#3498db", kategorier: [], kategori: "", aktiv: true,
      kontakt: { navn: "", email: "", telefonnumre: [] },
      fakturaAdresse: { vej: "", postnr: "", by: "" },
      arbejdsAdresser: [], vogne: [], prioritetsPostnumre: []
    };
  }

  document.getElementById("levPanelTitle").textContent = isNy ? "Ny leverandør" : _esc(lev.navn) || "Rediger";
  const body = document.getElementById("levPanelBody");

  const levKategorier = lev.kategorier?.length ? lev.kategorier : (lev.kategori ? [lev.kategori] : []);
  const katCheckboxes = LEV_KATEGORIER.map(k => `
    <label class="lev-kat-check-label">
      <input type="checkbox" name="lf-kat" value="${k.id}" ${levKategorier.includes(k.id) ? "checked" : ""}>
      ${k.ikon} ${_esc(k.navn)}
    </label>`).join("");

  body.innerHTML = `
    <div class="lev-form">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <button class="lev-tilbage-btn" id="levTilbage" style="margin-bottom:0;white-space:nowrap">← Tilbage til liste</button>
        <div style="position:relative;flex:1;min-width:0">
          <input id="lf-vogn-soeg-top" type="search" placeholder="Søg vognnummer, beskrivelse, depot…"
            autocomplete="off"
            style="width:100%;box-sizing:border-box;padding:5px 9px;font-size:13px;border:1px solid #ccc;border-radius:6px">
          <div id="lf-vogn-soeg-liste" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,0.15);z-index:9999;max-height:260px;overflow-y:auto"></div>
        </div>
      </div>

      <fieldset class="lev-fs" data-section="basis">
        <legend>📋 Basisoplysninger</legend>
        <label>Firmanavn <input type="text" id="lf-navn" value="${_esc(lev.navn)}" placeholder="Firma ApS"></label>
        <div class="lev-form-label">Kategori(er)</div>
        <div id="lf-kategorier" class="lev-kat-checkboxes">${katCheckboxes}</div>
        <div class="lev-row lev-row-color">
          <label>Farve <input type="color" id="lf-farve" value="${_esc(lev.farve || '#3498db')}"></label>
          <label class="lev-check-label"><input type="checkbox" id="lf-aktiv" ${lev.aktiv !== false ? "checked" : ""}> Aktiv</label>
        </div>
        <label>🔑 Adgangskode til tilgaengelighed.html
          <div class="lev-row" style="gap:8px;margin-top:4px">
            <input type="text" id="lf-kode" value="${_esc(lev.kode || '')}" placeholder="Vælg en kode til leverandøren" style="flex:1">
            <button type="button" id="levGenKode" class="lev-btn-secondary" style="white-space:nowrap">🎲 Generer</button>
          </div>
        </label>
      </fieldset>

      <fieldset class="lev-fs" data-section="kontakt">
        <legend>👤 Kontakt</legend>
        <label>Kontaktperson <input type="text" id="lf-knavn" value="${_esc(lev.kontakt?.navn)}"></label>
        <label>Email <input type="email" id="lf-kemail" value="${_esc(lev.kontakt?.email)}" placeholder="kontakt@firma.dk"></label>
        <div class="lev-section-sub">📞 Telefonnumre (øverst = højst prioritet)</div>
        <div id="lf-telefoner"></div>
        <button type="button" id="levAddTlf" class="lev-btn-add">+ Tilføj telefonnummer</button>
      </fieldset>

      <fieldset class="lev-fs" data-section="faktura">
        <legend>📄 Faktura-adresse</legend>
        <label>Vejnavn + nr. <input type="text" id="lf-fvej" value="${_esc(lev.fakturaAdresse?.vej)}"></label>
        <div class="lev-row">
          <label class="lev-label-postnr">Postnr. <input type="text" id="lf-fpostnr" value="${_esc(lev.fakturaAdresse?.postnr)}" placeholder="8000"></label>
          <label class="lev-label-by">By <input type="text" id="lf-fby" value="${_esc(lev.fakturaAdresse?.by)}"></label>
        </div>
      </fieldset>

      <fieldset class="lev-fs" data-section="adr">
        <legend>🏠 Depoter</legend>
        <p class="lev-hint">Hvert depot/udgangspunkt vises som markør på kortet.</p>
        <div id="lf-adresser"></div>
        <button type="button" id="levAddAdr" class="lev-btn-add">+ Tilføj adresse</button>
      </fieldset>

      <fieldset class="lev-fs" data-section="vogne">
        <legend>🚗 Vogne</legend>
        <div id="lf-vogne"></div>
        <button type="button" id="levAddVogn" class="lev-btn-add">+ Tilføj vogn</button>
      </fieldset>

      <div class="lev-form-footer">
        <button id="levGemBtn"  class="lev-btn-primary">💾 Gem</button>
        ${!isNy ? `<button id="levSletBtn" class="lev-btn-danger">🗑️ Slet</button>` : ""}
      </div>
    </div>`;

  // Fyld dynamiske sektioner
  const tlfDiv  = document.getElementById("lf-telefoner");
  const adrDiv  = document.getElementById("lf-adresser");
  const vognDiv = document.getElementById("lf-vogne");
  (lev.kontakt?.telefonnumre || []).forEach(t => _levAppendTlfRow(tlfDiv, t));
  (lev.arbejdsAdresser || []).forEach(a => _levAppendAdrRow(adrDiv, a));
  (lev.vogne || []).forEach(v => _levAppendVognRow(vognDiv, v, lev.arbejdsAdresser || []));

  // Søgefelt — autocomplete for både depoter og vogne
  (function() {
    const soegInput = document.getElementById("lf-vogn-soeg-top");
    const soegListe = document.getElementById("lf-vogn-soeg-liste");
    let aktivIndex = -1;
    let aktivItems = []; // { type, el, label, besk, depoter }

    function lukliste() {
      soegListe.style.display = "none";
      soegListe.innerHTML = "";
      aktivIndex = -1;
      aktivItems = [];
    }

    function vaelgElement(item) {
      item.el.scrollIntoView({ behavior: "smooth", block: "center" });
      item.el.style.transition = "box-shadow 0.2s";
      item.el.style.boxShadow = item.type === "depot" ? "0 0 0 3px #2980b9" : "0 0 0 3px #f0a500";
      setTimeout(() => { item.el.style.boxShadow = ""; }, 1800);
      soegInput.value = "";
      lukliste();
    }

    soegInput.addEventListener("input", function() {
      const ql = this.value.toLowerCase().trim();
      if (!ql) { lukliste(); return; }

      // Depoter: match på label eller by
      const depotItems = Array.from(document.querySelectorAll("#lf-adresser .lev-adr-row"))
        .map(row => ({
          type:  "depot",
          el:    row,
          label: (row.querySelector(".a-label")?.value || row.querySelector(".a-vej")?.value || "Depot").trim()
        }))
        .filter(d => d.label.toLowerCase().includes(ql));

      // Vogne: niveau 1 = vognnr/depot-label, niveau 2 = beskrivelse
      const vognPri1 = [], vognPri2 = [];
      Array.from(document.querySelectorAll("#lf-vogne .lev-vogn-row")).forEach(row => {
        const vognr  = (row.querySelector(".v-vognr")?.value || "").toLowerCase();
        const besk   = (row.querySelector(".v-besk")?.value  || "").toLowerCase();
        const dLabels = Array.from(row.querySelectorAll(".lev-vogn-depot-checks label"))
          .map(l => (l.dataset.depotNavn || l.textContent).trim().toLowerCase());
        const item = {
          type: "vogn", el: row,
          label: row.querySelector(".v-vognr")?.value || "?",
          besk:  row.querySelector(".v-besk")?.value  || "",
          depoter: Array.from(row.querySelectorAll(".lev-vogn-depot-checks label"))
            .map(l => (l.dataset.depotNavn || l.textContent).trim()).filter(Boolean)
        };
        if (vognr.includes(ql) || dLabels.some(d => d.includes(ql))) vognPri1.push(item);
        else if (besk.includes(ql)) vognPri2.push(item);
      });

      aktivItems = [...depotItems, ...vognPri1, ...vognPri2];
      aktivIndex = -1;

      if (!aktivItems.length) {
        soegListe.innerHTML = '<div style="padding:8px 12px;font-size:13px;color:#888">Ingen resultater</div>';
        soegListe.style.display = "block";
        return;
      }

      let html = "";
      if (depotItems.length) {
        html += '<div style="padding:3px 12px 2px;font-size:10px;font-weight:700;color:#2980b9;text-transform:uppercase;letter-spacing:.5px;background:#f0f7ff">🏠 Depoter</div>';
        depotItems.forEach((d, i) => {
          html += `<div class="lev-soeg-item" data-idx="${i}" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:13px"><strong>🏠 ${_esc(d.label)}</strong></div>`;
        });
      }
      const vognItems = [...vognPri1, ...vognPri2];
      if (vognItems.length) {
        if (depotItems.length) html += '<div style="height:1px;background:#e0e0e0;margin:2px 0"></div>';
        html += '<div style="padding:3px 12px 2px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px">🚗 Vogne</div>';
        vognItems.forEach((v, i) => {
          const dt = v.depoter.length ? '<span style="color:#888;font-size:11px"> — ' + v.depoter.join(", ") + '</span>' : "";
          html += `<div class="lev-soeg-item" data-idx="${depotItems.length + i}" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:13px"><strong>🚗 Vogn ${_esc(v.label)}</strong>${v.besk ? " — " + _esc(v.besk) : ""}${dt}</div>`;
        });
      }
      soegListe.innerHTML = html;
      soegListe.style.display = "block";

      soegListe.querySelectorAll(".lev-soeg-item").forEach((item, i) => {
        item.addEventListener("mousedown", e => { e.preventDefault(); if (aktivItems[i]) vaelgElement(aktivItems[i]); });
        item.addEventListener("mouseenter", () => {
          soegListe.querySelectorAll(".lev-soeg-item").forEach(el => el.style.background = "");
          item.style.background = "#f0f7ff"; aktivIndex = i;
        });
      });
    });

    soegInput.addEventListener("keydown", function(e) {
      const items = Array.from(soegListe.querySelectorAll(".lev-soeg-item"));
      if (!items.length) return;
      if (e.key === "ArrowDown")      { e.preventDefault(); aktivIndex = Math.min(aktivIndex + 1, items.length - 1); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); aktivIndex = Math.max(aktivIndex - 1, 0); }
      else if (e.key === "Enter")     { e.preventDefault(); if (aktivIndex >= 0 && aktivItems[aktivIndex]) vaelgElement(aktivItems[aktivIndex]); return; }
      else if (e.key === "Escape")    { lukliste(); return; }
      else return;
      items.forEach(el => el.style.background = "");
      if (items[aktivIndex]) items[aktivIndex].style.background = "#f0f7ff";
    });

    document.addEventListener("click", function _soegLuk(e) {
      if (!soegInput.contains(e.target) && !soegListe.contains(e.target)) lukliste();
      if (!document.getElementById("lf-vogn-soeg-top")) document.removeEventListener("click", _soegLuk);
    });
  })();

  document.getElementById("levTilbage").addEventListener("click", _levShowListe);
  document.getElementById("levAddTlf") .addEventListener("click", () => _levAppendTlfRow(tlfDiv, {}));
  document.getElementById("levAddAdr") .addEventListener("click", () => _levAppendAdrRow(adrDiv, {}));
  document.getElementById("levAddVogn").addEventListener("click", () => {
    // Læs aktuelle depoter fra formularen (kan være ændret siden åbning)
    const aktuelleAdr = Array.from(document.querySelectorAll("#lf-adresser .lev-adr-row")).map(row => ({
      id:    row.dataset.id,
      label: row.querySelector(".a-label")?.value.trim() || row.querySelector(".a-vej")?.value.trim() || "Depot"
    }));
    _levAppendVognRow(vognDiv, {}, aktuelleAdr);
  });
  document.getElementById("levGemBtn") .addEventListener("click", () => _levGem(lev));
  document.getElementById("levSletBtn")?.addEventListener("click", () => _levSlet(lev.id));
  document.getElementById("levGenKode").addEventListener("click", () => {
    const tegn = "abcdefghjkmnpqrstuvwxyz23456789";
    let kode = "";
    for (let i = 0; i < 8; i++) kode += tegn[Math.floor(Math.random() * tegn.length)];
    document.getElementById("lf-kode").value = kode;
  });
}

// ── TELEFON-RÆKKER ───────────────────────────────────────────────
function _levAppendTlfRow(container, t = {}) {
  const div = document.createElement("div");
  div.className = "lev-tlf-row";
  div.innerHTML = `
    <div class="lev-row lev-tlf-inputs">
      <input type="text" class="t-label" value="${_esc(t.label)}" placeholder="Label (Primær, Vagt...)">
      <input type="tel"  class="t-tlf"   value="${_esc(t.tlf)}"   placeholder="Telefonnummer">
      <button type="button" class="lev-slet-row-btn" title="Fjern">✕</button>
    </div>`;
  container.appendChild(div);
  div.querySelector(".lev-slet-row-btn").addEventListener("click", () => div.remove());
}

// ── ADRESSE-RÆKKER ───────────────────────────────────────────────
function _levAppendAdrRow(container, a = {}) {
  const div = document.createElement("div");
  div.className = "lev-adr-row";
  div.dataset.id = a.id || "adr-" + Date.now();
  const adrPnr = (a.prioritetsPostnumre || []).join(", ");
  div.innerHTML = `
    <div class="lev-row lev-row-header">
      <label class="lev-label-grow">Navn/label <input type="text" class="a-label" value="${_esc(a.label)}" placeholder="f.eks. Nord-depot"></label>
      <button type="button" class="lev-slet-row-btn">✕</button>
    </div>
    <label>Vejnavn + nr. <input type="text" class="a-vej" value="${_esc(a.vej)}"></label>
    <div class="lev-row">
      <label class="lev-label-postnr">Postnr. <input type="text" class="a-postnr" value="${_esc(a.postnr)}" placeholder="8000"></label>
      <label class="lev-label-by">By <input type="text" class="a-by" value="${_esc(a.by)}"></label>
    </div>
    <div class="lev-row lev-coord-row">
      <label class="lev-label-coord">Lat. <input type="text" class="a-lat" value="${a.lat || ""}" placeholder="56.xxxx"></label>
      <label class="lev-label-coord">Lon. <input type="text" class="a-lon" value="${a.lon || ""}" placeholder="10.xxxx"></label>
      <button type="button" class="lev-geocode-btn">📍 Geocode</button>
    </div>
    <label class="lev-label-pnr">📮 Prioritetspostnumre for denne adresse
      <textarea class="a-pnr lev-textarea lev-textarea-sm" rows="2" placeholder="5000, 5200, 5210...">${_esc(adrPnr)}</textarea>
    </label>
    <div style="margin-top:6px">
      <div style="font-size:11.5px;font-weight:600;color:#5a6a7a;margin-bottom:4px">
        🚛️ Kører med <span style="font-weight:400;color:#aaa;font-size:11px">(tomt = arver fra leverandøren)</span>
      </div>
      <div class="a-kategorier" style="display:flex;flex-direction:column;gap:3px">
        ${LEV_KATEGORIER.map(k => `
          <label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" class="a-kat-check" value="${k.id}"
              ${(a.kategorier||[]).includes(k.id) ? "checked" : ""}>
            ${k.ikon} ${k.navn}
          </label>`).join("")}
      </div>
    </div>`;
  container.appendChild(div);
  div.querySelector(".lev-slet-row-btn").addEventListener("click", () => div.remove());
  div.querySelector(".lev-geocode-btn").addEventListener("click", async (e) => {
    const btn    = e.currentTarget;
    const vej    = div.querySelector(".a-vej").value.trim();
    const postnr = div.querySelector(".a-postnr").value.trim();
    const by     = div.querySelector(".a-by").value.trim();
    if (!vej || !postnr) { alert("Udfyld vejnavn og postnr. inden geocoding"); return; }
    btn.textContent = "⏳"; btn.disabled = true;
    const coords = await _levGeocode(`${vej}, ${postnr} ${by}`);
    btn.disabled = false;
    if (coords) {
      div.querySelector(".a-lat").value = coords.lat.toFixed(6);
      div.querySelector(".a-lon").value = coords.lon.toFixed(6);
      btn.textContent = "✅ OK";
      setTimeout(() => btn.textContent = "📍 Geocode", 2500);
    } else {
      btn.textContent = "❌ Fejl";
      setTimeout(() => btn.textContent = "📍 Geocode", 2500);
      alert("Adressen ikke fundet – tjek vejnavn og postnr.");
    }
  });
}

// ── VOGN-RÆKKER ──────────────────────────────────────────────────
function _levAppendVognRow(container, v = {}, adresser = []) {
  const div = document.createElement("div");
  div.className = "lev-vogn-row";
  div.dataset.id        = v.id      || "vogn-" + Date.now();
  div.dataset.billedUrl = v.billede || "";
  const harFoto     = !!v.billede;
  const harDetaljer = !!(v.reg || v.ladhøjde || v.totalLast || v.lastGrill || v.infoTekst || v.billede);
  const depotChecks = adresser.length ? `
    <div class="lev-vogn-depoter">
      <div style="font-size:11.5px;font-weight:600;color:#5a6a7a;margin-top:8px;margin-bottom:4px">
        🏠 Kører fra depot <span style="font-weight:400;color:#aaa;font-size:11px">(tomt = alle depoter)</span>
      </div>
      <div class="lev-vogn-depot-checks" style="display:flex;flex-direction:column;gap:3px">
        ${adresser.map(a => `
          <label data-depot-navn="${a.label || a.vej || 'Depot'}" style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;cursor:pointer">
            <input type="checkbox" class="v-depot-check" value="${a.id}"
              ${(v.adresseIds||[]).includes(a.id) ? "checked" : ""}>
            ${a.label || a.vej || "Depot"}
          </label>`).join("")}
      </div>
    </div>` : "";
  div.innerHTML = `
    <div class="lev-row lev-row-header">
      <label class="lev-label-grow" style="font-weight:700;font-size:13px;color:#1a2a3a">
        Vognnummer
        <input type="text" class="v-vognr" value="${_esc(v.vognnummer)}" placeholder="f.eks. 6515" style="font-weight:700">
      </label>
      <button type="button" class="lev-slet-row-btn">✕</button>
    </div>
    <label>Kort beskrivelse
      <input type="text" class="v-besk" value="${_esc(v.beskrivelse)}" placeholder="Ladvogn – 5 kundepladser">
    </label>
    ${depotChecks}
    <button type="button" class="lev-vogn-toggle-btn">${harDetaljer ? "▾" : "▸"} Reg.nr. &amp; specifikationer</button>
    <div class="lev-vogn-specs-wrap" style="display:${harDetaljer ? "block" : "none"}">
      <label>Reg.nr.
        <input type="text" class="v-reg" value="${_esc(v.reg)}" placeholder="AB 12 345">
      </label>
      <div class="lev-row">
        <label style="flex:1">Ladhøjde
          <input type="text" class="v-ladhøjde" value="${_esc(v.ladhøjde)}" placeholder="f.eks. 2,4 m">
        </label>
        <label style="flex:1">Total last
          <input type="text" class="v-totalLast" value="${_esc(v.totalLast)}" placeholder="f.eks. 3500 kg">
        </label>
      </div>
      <label>Last grill
        <input type="text" class="v-lastGrill" value="${_esc(v.lastGrill)}" placeholder="f.eks. 750 kg">
      </label>
      <label>Info / bemærkninger
        <textarea class="v-infoTekst lev-textarea" rows="3" placeholder="Fritekst – særlige egenskaber, udstyr, begrænsninger...">${_esc(v.infoTekst)}</textarea>
      </label>
      <div class="lev-vogn-foto-wrap">
        ${harFoto
          ? `<img class="lev-vogn-thumb" src="${_esc(v.billede)}" alt="" onerror="this.style.display='none'">`
          : `<div class="lev-vogn-nofoto">Intet foto</div>`}
        <div class="lev-vogn-foto-btns">
          <label class="lev-btn-add lev-file-label" style="cursor:pointer">
            📷 Upload foto <input type="file" class="v-foto" accept="image/*" style="display:none">
          </label>
          ${harFoto ? `<button type="button" class="lev-btn-fjern-foto">✕ Fjern foto</button>` : ""}
        </div>
      </div>
    </div>`;
  container.appendChild(div);

  div.querySelector(".lev-vogn-toggle-btn").addEventListener("click", () => {
    const wrap = div.querySelector(".lev-vogn-specs-wrap");
    const btn  = div.querySelector(".lev-vogn-toggle-btn");
    const open = wrap.style.display !== "none";
    wrap.style.display = open ? "none" : "block";
    btn.textContent    = (open ? "▸" : "▾") + " Reg.nr. & specifikationer";
  });

  div.querySelector(".lev-slet-row-btn").addEventListener("click", () => div.remove());

  div.querySelector(".v-foto").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = div.querySelector(".lev-vogn-nofoto") || div.querySelector(".lev-vogn-thumb");
    try {
      const b64      = await _levResizeB64(file);
      const reg      = div.querySelector(".v-reg").value.trim();
      const filename = "vogn-" + (reg || Date.now()).toString().toLowerCase().replace(/\s+/g, "") + ".jpg";

      const resp = await _levSpFetch("/leverandoerer/billeder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, base64: b64 })
      });
      const data = await resp.json();

      if (data.ok && data.url) {
        div.dataset.billedUrl = data.url;
        let thumb = div.querySelector(".lev-vogn-thumb");
        if (!thumb) {
          thumb = Object.assign(document.createElement("img"), { className: "lev-vogn-thumb", alt: "" });
          const nofoto = div.querySelector(".lev-vogn-nofoto");
          if (nofoto) nofoto.replaceWith(thumb);
          else div.querySelector(".lev-vogn-foto-wrap").prepend(thumb);
        }
        thumb.src = data.url;
        // Tilføj fjern-knap
        if (!div.querySelector(".lev-btn-fjern-foto")) {
          const fjernBtn = Object.assign(document.createElement("button"), {
            type: "button", className: "lev-btn-fjern-foto", textContent: "✕ Fjern foto"
          });
          fjernBtn.addEventListener("click", () => _levFjernFoto(div));
          div.querySelector(".lev-vogn-foto-btns").appendChild(fjernBtn);
        }
      } else {
        alert("Billedupload fejlede – prøv igen");
      }
    } catch (err) {
      console.error("Billedupload fejl:", err);
      alert("Billedupload fejlede");
    }
  });

  div.querySelector(".lev-btn-fjern-foto")?.addEventListener("click", () => _levFjernFoto(div));
}

function _levFjernFoto(div) {
  const thumb = div.querySelector(".lev-vogn-thumb");
  if (thumb) {
    const nofoto = Object.assign(document.createElement("div"), { className: "lev-vogn-nofoto", textContent: "Intet foto" });
    thumb.replaceWith(nofoto);
  }
  div.querySelector(".lev-btn-fjern-foto")?.remove();
  div.dataset.billedUrl = "";
}

// ── GEM ──────────────────────────────────────────────────────────
async function _levGem(template) {
  const navn = document.getElementById("lf-navn").value.trim();
  if (!navn) { alert("Firmanavn er påkrævet"); return; }

  const btn = document.getElementById("levGemBtn");
  btn.textContent = "⏳ Gemmer..."; btn.disabled = true;

  try {
    const lev = {
      id:       template.id,
      navn,
      farve:    document.getElementById("lf-farve").value,
      kategorier: Array.from(document.querySelectorAll('#lf-kategorier input[name="lf-kat"]:checked')).map(el => el.value),
      aktiv:    document.getElementById("lf-aktiv").checked,
      kode:     document.getElementById("lf-kode").value.trim(),
      kontakt: {
        navn:         document.getElementById("lf-knavn").value.trim(),
        email:        document.getElementById("lf-kemail").value.trim(),
        telefonnumre: []
      },
      fakturaAdresse: {
        vej:    document.getElementById("lf-fvej").value.trim(),
        postnr: document.getElementById("lf-fpostnr").value.trim(),
        by:     document.getElementById("lf-fby").value.trim()
      },
      arbejdsAdresser: [],
      vogne: [],
      // Bevar eksisterende rod-niveau prioriteter (bagudkompatibilitet med ældre data)
      prioritetsPostnumre: template.prioritetsPostnumre || []
    };

    // Telefonnumre
    document.querySelectorAll("#lf-telefoner .lev-tlf-row").forEach((row, i) => {
      const tlf = row.querySelector(".t-tlf").value.trim();
      if (tlf) lev.kontakt.telefonnumre.push({
        label: row.querySelector(".t-label").value.trim() || `Telefon ${i + 1}`,
        tlf, prioritet: i + 1
      });
    });

    // Adresser (inkl. per-adresse prioritetspostnumre)
    document.querySelectorAll("#lf-adresser .lev-adr-row").forEach(row => {
      lev.arbejdsAdresser.push({
        id:                  row.dataset.id,
        label:               row.querySelector(".a-label").value.trim(),
        vej:                 row.querySelector(".a-vej").value.trim(),
        postnr:              row.querySelector(".a-postnr").value.trim(),
        by:                  row.querySelector(".a-by").value.trim(),
        lat:                 parseFloat(row.querySelector(".a-lat").value) || null,
        lon:                 parseFloat(row.querySelector(".a-lon").value) || null,
        prioritetsPostnumre: (row.querySelector(".a-pnr")?.value || "")
                               .split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d{4}$/.test(s)),
        kategorier:          Array.from(row.querySelectorAll(".a-kat-check:checked")).map(el => el.value)
      });
    });

    // Vogne
    document.querySelectorAll("#lf-vogne .lev-vogn-row").forEach(row => {
      const thumb = row.querySelector(".lev-vogn-thumb");
      lev.vogne.push({
        id:          row.dataset.id,
        reg:         row.querySelector(".v-reg")?.value.trim()       || "",
        beskrivelse: row.querySelector(".v-besk")?.value.trim()      || "",
        vognnummer:  row.querySelector(".v-vognr")?.value.trim()     || "",
        ladhøjde:   row.querySelector(".v-ladhøjde")?.value.trim()  || "",
        totalLast:   row.querySelector(".v-totalLast")?.value.trim() || "",
        lastGrill:   row.querySelector(".v-lastGrill")?.value.trim() || "",
        infoTekst:   row.querySelector(".v-infoTekst")?.value.trim() || "",
        billede:     row.dataset.billedUrl || (thumb?.src?.startsWith("http") ? thumb.src : null),
        adresseIds:  Array.from(row.querySelectorAll(".v-depot-check:checked")).map(el => el.value)
      });
    });

    const resp = await _levSpFetch("/leverandoerer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leverandoer: lev })
    });
    if (!resp.ok) throw new Error(await resp.text());

    // Opdater lokal state
    if (!_levData) _levData = [];
    const idx = _levData.findIndex(l => l.id === lev.id);
    if (idx >= 0) _levData[idx] = lev;
    else          _levData.push(lev);

    _levBuildMarkers();
    _levShowListe();
  } catch (e) {
    console.error("Gem leverandør fejlede:", e);
    alert("Gem fejlede – tjek konsollen (F12)");
    btn.textContent = "💾 Gem"; btn.disabled = false;
  }
}

async function _levSlet(id) {
  if (!confirm("Er du sikker på at du vil slette denne leverandør?\nAlle adresser og vogne slettes også.")) return;
  try {
    const resp = await _levSpFetch(`/leverandoerer/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(await resp.text());
    _levData = (_levData || []).filter(l => l.id !== id);
    _levBuildMarkers();
    _levShowListe();
  } catch (e) {
    console.error("Slet fejlede:", e);
    alert("Slet fejlede – tjek konsollen (F12)");
  }
}

// ── GEOCODING ────────────────────────────────────────────────────
async function _levGeocode(query) {
  try {
    const url  = `https://api.dataforsyningen.dk/adresser?q=${encodeURIComponent(query)}&per_side=1&format=json`;
    const data = await (await fetch(url)).json();
    if (data.length) {
      const c = data[0].adgangsadresse?.adgangspunkt?.koordinater;
      if (c) return { lon: c[0], lat: c[1] };
    }
  } catch {}
  return null;
}

// ── BILLEDE RESIZE ───────────────────────────────────────────────
function _levResizeB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX   = 800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── LIGHTBOX ─────────────────────────────────────────────────────
function _levLightbox(src) {
  let lb = document.getElementById("lev-lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lev-lightbox";
    lb.className = "lev-lightbox";
    lb.innerHTML = '<span class="lev-lightbox-luk" title="Luk">✕</span><img alt="">';
    lb.addEventListener("click", () => lb.style.display = "none");
    document.body.appendChild(lb);
  }
  lb.querySelector("img").src = src;
  lb.style.display = "flex";
}

// ── HJÆLPER ──────────────────────────────────────────────────────
function _esc(s) {
  return (s || "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ════════════════════════════════════════════════════════════════
// EGNE ENHEDER
// ════════════════════════════════════════════════════════════════

async function _enhedLoad() {
  try {
    const resp = await fetch(LEV_SP_WORKER + "/enheder", { credentials: "include" });
    if (resp.status === 401) {
      // Session udløbet — nulstil så næste lag-aktivering trigger login igen
      _enhedLoaded = false;
      console.warn("Egne enheder: session udløbet");
      return;
    }
    if (!resp.ok) { console.warn("Egne enheder fejlede:", resp.status); return; }
    const data = await resp.json();
    _enhedData   = data.enheder || [];
    _enhedLoaded = true;
    _enhedRenderLag();
  } catch (e) {
    console.warn("Egne enheder: load fejlede", e);
  }
}

function _enhedRenderLag() {
  EGNE_KATEGORIER.forEach(k => _enhedKatLag[k.id].clearLayers());
  if (typeof stationerLayer !== "undefined") stationerLayer.clearLayers();
  if (typeof uadLayer !== "undefined") uadLayer.clearLayers();

  const markerPos = (typeof currentMarker !== "undefined" && currentMarker && currentMarker.getLatLng)
    ? currentMarker.getLatLng() : null;
  const alleEnheder = (_enhedData || []);
  const maaFlytte   = _levAktivRolle === "admin" || _levAktivRolle === "drift";

  // ── STATIONER ─────────────────────────────────────────────────
  alleEnheder.filter(e => e.type === "station" && e.lat != null && e.lon != null).forEach(st => {
    if (typeof stationerLayer === "undefined") return;
    const tilknyttede = alleEnheder.filter(x => x.stationId === st.id);
    const afstand = markerPos ? (map.distance(markerPos, L.latLng(st.lat, st.lon)) / 1000) : null;

    const katGrupper = EGNE_KATEGORIER.map(k => {
      const i = tilknyttede.filter(x => {
        const xKats = x.kategorier?.length ? x.kategorier : (x.kategori ? [x.kategori] : []);
        return xKats.includes(k.id);
      });
      if (!i.length) return "";
      return `<div style="margin-top:6px">
        <div style="font-size:11px;font-weight:700;color:#5a6a7a">${k.ikon} ${k.navn}</div>
        ${i.map(x => {
          const uad = _erUAD(x);
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0">
            <span>${_esc(x.navn)}${x.vognnummer ? ` <span style="color:#888">(${_esc(x.vognnummer)})</span>` : ""}</span>
            ${uad ? _uadBadge(x) : `<span style="color:#27ae60;font-size:11px">✓ Klar</span>`}
          </div>`;
        }).join("")}
      </div>`;
    }).join("");

    const tlfHTML = st.kontakt
      ? `<div class="lev-popup-row">📞 <a href="tel:+45${_esc(st.kontakt.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(st.kontakt)}</a></div>` : "";
    const afstandTekst = afstand != null
      ? `<div style="font-size:11px;color:#888;margin-bottom:4px">📍 ${afstand.toFixed(1)} km fra søgt adresse</div>` : "";

    const marker = L.marker([st.lat, st.lon], { icon: L.divIcon({
      className: "",
      html: `<div class="lev-marker-icon" style="background:#27ae60;font-size:14px;width:28px;height:28px;line-height:28px">🏠</div>`,
      iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-16]
    })});
    marker.bindPopup(`<div class="lev-popup">
      <div class="lev-popup-top" style="border-left:4px solid #27ae60">
        <b>${_esc(st.navn)}</b><span class="lev-popup-sub">🏠 Station</span>
      </div>
      ${afstandTekst}
      ${st.adresse ? `<div class="lev-popup-row">📍 ${_esc(st.adresse)}</div>` : ""}
      ${tlfHTML}
      ${st.bemærkning ? `<div class="lev-popup-row"><em>${_esc(st.bemærkning)}</em></div>` : ""}
      ${katGrupper ? `<hr class="lev-hr"><div class="lev-popup-section-hdr">Tilknyttede enheder</div>${katGrupper}` : ""}
    </div>`, { maxWidth: 320, className: "lev-leaflet-popup" });
    stationerLayer.addLayer(marker);
  });

  // ── EGNE ENHEDER per kategori-lag ─────────────────────────────
  EGNE_KATEGORIER.forEach(kat => {
    if (!_enhedKatLag[kat.id]) return;

    const enhederIKat = alleEnheder.filter(e => {
      if (e.type === "station") return false;
      const kats = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
      return kats.includes(kat.id);
    });

    // Grupper på stationId
    const medStation  = enhederIKat.filter(e => e.stationId);
    const udenStation = enhederIKat.filter(e => !e.stationId);
    const stGrupper   = new Map();
    medStation.forEach(e => {
      if (!stGrupper.has(e.stationId)) stGrupper.set(e.stationId, []);
      stGrupper.get(e.stationId).push(e);
    });

    // Grupperet stationsmarkør
    stGrupper.forEach((enheder, stId) => {
      const st = alleEnheder.find(s => s.id === stId);
      if (!st || st.lat == null || st.lon == null) {
        enheder.forEach(e => _renderEnhedMarker(e, kat, maaFlytte)); return;
      }
      const harUAD  = enheder.some(e => _erUAD(e));
      const alleUAD = enheder.every(e => _erUAD(e));
      const bg      = alleUAD ? "#e74c3c" : harUAD ? "#e67e22" : "#2471a3";
      const afstand = markerPos ? (map.distance(markerPos, L.latLng(st.lat, st.lon)) / 1000) : null;

      const rækker = enheder.map(e => {
        const uad = _erUAD(e);
        const vognBtn = e.vognnummer && maaFlytte
          ? `<button class="lev-enhed-flyt-btn" data-enhedid="${_esc(e.id)}" style="font-size:11px;padding:2px 5px;background:#e8f4fd;border:1px solid #2980b9;border-radius:4px;cursor:pointer;color:#2980b9;margin-left:4px">🔄</button>` : "";
        const uadBtn = maaFlytte
          ? `<button class="lev-enhed-uad-btn" data-enhedid="${_esc(e.id)}" style="font-size:11px;padding:2px 5px;background:${uad?"#fdecea":"#f0f8ee"};border:1px solid ${uad?"#e74c3c":"#27ae60"};border-radius:4px;cursor:pointer;color:${uad?"#e74c3c":"#27ae60"};margin-left:4px">${uad?"✅ Klar":"🔴 UAD"}</button>` : "";
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0">
          <div><span style="font-size:13px;font-weight:${uad?"400":"600"};color:${uad?"#aaa":"inherit"}">${_esc(e.navn)}</span>
          ${e.vognnummer ? `<span style="font-size:11px;color:#888;margin-left:4px">🚗${_esc(e.vognnummer)}</span>` : ""}
          ${uad ? _uadBadge(e) : ""}</div>
          <div style="display:flex;gap:2px">${vognBtn}${uadBtn}</div>
        </div>`;
      }).join("");

      const stTlf = st.kontakt
        ? `<div class="lev-popup-row">📞 <a href="tel:+45${_esc(st.kontakt.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(st.kontakt)}</a></div>` : "";
      const afstandTekst = afstand != null
        ? `<div style="font-size:11px;color:#888;margin-bottom:4px">📍 ${afstand.toFixed(1)} km fra søgt adresse</div>` : "";

      const marker = L.marker([st.lat, st.lon], { icon: L.divIcon({
        className: "",
        html: `<div class="lev-marker-icon" style="background:${bg};font-size:14px;width:28px;height:28px;line-height:28px">${kat.ikon}</div>`,
        iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-16]
      })});
      marker.bindPopup(`<div class="lev-popup">
        <div class="lev-popup-top" style="border-left:4px solid ${bg}">
          <b>${_esc(st.navn)}</b><span class="lev-popup-sub">${kat.ikon} ${kat.navn}</span>
        </div>
        ${afstandTekst}
        ${st.adresse ? `<div class="lev-popup-row">📍 ${_esc(st.adresse)}</div>` : ""}
        ${stTlf}<hr class="lev-hr">${rækker}
      </div>`, { maxWidth: 340, className: "lev-leaflet-popup" });
      marker.on("popupopen", function() {
        const el = this.getPopup().getElement(); if (!el) return;
        el.querySelectorAll(".lev-enhed-flyt-btn").forEach(b => b.addEventListener("click", () => _enhedFlytVognDialog(b.dataset.enhedid)));
        el.querySelectorAll(".lev-enhed-uad-btn").forEach(b => b.addEventListener("click", () => _enhedUADDialog(b.dataset.enhedid)));
      });
      _enhedKatLag[kat.id].addLayer(marker);
    });

    udenStation.forEach(e => _renderEnhedMarker(e, kat, maaFlytte));
  });

  // ── UAD-LAG ────────────────────────────────────────────────────
  if (typeof uadLayer !== "undefined") {
    alleEnheder.filter(e => e.type !== "station" && _erUAD(e) && e.lat != null && e.lon != null).forEach(e => {
      const kats = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
      const fKat = EGNE_KATEGORIER.find(k => kats.includes(k.id));
      const stNavn = e.stationId ? (alleEnheder.find(s => s.id === e.stationId)?.navn || "") : "";
      const uadBtn = maaFlytte
        ? `<button class="lev-enhed-uad-btn" data-enhedid="${_esc(e.id)}" style="font-size:11px;padding:3px 8px;background:#fdecea;border:1px solid #e74c3c;border-radius:4px;cursor:pointer;color:#e74c3c;margin-top:6px">✅ Sæt klar igen</button>` : "";
      const marker = L.marker([e.lat, e.lon], { icon: L.divIcon({
        className: "",
        html: `<div class="lev-marker-icon" style="background:#e74c3c;font-size:14px;width:28px;height:28px;line-height:28px">${fKat?.ikon||"📍"}</div>`,
        iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-16]
      })});
      marker.bindPopup(`<div class="lev-popup">
        <div class="lev-popup-top" style="border-left:4px solid #e74c3c">
          <b>${_esc(e.navn)}</b>${_uadBadge(e)}
          <span class="lev-popup-sub">${fKat?.ikon||""} ${fKat?.navn||""}</span>
        </div>
        ${stNavn ? `<div class="lev-popup-row">🏠 ${_esc(stNavn)}</div>` : ""}
        ${e.vognnummer ? `<div class="lev-popup-row">🚗 ${_esc(e.vognnummer)}</div>` : ""}
        ${e.kontakt ? `<div class="lev-popup-row">📞 <a href="tel:+45${_esc(e.kontakt.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(e.kontakt)}</a></div>` : ""}
        ${uadBtn}
      </div>`, { maxWidth: 280, className: "lev-leaflet-popup" });
      marker.on("popupopen", function() {
        const el = this.getPopup().getElement(); if (!el) return;
        el.querySelectorAll(".lev-enhed-uad-btn").forEach(b => b.addEventListener("click", () => _enhedUADDialog(b.dataset.enhedid)));
      });
      uadLayer.addLayer(marker);
    });
  }
}

// Individuel enhedsmarkør (ingen stationstilknytning)
function _renderEnhedMarker(enhed, kat, maaFlytte) {
  if (enhed.lat == null || enhed.lon == null) return;
  const uad  = _erUAD(enhed);
  const bg   = uad ? "#e74c3c" : "#2471a3";
  const kats = enhed.kategorier?.length ? enhed.kategorier : (enhed.kategori ? [enhed.kategori] : []);
  const katTekst = kats.map(id => { const k = EGNE_KATEGORIER.find(k=>k.id===id); return k?`${k.ikon} ${k.navn}`:""; }).join(" · ");
  const vognBtn = enhed.vognnummer && maaFlytte
    ? `<button class="lev-enhed-flyt-btn" data-enhedid="${_esc(enhed.id)}" style="font-size:11px;padding:2px 6px;background:#e8f4fd;border:1px solid #2980b9;border-radius:4px;cursor:pointer;color:#2980b9;margin-left:6px">🔄 Flyt vogn</button>` : "";
  const uadBtn = maaFlytte
    ? `<button class="lev-enhed-uad-btn" data-enhedid="${_esc(enhed.id)}" style="font-size:11px;padding:2px 6px;background:${uad?"#fdecea":"#f0f8ee"};border:1px solid ${uad?"#e74c3c":"#27ae60"};border-radius:4px;cursor:pointer;color:${uad?"#e74c3c":"#27ae60"};margin-left:6px">${uad?"✅ Sæt klar":"🔴 UAD"}</button>` : "";
  const marker = L.marker([enhed.lat, enhed.lon], { icon: L.divIcon({
    className: "",
    html: `<div class="lev-marker-icon" style="background:${bg};font-size:14px;width:28px;height:28px;line-height:28px">${kat.ikon}</div>`,
    iconSize: [28,28], iconAnchor: [14,14], popupAnchor: [0,-16]
  })});
  marker.bindPopup(`<div class="lev-popup">
    <div class="lev-popup-top" style="border-left:4px solid ${bg}">
      <b>${_esc(enhed.navn)}</b>${uad?_uadBadge(enhed):""}
      <span class="lev-popup-sub" style="font-size:11px">${katTekst}</span>
    </div>
    ${enhed.kontakt ? `<div class="lev-popup-row">📞 <a href="tel:+45${_esc(enhed.kontakt.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(enhed.kontakt)}</a></div>` : ""}
    ${enhed.bemærkning ? `<div class="lev-popup-row"><em>${_esc(enhed.bemærkning)}</em></div>` : ""}
    ${enhed.vognnummer ? `<hr class="lev-hr"><div class="lev-popup-row">🚗 Vogn: <strong>${_esc(enhed.vognnummer)}</strong>${vognBtn}</div>` : ""}
    ${uadBtn ? `<div class="lev-popup-row" style="margin-top:4px">${uadBtn}</div>` : ""}
  </div>`, { maxWidth: 300, className: "lev-leaflet-popup" });
  marker.on("popupopen", function() {
    const el = this.getPopup().getElement(); if (!el) return;
    el.querySelectorAll(".lev-enhed-flyt-btn").forEach(b => b.addEventListener("click", () => _enhedFlytVognDialog(b.dataset.enhedid)));
    el.querySelectorAll(".lev-enhed-uad-btn").forEach(b => b.addEventListener("click", () => _enhedUADDialog(b.dataset.enhedid)));
  });
  _enhedKatLag[kat.id].addLayer(marker);
}

// Flyt vogn dialog — bytter vognnummer mellem to enheder
async function _enhedFlytVognDialog(fraEnhedId) {
  const fraEnhed = _enhedData.find(e => e.id === fraEnhedId);
  if (!fraEnhed || !fraEnhed.vognnummer) { alert("Ingen vogn at flytte."); return; }

  // Kildens kategorier (bagudkompatibilitet)
  const fraKats = fraEnhed.kategorier?.length ? fraEnhed.kategorier
    : (fraEnhed.kategori ? [fraEnhed.kategori] : []);

  // Destinationer: kun enheder der deler mindst én kategori med kilden
  const destinationer = _enhedData.filter(e => {
    if (e.id === fraEnhedId || e.type === "station") return false;
    const eKats = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
    return fraKats.some(k => eKats.includes(k));
  });

  if (!destinationer.length) { alert("Ingen andre enheder med samme kategori at flytte til."); return; }

  const valg = destinationer.map((e, i) =>
    `${i}: ${e.navn}${e.vognnummer ? " (vogn " + e.vognnummer + ")" : " (ingen vogn)"}`
  ).join("\n");

  const input = prompt(
    `Flyt vogn ${fraEnhed.vognnummer} fra:\n${fraEnhed.navn}\n\nTil enhed (indtast nummer):\n${valg}`
  );
  if (input === null || input.trim() === "") return;

  const idx = parseInt(input.trim());
  if (isNaN(idx) || idx < 0 || idx >= destinationer.length) {
    alert("Ugyldigt valg."); return;
  }

  const tilEnhed = destinationer[idx];
  const fraVogn  = fraEnhed.vognnummer;
  const tilVogn  = tilEnhed.vognnummer || "";

  const besked = tilVogn
    ? `Bytte vogn ${fraVogn} (${fraEnhed.navn}) ↔ vogn ${tilVogn} (${tilEnhed.navn})?`
    : `Flytte vogn ${fraVogn} fra ${fraEnhed.navn} til ${tilEnhed.navn} (som ikke har vogn)?`;
  if (!confirm(besked)) return;

  try {
    const r1 = await _levSpFetch("/enheder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fraEnhed, vognnummer: tilVogn })
    });
    if (!r1.ok) throw new Error("Gem kildeenhed fejlede");

    const r2 = await _levSpFetch("/enheder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...tilEnhed, vognnummer: fraVogn })
    });
    if (!r2.ok) throw new Error("Gem destinationsenhed fejlede");

    await _enhedLoad();
    _enhedRenderLag();
    alert(`✅ Vogn ${fraVogn} ${tilVogn ? "byttet med vogn " + tilVogn : "flyttet til " + tilEnhed.navn}`);
  } catch(e) {
    alert("Flyt fejlede: " + e.message);
  }
}

// UAD dialog
async function _enhedUADDialog(enhedId) {
  const enhed = _enhedData.find(e => e.id === enhedId);
  if (!enhed) return;

  // Allerede UAD → tilbyd at sætte klar
  if (_erUAD(enhed)) {
    if (!confirm(`Sæt "${enhed.navn}" klar igen?`)) return;
    try {
      const r = await _levSpFetch("/enheder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...enhed, uad: null })
      });
      if (!r.ok) throw new Error("Gem fejlede");
      await _enhedLoad(); _enhedRenderLag();
      if (document.getElementById("enhedListeContainer")) _enhedShowListe();
    } catch(e) { alert("Fejl: " + e.message); }
    return;
  }

  // Byg lille UAD-dialog
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center";

  const nu = new Date();
  const pad = n => String(n).padStart(2,"0");
  const lokalDato = `${nu.getFullYear()}-${pad(nu.getMonth()+1)}-${pad(nu.getDate())}`;
  const lokalTid  = `${pad(nu.getHours())}:${pad(nu.getMinutes())}`;

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
      <h3 style="margin:0 0 16px;font-size:15px">🔴 Sæt UAD: ${_esc(enhed.navn)}</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="display:flex;flex-direction:row;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="radio" name="uad-type" value="manuel" checked> Manuel — forbliver UAD indtil du sætter klar
        </label>
        <label style="display:flex;flex-direction:row;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="radio" name="uad-type" value="tidsrum"> Tidsrum
        </label>
        <div id="uad-tidsrum-felter" style="display:none;padding-left:24px;flex-direction:column;gap:6px">
          <label style="font-size:12px;font-weight:600;color:#5a6a7a">Fra
            <input type="datetime-local" id="uad-fra" value="${lokalDato}T${lokalTid}"
              style="width:100%;padding:6px;border:1px solid #cdd5df;border-radius:6px;font-size:12px;margin-top:2px">
          </label>
          <label style="font-size:12px;font-weight:600;color:#5a6a7a">Til
            <input type="datetime-local" id="uad-til"
              style="width:100%;padding:6px;border:1px solid #cdd5df;border-radius:6px;font-size:12px;margin-top:2px">
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button id="uad-gem" style="flex:1;padding:10px;background:#e74c3c;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🔴 Sæt UAD</button>
        <button id="uad-annuller" style="flex:1;padding:10px;background:#f5f7fa;border:1px solid #cdd5df;border-radius:8px;font-size:13px;cursor:pointer">Annuller</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelectorAll("input[name='uad-type']").forEach(r => {
    r.addEventListener("change", () => {
      const vis = overlay.querySelector("input[name='uad-type']:checked").value === "tidsrum";
      const felter = overlay.querySelector("#uad-tidsrum-felter");
      felter.style.display = vis ? "flex" : "none";
    });
  });

  overlay.querySelector("#uad-annuller").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#uad-gem").addEventListener("click", async () => {
    const type = overlay.querySelector("input[name='uad-type']:checked").value;
    let uad;
    if (type === "manuel") {
      uad = { type: "manuel" };
    } else {
      const fra = overlay.querySelector("#uad-fra").value;
      const til = overlay.querySelector("#uad-til").value;
      if (!fra || !til) { alert("Udfyld både fra og til."); return; }
      if (new Date(til) <= new Date(fra)) { alert("Til-tidspunkt skal være efter fra-tidspunkt."); return; }
      uad = { type: "tidsrum", fra, til };
    }
    try {
      const r = await _levSpFetch("/enheder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...enhed, uad })
      });
      if (!r.ok) throw new Error("Gem fejlede");
      overlay.remove();
      await _enhedLoad(); _enhedRenderLag();
      if (document.getElementById("enhedListeContainer")) _enhedShowListe();
    } catch(e) { alert("Fejl: " + e.message); }
  });
}


let _enhedKeepAlive = null;

async function _enhedOpenAdmin() {
  const ok = await _levEnsureLogin();
  if (!ok) return;
  await _enhedLoad();
  document.getElementById("levAdminPanel").classList.add("lev-panel-open");
  _enhedShowListe();

  // Keep-alive: ping worker hvert 60. sek for at holde sessionen aktiv
  // Bruger /auth/me — kræver ingen KV og returnerer blot session-status
  _enhedKeepAlive = setInterval(() => fetch(LEV_SP_WORKER + "/auth/me", { credentials: "include" }), 60_000);

  // Stop keep-alive når panelet lukkes - korrekt knap-ID er levPanelLuk
  const closeBtn = document.getElementById("levPanelLuk");
  if (closeBtn) {
    const _origClose = closeBtn.onclick;
    closeBtn.onclick = function() {
      clearInterval(_enhedKeepAlive);
      _enhedKeepAlive = null;
      if (_origClose) _origClose.apply(this, arguments);
    };
  }
}

function _enhedShowListe() {
  document.getElementById("levPanelTitle").textContent = "📍 Egne enheder";
  const body = document.getElementById("levPanelBody");

  // Byg én enhed-række
  function _enhedRaekke(e) {
    return `
      <div class="lev-list-row" style="padding-left:12px">
        <div class="lev-list-info">
          <span class="lev-list-navn">${_esc(e.navn)}</span>
          <span class="lev-list-meta">${e.adresse ? _esc(e.adresse) : ""}</span>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="lev-btn-secondary enhed-rediger-btn" data-id="${_esc(e.id)}" style="padding:4px 8px;font-size:12px">✏️</button>
          <button class="lev-btn-secondary enhed-slet-btn"   data-id="${_esc(e.id)}" style="padding:4px 8px;font-size:12px;color:#c0392b">🗑️</button>
        </div>
      </div>`;
  }

  // Render hele accordion-listen
  function _enhedRenderAccordion(q) {
    q = (q || "").toLowerCase().trim();
    const data = _enhedData || [];
    let html = "";

    // Kategori-sektioner
    EGNE_KATEGORIER.forEach(kat => {
      const enhederIKat = data.filter(e => {
        const kats = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
        if (!kats.includes(kat.id)) return false;
        if (!q) return true;
        return (e.navn || "").toLowerCase().includes(q)
          || (e.adresse || "").toLowerCase().includes(q);
      });

      const erAaben = _enhedAabne.has(kat.id) || q; // søgning åbner altid
      const antal   = enhederIKat.length;
      const pil     = erAaben ? "▾" : "▸";

      html += `
        <div class="enhed-kat-header" data-katid="${kat.id}"
          style="display:flex;align-items:center;justify-content:space-between;
                 padding:8px 12px;cursor:pointer;background:#f5f7fa;
                 border-bottom:1px solid #e0e6ef;user-select:none">
          <span style="font-weight:700;font-size:13px">${kat.ikon} ${kat.navn}</span>
          <span style="display:flex;align-items:center;gap:6px">
            ${antal > 0 ? `<span style="background:#2471a3;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px">${antal}</span>` : `<span style="color:#bbb;font-size:11px">ingen</span>`}
            <span style="font-size:11px;color:#888">${pil}</span>
          </span>
        </div>
        <div class="enhed-kat-body" data-katid="${kat.id}"
          style="display:${erAaben ? "block" : "none"};border-bottom:2px solid #e0e6ef">
          ${enhederIKat.length
            ? enhederIKat.map(_enhedRaekke).join("")
            : `<p class="lev-empty" style="margin:8px 12px;font-size:12px;color:#aaa">Ingen enheder i denne kategori</p>`}
        </div>`;
    });

    // Stationer-sektion
    const stationer = data.filter(e => {
      if (e.type !== "station") return false;
      if (!q) return true;
      // Søg også i tilknyttede enheder
      const tilknyttede = data.filter(x => x.stationId === e.id);
      return (e.navn || "").toLowerCase().includes(q) ||
        (e.adresse || "").toLowerCase().includes(q) ||
        tilknyttede.some(x =>
          (x.navn || "").toLowerCase().includes(q) ||
          (x.vognnummer || "").toLowerCase().includes(q)
        );
    });

    if (stationer.length > 0 || !q) {
      const erAaben = _enhedAabne.has("__stationer__") || q;
      const pil     = erAaben ? "▾" : "▸";
      html += `
        <div class="enhed-kat-header" data-katid="__stationer__"
          style="display:flex;align-items:center;justify-content:space-between;
                 padding:8px 12px;cursor:pointer;background:#f0f4f8;
                 border-bottom:1px solid #e0e6ef;user-select:none;margin-top:4px">
          <span style="font-weight:700;font-size:13px">🏠 Stationer</span>
          <span style="display:flex;align-items:center;gap:6px">
            ${stationer.length > 0 ? `<span style="background:#27ae60;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px">${stationer.length}</span>` : `<span style="color:#bbb;font-size:11px">ingen</span>`}
            <span style="font-size:11px;color:#888">${pil}</span>
          </span>
        </div>
        <div class="enhed-kat-body" data-katid="__stationer__"
          style="display:${erAaben ? "block" : "none"};border-bottom:2px solid #e0e6ef">
          ${stationer.length
            ? stationer.map(st => {
                const tilknyttede = data.filter(x => x.stationId === st.id);
                const stAaben     = _enhedAabne.has("__st__" + st.id) || q;
                const stPil       = stAaben ? "▾" : "▸";

                // Grupper tilknyttede enheder per kategori
                const katGrupper = EGNE_KATEGORIER.map(k => {
                  const enhederIKat = tilknyttede.filter(x => {
                    const xKats = x.kategorier?.length ? x.kategorier : (x.kategori ? [x.kategori] : []);
                    return xKats.includes(k.id);
                  });
                  if (!enhederIKat.length) return "";
                  return `
                    <div style="margin-bottom:4px">
                      <div style="font-size:11px;font-weight:700;color:#5a6a7a;padding:3px 0 2px">${k.ikon} ${k.navn}</div>
                      ${enhederIKat.map(x => `
                        <div class="lev-list-row" style="padding-left:8px;border-left:2px solid #e0e6ef">
                          <div class="lev-list-info">
                            <span class="lev-list-navn" style="font-size:13px">${_esc(x.navn)}</span>
                            ${x.vognnummer ? `<span class="lev-list-meta">🚗 ${_esc(x.vognnummer)}</span>` : ""}
                          </div>
                          <div style="display:flex;gap:6px;flex-shrink:0">
                            <button class="lev-btn-secondary enhed-rediger-btn" data-id="${_esc(x.id)}" style="padding:4px 8px;font-size:12px">✏️</button>
                            <button class="lev-btn-secondary enhed-slet-btn"   data-id="${_esc(x.id)}" style="padding:4px 8px;font-size:12px;color:#c0392b">🗑️</button>
                          </div>
                        </div>`).join("")}
                    </div>`;
                }).join("");

                return `
                  <div style="border-bottom:1px solid #e8eef5">
                    <div class="enhed-kat-header" data-katid="__st__${_esc(st.id)}"
                      style="display:flex;align-items:center;justify-content:space-between;
                             padding:8px 12px;cursor:pointer;background:#f8fafc;user-select:none">
                      <div class="lev-list-info" style="flex:1;min-width:0">
                        <span class="lev-list-navn">🏠 ${_esc(st.navn)}</span>
                        ${st.adresse ? `<span class="lev-list-meta">${_esc(st.adresse)}</span>` : ""}
                      </div>
                      <span style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                        <button class="lev-btn-secondary enhed-rediger-btn" data-id="${_esc(st.id)}" style="padding:3px 7px;font-size:11px">✏️</button>
                        <button class="lev-btn-secondary enhed-slet-btn"   data-id="${_esc(st.id)}" style="padding:3px 7px;font-size:11px;color:#c0392b">🗑️</button>
                        <span style="font-size:11px;color:#888">${stPil}</span>
                      </span>
                    </div>
                    <div class="enhed-kat-body" data-katid="__st__${_esc(st.id)}"
                      style="display:${stAaben ? "block" : "none"};padding:8px 12px;background:#fff">
                      ${tilknyttede.length
                        ? katGrupper || `<p style="font-size:12px;color:#aaa;margin:4px 0">Ingen enheder tilknyttet</p>`
                        : `<p style="font-size:12px;color:#aaa;margin:4px 0">Ingen enheder tilknyttet endnu</p>`}
                    </div>
                  </div>`;
              }).join("")
            : `<p class="lev-empty" style="margin:8px 12px;font-size:12px;color:#aaa">Ingen stationer oprettet</p>`}
        </div>`;
    }

    // ── UAD-sektion — altid nederst ─────────────────────────────
    const uadEnheder = data.filter(e => {
      if (e.type === "station") return false;
      if (!_erUAD(e)) return false;
      if (!q) return true;
      return (e.navn || "").toLowerCase().includes(q) ||
             (e.adresse || "").toLowerCase().includes(q);
    });

    if (uadEnheder.length > 0 || !q) {
      const erAaben = _enhedAabne.has("__uad__") || q;
      const pil     = erAaben ? "▾" : "▸";
      html += `
        <div class="enhed-kat-header" data-katid="__uad__"
          style="display:flex;align-items:center;justify-content:space-between;
                 padding:8px 12px;cursor:pointer;background:#fdecea;
                 border-bottom:1px solid #e0e6ef;user-select:none;margin-top:4px">
          <span style="font-weight:700;font-size:13px;color:#c0392b">🔴 Ude af drift</span>
          <span style="display:flex;align-items:center;gap:6px">
            ${uadEnheder.length > 0
              ? `<span style="background:#e74c3c;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px">${uadEnheder.length}</span>`
              : `<span style="color:#bbb;font-size:11px">ingen</span>`}
            <span style="font-size:11px;color:#888">${pil}</span>
          </span>
        </div>
        <div class="enhed-kat-body" data-katid="__uad__"
          style="display:${erAaben?"block":"none"};border-bottom:2px solid #e0e6ef">
          ${uadEnheder.length
            ? uadEnheder.map(e => {
                const kats   = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
                const fKat   = EGNE_KATEGORIER.find(k => kats.includes(k.id));
                const stNavn = e.stationId ? (data.find(s => s.id === e.stationId)?.navn || "") : "";
                return `
                  <div class="lev-list-row" style="padding-left:12px;border-left:3px solid #e74c3c">
                    <div class="lev-list-info">
                      <span class="lev-list-navn">${_esc(e.navn)} ${_uadBadge(e)}</span>
                      <span class="lev-list-meta">${fKat?fKat.ikon+" "+fKat.navn:""}${stNavn?" · 🏠 "+_esc(stNavn):""}</span>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0">
                      <button class="lev-enhed-uad-btn lev-btn-secondary" data-id="${_esc(e.id)}" style="padding:4px 8px;font-size:12px;color:#27ae60">✅ Klar</button>
                      <button class="lev-btn-secondary enhed-rediger-btn" data-id="${_esc(e.id)}" style="padding:4px 8px;font-size:12px">✏️</button>
                    </div>
                  </div>`;
              }).join("")
            : `<p class="lev-empty" style="margin:8px 12px;font-size:12px;color:#aaa">Ingen enheder ude af drift</p>`}
        </div>`;
    }

    document.getElementById("enhedListeContainer").innerHTML = html;

    // Accordion toggle
    document.getElementById("enhedListeContainer").querySelectorAll(".enhed-kat-header").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const kid  = hdr.dataset.katid;
        const body = document.querySelector(`.enhed-kat-body[data-katid="${kid}"]`);
        const pil  = hdr.querySelector("span:last-child span:last-child");
        const aaben = body.style.display !== "none";
        body.style.display = aaben ? "none" : "block";
        if (pil) pil.textContent = aaben ? "▸" : "▾";
        if (aaben) _enhedAabne.delete(kid); else _enhedAabne.add(kid);
      });
    });

    // Knyt rediger/slet-handlers
    document.getElementById("enhedListeContainer").querySelectorAll(".enhed-rediger-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const enhed = _enhedData.find(e => e.id === btn.dataset.id);
        if (enhed) _enhedShowForm(enhed);
      });
    });
    document.getElementById("enhedListeContainer").querySelectorAll(".enhed-slet-btn").forEach(btn => {
      btn.addEventListener("click", () => _enhedSlet(btn.dataset.id));
    });

    // UAD-knapper i accordion (både "🔴 UAD" og "✅ Klar"-knapper)
    document.getElementById("enhedListeContainer").querySelectorAll(".lev-enhed-uad-btn").forEach(btn => {
      btn.addEventListener("click", () => _enhedUADDialog(btn.dataset.id));
    });
  }

  body.innerHTML = `
    <div class="lev-list-toolbar" style="flex-wrap:wrap;gap:6px">
      <button id="enhedNyBtn" class="lev-btn-primary">+ Ny enhed</button>
      <button id="enhedNyStationBtn" class="lev-btn-secondary">+ Ny station</button>
      <button id="enhedRefreshBtn" class="lev-btn-secondary">↻ Opdater</button>
      <input id="enhedSoeg" type="search" placeholder="Søg navn, adresse, vogn…"
        style="flex:1;min-width:80px;padding:8px;font-size:13px;border:1px solid #ccc;border-radius:7px">
    </div>
    <div id="enhedListeContainer" class="lev-list-container" style="padding:0"></div>`;

  _enhedRenderAccordion("");

  document.getElementById("enhedSoeg").addEventListener("input", function() {
    _enhedRenderAccordion(this.value);
  });
  document.getElementById("enhedNyBtn").addEventListener("click", () => _enhedShowForm(null, "enhed"));
  document.getElementById("enhedNyStationBtn").addEventListener("click", () => _enhedShowForm(null, "station"));
  document.getElementById("enhedRefreshBtn").addEventListener("click", async function() {
    const btn = this;
    btn.disabled = true;
    btn.textContent = "⏳ Opdaterer...";
    _enhedLoaded = false;
    await _enhedLoad();
    btn.textContent = "✅ Opdateret!";
    setTimeout(() => { _enhedShowListe(); }, 800);
  });
}

function _enhedShowForm(enhed, nyType) {
  // Ved redigering: bevar eksisterende type. Ved ny: brug nyType ("enhed" eller "station")
  const erStation = enhed ? (enhed.type === "station") : (nyType === "station");
  const titel = enhed
    ? (erStation ? "✏️ Rediger station" : "✏️ Rediger enhed")
    : (erStation ? "➕ Ny station"      : "➕ Ny enhed");
  document.getElementById("levPanelTitle").textContent = titel;
  const body = document.getElementById("levPanelBody");

  // Stationer til dropdown (til enhedsformularen)
  const alleStationer = (_enhedData || []).filter(e => e.type === "station");
  const valgtStation  = enhed?.stationId || "";

  // Bagudkompatibilitet: kategori kan være array eller enkelt streng
  const valgteKat = enhed?.kategorier?.length ? enhed.kategorier
    : (enhed?.kategori ? [enhed.kategori] : []);

  // ── STATIONSFORMULAR ──────────────────────────────────────────────
  if (erStation) {
    body.innerHTML = `
      <div class="lev-form">
        <button class="lev-tilbage-btn" id="efTilbage" style="margin-bottom:12px">← Tilbage til liste</button>
        <input type="hidden" id="ef-type" value="station">

        <fieldset class="lev-fs">
          <legend>📋 Basisoplysninger</legend>
          <label>Stationsnavn
            <input id="ef-navn" type="text" value="${_esc(enhed?.navn || "")}"
              placeholder="fx 423 Falck Fredericia">
          </label>
        </fieldset>

        <fieldset class="lev-fs">
          <legend>📍 Adresse</legend>
          <label>Søg adresse
            <input id="ef-adr-sok" type="text" value="${_esc(enhed?.adresse || "")}"
              placeholder="Skriv adresse og vælg fra listen..." autocomplete="off">
            <div id="ef-adr-liste" style="border:1px solid #ddd;border-radius:4px;background:#fff;max-height:140px;overflow-y:auto;display:none;font-size:12px"></div>
          </label>
          <input id="ef-lat" type="hidden" value="${enhed?.lat ?? ""}">
          <input id="ef-lon" type="hidden" value="${enhed?.lon ?? ""}">
          <div class="lev-row" style="margin-top:6px;gap:8px">
            <label class="lev-label-coord">Lat. <input id="ef-lat-vis" type="text" value="${enhed?.lat ?? ""}" placeholder="56.xxxx" style="font-size:12px"></label>
            <label class="lev-label-coord">Lon. <input id="ef-lon-vis" type="text" value="${enhed?.lon ?? ""}" placeholder="10.xxxx" style="font-size:12px"></label>
          </div>
        </fieldset>

        <fieldset class="lev-fs">
          <legend>📞 Kontakt</legend>
          <label>Telefon
            <input id="ef-kontakt" type="text" value="${_esc(enhed?.kontakt || "")}" placeholder="fx 76 26 60 00">
          </label>
          <label>Bemærkning
            <input id="ef-bemaerk" type="text" value="${_esc(enhed?.bemærkning || "")}" placeholder="valgfri">
          </label>
        </fieldset>

        <div class="lev-form-footer">
          <button id="ef-gem" class="lev-btn-primary">💾 Gem</button>
          ${enhed ? `<button id="ef-slet" class="lev-btn-danger">🗑️ Slet</button>` : ""}
        </div>
        <div id="ef-status" style="font-size:12px;color:#27ae60;min-height:18px;padding:4px 0"></div>
      </div>`;

  // ── ENHEDSFORMULAR ────────────────────────────────────────────────
  } else {
    const katCheckboxes = EGNE_KATEGORIER.map(k =>
      `<label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-weight:400;cursor:pointer">
        <input type="checkbox" name="ef-kat" value="${k.id}" ${valgteKat.includes(k.id) ? "checked" : ""}>
        ${k.ikon} ${k.navn}
      </label>`
    ).join("");

    const stationOptions = alleStationer.length
      ? `<option value="">— Ingen station —</option>` +
        alleStationer.map(s =>
          `<option value="${_esc(s.id)}" ${valgtStation === s.id ? "selected" : ""}>${_esc(s.navn)}</option>`
        ).join("")
      : `<option value="">— Ingen stationer oprettet endnu —</option>`;

    body.innerHTML = `
      <div class="lev-form">
        <button class="lev-tilbage-btn" id="efTilbage" style="margin-bottom:12px">← Tilbage til liste</button>
        <input type="hidden" id="ef-type" value="enhed">

        <fieldset class="lev-fs">
          <legend>📋 Basisoplysninger</legend>
          <label>Navn
            <input id="ef-navn" type="text" value="${_esc(enhed?.navn || "")}"
              placeholder="fx 8694 TMA Holbæk">
          </label>
          <label>Vognnummer <span style="font-weight:400;color:#aaa;font-size:11px">(valgfrit)</span>
            <input id="ef-vognr" type="text" value="${_esc(enhed?.vognnummer || "")}"
              placeholder="fx 8694">
          </label>
          <div class="lev-form-label">Kategorier</div>
          <div style="display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px">
            ${katCheckboxes}
          </div>
        </fieldset>

        <fieldset class="lev-fs">
          <legend>🏠 Tilknyttet station <span style="font-weight:400;color:#aaa;font-size:11px">(valgfrit)</span></legend>
          <label>Station
            <select id="ef-station" style="padding:8px;border:1px solid #cdd5df;border-radius:6px;font-size:13px;width:100%">
              ${stationOptions}
            </select>
          </label>
          <div id="ef-station-hint" style="font-size:11px;color:#8a9aaa;margin-top:4px">
            ${valgtStation ? "Adresse arvet fra station — kan overskrives nedenfor" : "Vælg en station for at arve dens adresse automatisk"}
          </div>
        </fieldset>

        <fieldset class="lev-fs">
          <legend>📍 Adresse</legend>
          <label>Søg adresse
            <input id="ef-adr-sok" type="text" value="${_esc(enhed?.adresse || "")}"
              placeholder="Skriv adresse og vælg fra listen..." autocomplete="off">
            <div id="ef-adr-liste" style="border:1px solid #ddd;border-radius:4px;background:#fff;max-height:140px;overflow-y:auto;display:none;font-size:12px"></div>
          </label>
          <input id="ef-lat" type="hidden" value="${enhed?.lat ?? ""}">
          <input id="ef-lon" type="hidden" value="${enhed?.lon ?? ""}">
          <div class="lev-row" style="margin-top:6px;gap:8px">
            <label class="lev-label-coord">Lat. <input id="ef-lat-vis" type="text" value="${enhed?.lat ?? ""}" placeholder="56.xxxx" style="font-size:12px"></label>
            <label class="lev-label-coord">Lon. <input id="ef-lon-vis" type="text" value="${enhed?.lon ?? ""}" placeholder="10.xxxx" style="font-size:12px"></label>
          </div>
        </fieldset>

        <fieldset class="lev-fs">
          <legend>📞 Kontakt</legend>
          <label>Telefon
            <input id="ef-kontakt" type="text" value="${_esc(enhed?.kontakt || "")}" placeholder="fx 76 26 60 00">
          </label>
          <label>Bemærkning
            <input id="ef-bemaerk" type="text" value="${_esc(enhed?.bemærkning || "")}" placeholder="valgfri">
          </label>
        </fieldset>

        <div class="lev-form-footer">
          <button id="ef-gem" class="lev-btn-primary">💾 Gem</button>
          ${enhed ? `<button id="ef-slet" class="lev-btn-danger">🗑️ Slet</button>` : ""}
        </div>
        <div id="ef-status" style="font-size:12px;color:#27ae60;min-height:18px;padding:4px 0"></div>
      </div>`;

    // Station-dropdown: arv adresse automatisk når station vælges
    document.getElementById("ef-station").addEventListener("change", function() {
      const sid = this.value;
      const hint = document.getElementById("ef-station-hint");
      if (sid) {
        const st = alleStationer.find(s => s.id === sid);
        if (st && st.adresse) {
          document.getElementById("ef-adr-sok").value = st.adresse;
          document.getElementById("ef-lat").value     = st.lat ?? "";
          document.getElementById("ef-lon").value     = st.lon ?? "";
          document.getElementById("ef-lat-vis").value = st.lat != null ? parseFloat(st.lat).toFixed(6) : "";
          document.getElementById("ef-lon-vis").value = st.lon != null ? parseFloat(st.lon).toFixed(6) : "";
          hint.textContent = "Adresse arvet fra station — kan overskrives nedenfor";
        }
      } else {
        hint.textContent = "Vælg en station for at arve dens adresse automatisk";
      }
    });
  }

  // ── FÆLLES: DAWA adressesøgning ───────────────────────────────────
  const adrInput = document.getElementById("ef-adr-sok");
  const adrListe = document.getElementById("ef-adr-liste");
  const latVis   = document.getElementById("ef-lat-vis");
  const lonVis   = document.getElementById("ef-lon-vis");
  const latHid   = document.getElementById("ef-lat");
  const lonHid   = document.getElementById("ef-lon");

  latVis.addEventListener("input", () => latHid.value = latVis.value);
  lonVis.addEventListener("input", () => lonHid.value = lonVis.value);

  let adrTimer;
  adrInput.addEventListener("input", () => {
    clearTimeout(adrTimer);
    const q = adrInput.value.trim();
    if (q.length < 3) { adrListe.style.display = "none"; return; }
    adrTimer = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.dataforsyningen.dk/adresser/autocomplete?q=${encodeURIComponent(q)}&per_side=6&struktur=mini`);
        const items = await r.json();
        if (!items.length) { adrListe.style.display = "none"; return; }
        adrListe.innerHTML = items.map(it =>
          `<div class="ef-adr-item" data-tekst="${_esc(it.tekst)}"
            data-lat="${it.adresse?.y ?? ""}" data-lon="${it.adresse?.x ?? ""}"
            style="padding:6px 8px;cursor:pointer;border-bottom:1px solid #eee">${_esc(it.tekst)}</div>`
        ).join("");
        adrListe.style.display = "block";
        adrListe.querySelectorAll(".ef-adr-item").forEach(div => {
          div.addEventListener("mouseenter", () => div.style.background = "#f0f0f0");
          div.addEventListener("mouseleave", () => div.style.background = "");
          div.addEventListener("click", () => {
            adrInput.value  = div.dataset.tekst;
            latHid.value    = div.dataset.lat;
            lonHid.value    = div.dataset.lon;
            latVis.value    = parseFloat(div.dataset.lat).toFixed(6);
            lonVis.value    = parseFloat(div.dataset.lon).toFixed(6);
            adrListe.style.display = "none";
          });
        });
      } catch(e) { adrListe.style.display = "none"; }
    }, 300);
  });

  document.getElementById("efTilbage").addEventListener("click", _enhedShowListe);
  document.getElementById("ef-gem").addEventListener("click", () => _enhedGem(enhed?.id || null));
  document.getElementById("ef-slet")?.addEventListener("click", () => _enhedSlet(enhed.id, erStation));
}

// Tilføj en vogn-række i station-formularen
function _enhedAppendVognRow(container, v = {}) {
  const div = document.createElement("div");
  div.className = "lev-vogn-row";
  div.dataset.id = v.id || "evogn-" + Date.now();
  div.innerHTML = `
    <div class="lev-row lev-row-header">
      <label class="lev-label-grow" style="font-weight:700;font-size:13px">
        Vognnummer
        <input type="text" class="ev-nummer" value="${_esc(v.nummer || v.vognnummer || "")}"
          placeholder="fx 7088" style="font-weight:700">
      </label>
      <button type="button" class="lev-slet-row-btn">✕</button>
    </div>
    <label>Kort beskrivelse
      <input type="text" class="ev-besk" value="${_esc(v.beskrivelse || "")}"
        placeholder="fx Morsvogn">
    </label>
    <label>Telefon (vogn/redder)
      <input type="tel" class="ev-tlf" value="${_esc(v.telefon || "")}"
        placeholder="fx 70 70 08 00">
    </label>
    <label>Detaljer / lang beskrivelse
      <textarea class="ev-detaljer lev-textarea" rows="2"
        placeholder="fx 1x XL ST-Vogn, Timeredder tilkald...">${_esc(v.detaljer || "")}</textarea>
    </label>`;
  container.appendChild(div);
  div.querySelector(".lev-slet-row-btn").addEventListener("click", () => div.remove());
}

async function _enhedGem(existingId) {
  const type    = document.getElementById("ef-type")?.value || "enhed";
  const navn    = document.getElementById("ef-navn").value.trim();
  const adresse = document.getElementById("ef-adr-sok").value.trim();
  const lat     = parseFloat(document.getElementById("ef-lat").value) || null;
  const lon     = parseFloat(document.getElementById("ef-lon").value) || null;
  const kontakt = document.getElementById("ef-kontakt").value.trim();
  const bemærk  = document.getElementById("ef-bemaerk").value.trim();
  const status  = document.getElementById("ef-status");

  if (!navn) { status.style.color = "#c0392b"; status.textContent = "Navn er påkrævet."; return; }

  // Enhedsspecifikke felter
  let kategori   = "";
  let kategorier = [];
  let vognnummer = "";
  let stationId  = "";
  if (type === "enhed") {
    const katEls = Array.from(document.querySelectorAll('input[name="ef-kat"]:checked'));
    kategorier   = katEls.map(el => el.value);
    kategori     = kategorier[0] || "";
    vognnummer   = document.getElementById("ef-vognr")?.value.trim() || "";
    stationId    = document.getElementById("ef-station")?.value || "";
    if (!kategorier.length) { status.style.color = "#c0392b"; status.textContent = "Vælg mindst én kategori."; return; }
  }

  // Duplikat-advarsel
  if (!existingId && _enhedData?.length) {
    const match = _enhedData.filter(e => (e.navn || "").toLowerCase() === navn.toLowerCase());
    if (match.length) {
      if (!confirm(`"${navn}" findes allerede.\n\nVil du oprette alligevel?`)) {
        status.style.color = "#e67e22"; status.textContent = "Annulleret."; return;
      }
    }
  }

  const gemBtn = document.getElementById("ef-gem");
  gemBtn.disabled = true; gemBtn.textContent = "⏳ Gemmer...";

  const payload = type === "station"
    ? { id: existingId, type, navn, adresse, lat, lon, kontakt, bemærkning: bemærk }
    : { id: existingId, type, navn, kategorier, kategori, vognnummer, stationId: stationId || null,
        adresse, lat, lon, kontakt, bemærkning: bemærk };

  try {
    const resp = await _levSpFetch("/enheder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error("Gem fejlede");
    status.style.color = "#27ae60"; status.textContent = "✅ Gemt!";
    await _enhedLoad();
    setTimeout(_enhedShowListe, 800);
  } catch(e) {
    status.style.color = "#c0392b"; status.textContent = "Fejl: " + e.message;
    gemBtn.disabled = false; gemBtn.textContent = "💾 Gem";
  }
}

async function _enhedSlet(id, erStation) {
  const tekst = erStation
    ? "Slet denne station? Enheder tilknyttet stationen mister stationstilknytningen, men slettes ikke."
    : "Slet denne enhed?";
  if (!confirm(tekst)) return;
  try {
    const resp = await _levSpFetch(`/enheder/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error("Slet fejlede");
    await _enhedLoad();
    _enhedShowListe();
  } catch(e) {
    alert("Fejl ved sletning: " + e.message);
  }
}

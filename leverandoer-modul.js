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
  { id: "tma",        navn: "TMA og tavlevognstrailere",   ikon: "🚧" },
  { id: "dyr",        navn: "Dyreredning",                 ikon: "🐾" },
  { id: "drift_hjem", navn: "Drift fra hjem",              ikon: "🏠" },
  { id: "mors",       navn: "Mors biler",                  ikon: "🚌" },
  { id: "liggende",   navn: "Liggende / forflytninger",    ikon: "🛏️" },
  { id: "vejrenser",  navn: "Vejrenser",                   ikon: "🧹" },
  { id: "skytter",    navn: "Skytter",                     ikon: "🎯" },
];

// ── LEAFLET LAG ──────────────────────────────────────────────────
const _levKatLag = {};
LEV_KATEGORIER.forEach(k => { _levKatLag[k.id] = L.layerGroup(); });
var redigerLeverandoerLayer = L.layerGroup();
var levTilgaengeligLayer    = L.layerGroup();

const _enhedKatLag = {};
EGNE_KATEGORIER.forEach(k => { _enhedKatLag[k.id] = L.layerGroup(); });
var redigerEnhederLayer = L.layerGroup();

// ── STATE ────────────────────────────────────────────────────────
let _levData          = [];
let _levPostnrMap     = {};
let _levHighlights    = [];
let _levLoginProgress = false;
let _levLoaded        = false;
let _levTilgInterval  = null;

let _enhedData   = [];
let _enhedLoaded = false;

let _levLayerCtrl = null; // Reference til Leaflet layer control (bruges til at afmarker checkboxes)

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
      <div class="lev-disp-section">${enhedRows}</div>
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
    cb.addEventListener('change', function () {
      const lag = cb.dataset.lag;
      let layer = null;
      if (lag === 'tilgaengelig')         layer = levTilgaengeligLayer;
      else if (lag.startsWith('lev-'))    layer = _levKatLag[lag.slice(4)];
      else if (lag.startsWith('enhed-'))  layer = _enhedKatLag[lag.slice(6)];
      if (!layer) return;
      if (cb.checked) map.addLayer(layer);
      else            map.removeLayer(layer);
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

  map.on("overlayadd", async function (e) {
    if (e.layer === levTilgaengeligLayer) {
      await _levTilgLoad();
      _levTilgInterval = setInterval(_levTilgLoad, 180_000); // 3 min - sparer KV-kald (gratis plan: 100k/dag)
      return;
    }
    const erLevKat = LEV_KATEGORIER.some(k => _levKatLag[k.id] === e.layer);
    if (erLevKat && !_levLoaded) await _levLoad();

    const erEnhedKat = EGNE_KATEGORIER.some(k => _enhedKatLag[k.id] === e.layer);
    if (erEnhedKat && !_enhedLoaded) {
      const ok = await _levEnsureDisponering();
      if (ok) {
        await _enhedLoad();
      } else {
        // Login afbrudt/fejlet — afmarker laget igen
        map.removeLayer(e.layer);
        _levUncheckLayer(e.layer);
      }
    }
  });

  map.on("overlayremove", function (e) {
    if (e.layer === levTilgaengeligLayer) {
      clearInterval(_levTilgInterval);
      _levTilgInterval = null;
      levTilgaengeligLayer.clearLayers();
    }
  });
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
    if (me.ok) return true; // enhver gyldig session

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
    return true;
  } finally {
    _levLoginProgress = false;
  }
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
function _levBuildMarkers() {
  LEV_KATEGORIER.forEach(k => _levKatLag[k.id].clearLayers());

  (_levData || []).filter(l => l.aktiv !== false).forEach(lev => {
    // Støt både nyt (kategorier[]) og gammelt (kategori) format
    const kategorier = (lev.kategorier?.length ? lev.kategorier : (lev.kategori ? [lev.kategori] : []));
    if (!kategorier.length) return;

    (lev.arbejdsAdresser || []).forEach(adr => {
      if (!adr.lat || !adr.lon) return;

      // Én markør per kategori-lag
      kategorier.forEach(katId => {
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
            // Vogn expand/collapse
            el.querySelectorAll(".lev-popup-vogn-hdr-click").forEach(hdr => {
              hdr.addEventListener("click", () => {
                const detail = hdr.nextElementSibling;
                if (!detail) return;
                const open = detail.style.display !== "none";
                detail.style.display = open ? "none" : "block";
                hdr.classList.toggle("lev-popup-vogn-hdr-open", !open);
              });
            });
            // Lightbox ved klik på vogn-billede
            el.querySelectorAll(".lev-popup-vogn-img-full").forEach(img => {
              img.addEventListener("click", e => { e.stopPropagation(); _levLightbox(img.src); });
            });
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
  const tlf = lev.kontakt?.telefonnumre || [];
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

  const tlf = lev.kontakt?.telefonnumre || [];
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

  const lister = (_levData || []).map(lev => {
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
  }).join("") || `<p class="lev-empty">Ingen leverandører endnu.<br>Klik "+ Ny leverandør" for at starte.</p>`;

  body.innerHTML = `
    <div class="lev-list-toolbar">
      <button id="levNyBtn"      class="lev-btn-primary">+ Ny leverandør</button>
      <button id="levRefreshBtn" class="lev-btn-secondary">↻ Opdater</button>
    </div>
    <div class="lev-list-container">${lister}</div>`;

  document.getElementById("levNyBtn").addEventListener("click", () => _levShowForm(null));
  document.getElementById("levRefreshBtn").addEventListener("click", async () => {
    const btn = document.getElementById("levRefreshBtn");
    btn.textContent = "⏳ Opdaterer...";
    btn.disabled = true;
    _levLoaded = false;
    await _levLoad();
    _levShowListe();
    // _levShowListe() genbygger DOM — hent ny reference til knappen
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
  body.querySelectorAll(".lev-list-row").forEach(row =>
    row.addEventListener("click", () => _levShowForm(row.dataset.id))
  );
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
      <button class="lev-tilbage-btn" id="levTilbage">← Tilbage til liste</button>

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
    </label>`;
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
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
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
                               .split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d{4}$/.test(s))
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

  // Find aktuel markør-position (fra adressesøgning)
  const markerPos = (typeof currentMarker !== "undefined" && currentMarker && currentMarker.getLatLng)
    ? currentMarker.getLatLng() : null;

  // Beregn afstand + sorter nærmest-først hvis markør findes
  let data = (_enhedData || []).map(enhed => {
    const afstand = (markerPos && enhed.lat != null && enhed.lon != null)
      ? (map.distance(markerPos, L.latLng(enhed.lat, enhed.lon)) / 1000)
      : null;
    return { ...enhed, _afstand: afstand };
  });
  if (markerPos) data.sort((a, b) => (a._afstand ?? Infinity) - (b._afstand ?? Infinity));

  data.forEach(enhed => {
    if (enhed.lat == null || enhed.lon == null) return;
    // Bagudkompatibelt: støt både kategorier[] og gammel kategori
    const kats = enhed.kategorier?.length ? enhed.kategorier
      : (enhed.kategori ? [enhed.kategori] : []);
    if (!kats.length) return;
    const katNavne = kats.map(id => {
      const k = EGNE_KATEGORIER.find(k => k.id === id);
      return k ? k.ikon + " " + k.navn : id;
    }).join("<br>");
    const afstandTekst = enhed._afstand != null
      ? `📍 <strong>${enhed._afstand.toFixed(1)} km</strong> fra søgt adresse<br>` : "";
    const marker = L.circleMarker([enhed.lat, enhed.lon], {
      radius: 8, fillColor: "#2471a3", color: "#fff", weight: 2, fillOpacity: 0.92
    });
    marker.bindPopup(`
      <strong>${_esc(enhed.navn)}</strong><br>
      ${katNavne}<br>
      ${afstandTekst}
      ${enhed.adresse    ? _esc(enhed.adresse)   + "<br>" : ""}
      ${enhed.kontakt    ? `📞 <a href="tel:${_esc('+45' + enhed.kontakt.replace(/\s/g,'').replace(/^\+45/,''))}">${_esc(enhed.kontakt)}</a><br>` : ""}
      ${enhed.bemærkning ? "<em>" + _esc(enhed.bemærkning) + "</em>" : ""}
    `);
    // Tilføj markør til hvert relevant lag
    kats.forEach(katId => {
      if (_enhedKatLag[katId]) _enhedKatLag[katId].addLayer(marker);
    });
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

  // Byg en række for én enhed
  function _enhedRaekke(e) {
    const kats = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
    const katTekst = kats.map(id => {
      const k = EGNE_KATEGORIER.find(k => k.id === id);
      return k ? k.ikon + " " + k.navn : id;
    }).join(" · ");
    return `
      <div class="lev-list-row">
        <div class="lev-list-info">
          <span class="lev-list-navn">${_esc(e.navn)}</span>
          <span class="lev-list-meta">${katTekst}${e.adresse ? " · " + _esc(e.adresse) : ""}</span>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="lev-btn-secondary enhed-rediger-btn" data-id="${_esc(e.id)}" style="padding:4px 8px;font-size:12px">✏️</button>
          <button class="lev-btn-secondary enhed-slet-btn"   data-id="${_esc(e.id)}" style="padding:4px 8px;font-size:12px;color:#c0392b">🗑️</button>
        </div>
      </div>`;
  }

  // Filtrer og render listen
  function _enhedRenderFiltreret(soegeTekst) {
    const q = (soegeTekst || "").toLowerCase().trim();
    const data = _enhedData || [];
    const filtreret = q === "" ? data : data.filter(e => {
      const kats = e.kategorier?.length ? e.kategorier : (e.kategori ? [e.kategori] : []);
      const katTekst = kats.map(id => {
        const k = EGNE_KATEGORIER.find(k => k.id === id);
        return k ? (k.navn + " " + k.ikon).toLowerCase() : id;
      }).join(" ");
      return (e.navn || "").toLowerCase().includes(q)
        || (e.adresse || "").toLowerCase().includes(q)
        || katTekst.includes(q);
    });
    const rækker = filtreret.map(_enhedRaekke).join("")
      || `<p class="lev-empty">${q ? "Ingen enheder matcher søgningen." : "Ingen egne enheder endnu. Klik \"+ Ny enhed\"."}</p>`;
    document.getElementById("enhedListeContainer").innerHTML = rækker;
    // Genknyt klik-handlers
    body.querySelectorAll(".enhed-rediger-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const enhed = _enhedData.find(e => e.id === btn.dataset.id);
        if (enhed) _enhedShowForm(enhed);
      });
    });
    body.querySelectorAll(".enhed-slet-btn").forEach(btn => {
      btn.addEventListener("click", () => _enhedSlet(btn.dataset.id));
    });
  }

  body.innerHTML = `
    <div class="lev-list-toolbar">
      <button id="enhedNyBtn" class="lev-btn-primary">+ Ny enhed</button>
      <button id="enhedRefreshBtn" class="lev-btn-secondary">↻ Opdater</button>
      <input id="enhedSoeg" type="search" placeholder="Søg navn, adresse, kategori…"
        style="flex:1;min-width:0;padding:8px 8px;font-size:13px;border:1px solid #ccc;border-radius:7px">
    </div>
    <div id="enhedListeContainer" class="lev-list-container"></div>`;

  // Initial render (ingen filter)
  _enhedRenderFiltreret("");

  document.getElementById("enhedNyBtn").addEventListener("click", () => _enhedShowForm(null));
  document.getElementById("enhedRefreshBtn").addEventListener("click", async function() {
    const btn = this;
    btn.disabled = true;
    btn.textContent = "⏳ Opdaterer...";
    _enhedLoaded = false;
    await _enhedLoad();
    btn.textContent = "✅ Opdateret!";
    setTimeout(() => { _enhedShowListe(); }, 800);
  });
  document.getElementById("enhedSoeg").addEventListener("input", function() {
    _enhedRenderFiltreret(this.value);
  });
}

function _enhedShowForm(enhed) {
  document.getElementById("levPanelTitle").textContent = enhed ? "✏️ Rediger enhed" : "➕ Ny enhed";
  const body = document.getElementById("levPanelBody");
  const valgteKat = enhed?.kategorier?.length ? enhed.kategorier
    : (enhed?.kategori ? [enhed.kategori] : []);
  const katCheckboxes = EGNE_KATEGORIER.map(k =>
    `<label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
      <input type="checkbox" name="ef-kat" value="${k.id}" ${valgteKat.includes(k.id) ? "checked" : ""}>
      ${k.ikon} ${k.navn}
    </label>`
  ).join("");

  body.innerHTML = `
    <div style="padding:12px;display:flex;flex-direction:column;gap:10px">
      <label style="font-size:13px;font-weight:600">Navn / beskrivelse
        <input id="ef-navn" type="text" value="${_esc(enhed?.navn || "")}"
          placeholder="fx 409 Falck Kolding TMA 8670"
          style="display:block;width:100%;margin-top:4px;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </label>
      <div style="font-size:13px;font-weight:600">Kategorier (vælg én eller flere)
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px">
          ${katCheckboxes}
        </div>
      </div>
      <label style="font-size:13px;font-weight:600">Adresse (søg)
        <input id="ef-adr-sok" type="text" value="${_esc(enhed?.adresse || "")}"
          placeholder="Skriv adresse og vælg fra listen..."
          autocomplete="off"
          style="display:block;width:100%;margin-top:4px;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
        <div id="ef-adr-liste" style="border:1px solid #ddd;border-radius:4px;background:#fff;max-height:140px;overflow-y:auto;display:none;font-size:12px"></div>
      </label>
      <input id="ef-lat" type="hidden" value="${enhed?.lat ?? ""}">
      <input id="ef-lon" type="hidden" value="${enhed?.lon ?? ""}">
      <label style="font-size:13px;font-weight:600">Kontakt / tlf.
        <input id="ef-kontakt" type="text" value="${_esc(enhed?.kontakt || "")}"
          placeholder="fx 8670"
          style="display:block;width:100%;margin-top:4px;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </label>
      <label style="font-size:13px;font-weight:600">Bemærkning
        <input id="ef-bemaerk" type="text" value="${_esc(enhed?.bemærkning || "")}"
          placeholder="valgfri"
          style="display:block;width:100%;margin-top:4px;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">
      </label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="ef-gem" class="lev-btn-primary" style="flex:1">💾 Gem</button>
        <button id="ef-annuller" class="lev-btn-secondary" style="flex:1">Annuller</button>
      </div>
      <div id="ef-status" style="font-size:12px;color:#27ae60;min-height:18px"></div>
    </div>`;

  // DAWA adressesøgning
  const adrInput = document.getElementById("ef-adr-sok");
  const adrListe = document.getElementById("ef-adr-liste");
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
          `<div class="ef-adr-item" data-tekst="${_esc(it.tekst)}" data-lat="${it.adresse?.y ?? ""}" data-lon="${it.adresse?.x ?? ""}"
            style="padding:6px 8px;cursor:pointer;border-bottom:1px solid #eee">${_esc(it.tekst)}</div>`
        ).join("");
        adrListe.style.display = "block";
        adrListe.querySelectorAll(".ef-adr-item").forEach(div => {
          div.addEventListener("mouseenter", () => div.style.background = "#f0f0f0");
          div.addEventListener("mouseleave", () => div.style.background = "");
          div.addEventListener("click", () => {
            adrInput.value = div.dataset.tekst;
            document.getElementById("ef-lat").value = div.dataset.lat;
            document.getElementById("ef-lon").value = div.dataset.lon;
            adrListe.style.display = "none";
          });
        });
      } catch(e) { adrListe.style.display = "none"; }
    }, 300);
  });

  document.getElementById("ef-gem").addEventListener("click", () => _enhedGem(enhed?.id || null));
  document.getElementById("ef-annuller").addEventListener("click", _enhedShowListe);
}

async function _enhedGem(existingId) {
  const navn      = document.getElementById("ef-navn").value.trim();
  const kategorier = Array.from(document.querySelectorAll('input[name="ef-kat"]:checked')).map(el => el.value);
  const adresse   = document.getElementById("ef-adr-sok").value.trim();
  const lat       = parseFloat(document.getElementById("ef-lat").value) || null;
  const lon       = parseFloat(document.getElementById("ef-lon").value) || null;
  const kontakt   = document.getElementById("ef-kontakt").value.trim();
  const bemærk    = document.getElementById("ef-bemaerk").value.trim();
  const status    = document.getElementById("ef-status");

  if (!navn) { status.style.color = "#c0392b"; status.textContent = "Navn er påkrævet."; return; }
  if (!kategorier.length) { status.style.color = "#c0392b"; status.textContent = "Vælg mindst én kategori."; return; }

  // ── DUBLET-TJEK (kun ved oprettelse af ny enhed) ─────────────────
  if (!existingId && _enhedData?.length) {
    const nytMandNr  = (navn.match(/^(\d{4})/) || [])[1] || "";
    const nytNavn    = navn.toLowerCase();
    const nytAdr     = adresse.toLowerCase().replace(/\s+/g, " ");
    const nytKontakt = kontakt.replace(/\s/g, "");

    const advarsler = [];
    for (const e of _enhedData) {
      const eksNavn    = (e.navn    || "").toLowerCase();
      const eksMandNr  = (eksNavn.match(/^(\d{4})/) || [])[1] || "";
      const eksAdr     = (e.adresse || "").toLowerCase().replace(/\s+/g, " ");
      const eksKontakt = (e.kontakt || "").replace(/\s/g, "");

      if (nytMandNr  && eksMandNr  && nytMandNr  === eksMandNr)  advarsler.push(`Advarsel: ${nytMandNr} findes allerede (${e.navn})`);
      else if (nytNavn && eksNavn  && nytNavn     === eksNavn)    advarsler.push(`Advarsel: "${e.navn}" findes allerede`);
      if (nytAdr     && eksAdr     && nytAdr      === eksAdr)     advarsler.push(`Advarsel: Adressen "${adresse}" findes allerede (${e.navn})`);
      if (nytKontakt && eksKontakt && nytKontakt  === eksKontakt) advarsler.push(`Advarsel: Telefon ${kontakt} findes allerede (${e.navn})`);
    }

    if (advarsler.length) {
      const fortsæt = confirm(advarsler.join("\n") + "\n\nVil du oprette enheden alligevel?");
      if (!fortsæt) {
        status.style.color = "#e67e22";
        status.textContent = "Oprettelse annulleret — tjek eksisterende enheder.";
        return;
      }
    }
  }

  const gemBtn = document.getElementById("ef-gem");
  gemBtn.disabled = true; gemBtn.textContent = "⏳ Gemmer...";

  try {
    const resp = await _levSpFetch("/enheder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: existingId, navn, kategorier, lat, lon, adresse, kontakt, bemærkning: bemærk })
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

async function _enhedSlet(id) {
  if (!confirm("Slet denne enhed?")) return;
  try {
    const resp = await _levSpFetch(`/enheder/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!resp.ok) throw new Error("Slet fejlede");
    await _enhedLoad();
    _enhedShowListe();
  } catch(e) {
    alert("Fejl ved sletning: " + e.message);
  }
}

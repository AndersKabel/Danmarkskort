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

const LEV_KATEGORIER = [
  { id: "u3500",      navn: "Autoleverandør u. 3500 kg.",  ikon: "🚗" },
  { id: "o3500",      navn: "Autoleverandør o. 3500 kg.",  ikon: "🚛" },
  { id: "tma",        navn: "TMA og tavlevognstrailere",   ikon: "🚧" },
  { id: "dyr",        navn: "Dyreredning",                 ikon: "🐾" },
  { id: "drift_hjem", navn: "Drift fra hjem",              ikon: "🏠" },
  { id: "mors",       navn: "Mors biler",                  ikon: "🚌" },
  { id: "liggende",   navn: "Liggende / forflytninger",    ikon: "🛏️" },
  { id: "vejrenser",  navn: "Vejrenser",                   ikon: "🧹" },
];

// ── LEAFLET LAG ──────────────────────────────────────────────────
// Ét lag per kategori – erklæret globalt så script.js ikke behøver dem
const _levKatLag = {};
LEV_KATEGORIER.forEach(k => { _levKatLag[k.id] = L.layerGroup(); });
var redigerLeverandoerLayer = L.layerGroup();
var levTilgaengeligLayer    = L.layerGroup();   // Tilgængelige leverandører

// ── STATE ────────────────────────────────────────────────────────
let _levData          = [];
let _levPostnrMap     = {};   // postnr → [primær kommunekode]
let _levHighlights    = [];
let _levLoginProgress = false;
let _levLoaded        = false;
let _levTilgInterval  = null; // auto-refresh interval for tilgængelighed-laget

// ── BOOT ─────────────────────────────────────────────────────────
async function initLeverandoerModul() {
  _levLoadPostnrMap();   // starter i baggrunden – blokerer ikke UI
  _levBuildControl();
  _levBuildUI();
}

// ── LEAFLET LAYER CONTROL ────────────────────────────────────────
function _levBuildControl() {
  const overlays = {};
  LEV_KATEGORIER.forEach(k => {
    overlays[`${k.ikon} ${k.navn}`] = _levKatLag[k.id];
  });
  overlays["🟢 Tilgængelige leverandører"] = levTilgaengeligLayer;
  overlays["✏️ Rediger leverandører"]       = redigerLeverandoerLayer;

  const levCtrl = L.control.layers({}, overlays, { position: "topright", collapsed: true }).addTo(map);
  const levCtrlEl = levCtrl.getContainer();
  levCtrlEl.classList.add("lev-disp-ctrl");
  // Flyt til kortets container — så right: bruger samme reference som #distanceOptions
  map.getContainer().appendChild(levCtrlEl);

  map.on("overlayadd", async function (e) {
    // Rediger-laget åbner admin-panelet
    if (e.layer === redigerLeverandoerLayer) {
      map.removeLayer(redigerLeverandoerLayer);
      await _levOpenAdmin();
      return;
    }
    // Tilgængelighed-lag → hent data og start 60-sekunders auto-refresh
    if (e.layer === levTilgaengeligLayer) {
      await _levTilgLoad();
      _levTilgInterval = setInterval(_levTilgLoad, 60_000);
      return;
    }
    // Et kategori-lag tændes → load data første gang
    const erKat = LEV_KATEGORIER.some(k => _levKatLag[k.id] === e.layer);
    if (erKat && !_levLoaded) {
      await _levLoad();
    }
  });

  // Stop interval og ryd markører når tilgængelighed-laget slås fra
  map.on("overlayremove", function (e) {
    if (e.layer === levTilgaengeligLayer) {
      clearInterval(_levTilgInterval);
      _levTilgInterval = null;
      levTilgaengeligLayer.clearLayers();
    }
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

async function _levEnsureLogin() {
  if (_levLoginProgress) return false;
  _levLoginProgress = true;
  try {
    const me = await fetch(`${LEV_SP_WORKER}/auth/me`, { credentials: "include" });
    if (me.ok) return true;

    const code = prompt("Indtast adgangskoden til leverandørstyring:");
    if (!code?.trim()) return false;

    const login = await fetch(`${LEV_SP_WORKER}/auth/login`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() })
    });
    if (!login.ok) { alert("Forkert kode – prøv igen."); return false; }
    return true;
  } finally {
    _levLoginProgress = false;
  }
}

// ── DATA LOADING ─────────────────────────────────────────────────
async function _levLoad() {
  try {
    const resp = await _levSpFetch("/leverandoerer");
    if (!resp.ok) { console.warn("Leverandørdata fejlede:", resp.status); return; }
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
    const katLag = _levKatLag[lev.kategori];
    if (!katLag) return;

    (lev.arbejdsAdresser || []).forEach(adr => {
      if (!adr.lat || !adr.lon) return;
      let closeTimer = null;

      const marker = L.marker([adr.lat, adr.lon], { icon: _levIcon(lev) })
        .bindPopup(_levPopupHTML(lev, adr), { maxWidth: 360, className: "lev-leaflet-popup" })
        .on("mouseover", function () {
          clearTimeout(closeTimer);
          this.openPopup();
          _levHighlight(lev, adr);
        })
        .on("mouseout", function () {
          const self = this;
          closeTimer = setTimeout(() => {
            self.closePopup();
            _levClearHighlights();
          }, 250);
        })
        .on("popupopen", function () {
          // Annuller luk-timeren hvis musen går ind i popup'en
          const el = this.getPopup().getElement();
          if (!el) return;
          el.addEventListener("mouseenter", () => clearTimeout(closeTimer));
          el.addEventListener("mouseleave", () => {
            const self = this;
            closeTimer = setTimeout(() => {
              self.closePopup();
              _levClearHighlights();
            }, 250);
          });
        });

      katLag.addLayer(marker);
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
      iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22]
    });

    L.marker([lat, lon], { icon })
      .bindPopup(popupHTML, { maxWidth: 320, className: "lev-leaflet-popup" })
      .addTo(levTilgaengeligLayer);
  });
}

function _levIcon(lev) {
  const kat    = LEV_KATEGORIER.find(k => k.id === lev.kategori);
  const initial = kat ? kat.ikon : (lev.navn || "?")[0].toUpperCase();
  const color   = lev.farve || "#3498db";
  return L.divIcon({
    className:   "",
    html:        `<div class="lev-marker-icon" style="background:${color}">${initial}</div>`,
    iconSize:    [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22]
  });
}

function _levPopupHTML(lev, adr) {
  const c = lev.farve || "#3498db";
  let h = `<div class="lev-popup">
    <div class="lev-popup-top" style="border-left:4px solid ${c}">
      <b>${_esc(lev.navn)}</b>
      ${adr.label ? `<span class="lev-popup-sub">${_esc(adr.label)}</span>` : ""}
    </div>
    <div class="lev-popup-row">📍 ${_esc(adr.vej)}, ${_esc(adr.postnr)} ${_esc(adr.by)}</div>`;

  const tlf = lev.kontakt?.telefonnumre || [];
  if (tlf.length) {
    h += `<hr class="lev-hr"><div class="lev-popup-section-hdr">📞 Telefon</div>`;
    tlf.forEach(t => {
      h += `<div class="lev-popup-row lev-popup-tlf">
        <span class="lev-popup-tlf-label">${_esc(t.label)}</span>
        <a href="tel:${_esc(t.tlf)}">${_esc(t.tlf)}</a>
      </div>`;
    });
  }
  if (lev.kontakt?.email)
    h += `<div class="lev-popup-row">✉️ <a href="mailto:${_esc(lev.kontakt.email)}">${_esc(lev.kontakt.email)}</a></div>`;

  const vogne = lev.vogne || [];
  if (vogne.length) {
    h += `<hr class="lev-hr"><div class="lev-popup-section-hdr">🚗 Vogne (${vogne.length})</div>`;
    vogne.forEach(v => {
      h += `<div class="lev-popup-vogn">`;
      if (v.billede) h += `<img src="${_esc(v.billede)}" class="lev-popup-vogn-img" alt="" onerror="this.style.display='none'">`;
      h += `<div>`;
      if (v.reg)        h += `<b>${_esc(v.reg)}</b>`;
      if (v.vognnummer) h += ` <span class="lev-popup-vognr">– Vogn ${_esc(v.vognnummer)}</span>`;
      if (v.beskrivelse) h += `<br><span class="lev-popup-vogn-besk">${_esc(v.beskrivelse)}</span>`;
      h += `</div></div>`;
    });
  }

  const pnr = (adr?.prioritetsPostnumre?.length)
    ? adr.prioritetsPostnumre
    : (lev.prioritetsPostnumre || []);
  if (pnr.length) {
    const vis    = pnr.slice(0, 10).join(", ");
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
    const kat = LEV_KATEGORIER.find(k => k.id === lev.kategori);
    return `
      <div class="lev-list-row" data-id="${lev.id}">
        <span class="lev-list-dot" style="background:${lev.farve || '#aaa'}"></span>
        <div class="lev-list-info">
          <span class="lev-list-navn">${_esc(lev.navn || "Navnløs")}</span>
          <span class="lev-list-meta">
            ${kat ? kat.ikon + " " + kat.navn : "Ingen kategori"} ·
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
      id: "lev-" + Date.now(), navn: "", farve: "#3498db", kategori: "", aktiv: true,
      kontakt: { navn: "", email: "", telefonnumre: [] },
      fakturaAdresse: { vej: "", postnr: "", by: "" },
      arbejdsAdresser: [], vogne: [], prioritetsPostnumre: []
    };
  }

  document.getElementById("levPanelTitle").textContent = isNy ? "Ny leverandør" : _esc(lev.navn) || "Rediger";
  const body = document.getElementById("levPanelBody");

  const katOptions = LEV_KATEGORIER.map(k =>
    `<option value="${k.id}" ${lev.kategori === k.id ? "selected" : ""}>${k.ikon} ${k.navn}</option>`
  ).join("");

  body.innerHTML = `
    <div class="lev-form">
      <button class="lev-tilbage-btn" id="levTilbage">← Tilbage til liste</button>

      <fieldset class="lev-fs">
        <legend>📋 Basisoplysninger</legend>
        <label>Firmanavn <input type="text" id="lf-navn" value="${_esc(lev.navn)}" placeholder="Firma ApS"></label>
        <label>Kategori
          <select id="lf-kategori">
            <option value="">-- Vælg kategori --</option>
            ${katOptions}
          </select>
        </label>
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

      <fieldset class="lev-fs">
        <legend>👤 Kontakt</legend>
        <label>Kontaktperson <input type="text" id="lf-knavn" value="${_esc(lev.kontakt?.navn)}"></label>
        <label>Email <input type="email" id="lf-kemail" value="${_esc(lev.kontakt?.email)}" placeholder="kontakt@firma.dk"></label>
        <div class="lev-section-sub">📞 Telefonnumre (øverst = højst prioritet)</div>
        <div id="lf-telefoner"></div>
        <button type="button" id="levAddTlf" class="lev-btn-add">+ Tilføj telefonnummer</button>
      </fieldset>

      <fieldset class="lev-fs">
        <legend>📄 Faktura-adresse</legend>
        <label>Vejnavn + nr. <input type="text" id="lf-fvej" value="${_esc(lev.fakturaAdresse?.vej)}"></label>
        <div class="lev-row">
          <label class="lev-label-postnr">Postnr. <input type="text" id="lf-fpostnr" value="${_esc(lev.fakturaAdresse?.postnr)}" placeholder="8000"></label>
          <label class="lev-label-by">By <input type="text" id="lf-fby" value="${_esc(lev.fakturaAdresse?.by)}"></label>
        </div>
      </fieldset>

      <fieldset class="lev-fs">
        <legend>📍 Arbejdsadresser</legend>
        <p class="lev-hint">Hvert depot/udgangspunkt vises som markør på kortet.</p>
        <div id="lf-adresser"></div>
        <button type="button" id="levAddAdr" class="lev-btn-add">+ Tilføj adresse</button>
      </fieldset>

      <fieldset class="lev-fs">
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
  (lev.vogne || []).forEach(v => _levAppendVognRow(vognDiv, v));

  document.getElementById("levTilbage").addEventListener("click", _levShowListe);
  document.getElementById("levAddTlf") .addEventListener("click", () => _levAppendTlfRow(tlfDiv, {}));
  document.getElementById("levAddAdr") .addEventListener("click", () => _levAppendAdrRow(adrDiv, {}));
  document.getElementById("levAddVogn").addEventListener("click", () => _levAppendVognRow(vognDiv, {}));
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
function _levAppendVognRow(container, v = {}) {
  const div = document.createElement("div");
  div.className = "lev-vogn-row";
  div.dataset.id      = v.id      || "vogn-" + Date.now();
  div.dataset.billedUrl = v.billede || "";
  const harFoto = !!v.billede;
  div.innerHTML = `
    <div class="lev-row lev-row-header">
      <label class="lev-label-grow">Reg.nr. <input type="text" class="v-reg" value="${_esc(v.reg)}" placeholder="AB 12 345"></label>
      <button type="button" class="lev-slet-row-btn">✕</button>
    </div>
    <label>Beskrivelse <input type="text" class="v-besk" value="${_esc(v.beskrivelse)}" placeholder="Kranvogn – 20t løftekapacitet"></label>
    <label>Vognnummer <input type="text" class="v-vognr" value="${_esc(v.vognnummer)}" placeholder="f.eks. 8696"></label>
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
    </div>`;
  container.appendChild(div);

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
      kategori: document.getElementById("lf-kategori").value,
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
        reg:         row.querySelector(".v-reg").value.trim(),
        beskrivelse: row.querySelector(".v-besk").value.trim(),
        vognnummer:  row.querySelector(".v-vognr").value.trim(),
        billede:     row.dataset.billedUrl || (thumb?.src?.startsWith("http") ? thumb.src : null)
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

// ── HJÆLPER ──────────────────────────────────────────────────────
function _esc(s) {
  return (s || "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

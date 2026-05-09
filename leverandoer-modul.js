/* ================================================================
   leverandoer-modul.js  –  Leverandøroversigt til Danmarkskort
   ================================================================
   Afhænger af globale variabler fra script.js:
     • map            (Leaflet map-instans)
     • kommuneGeoJSON (hentet fra Dataforsyningen)
   ================================================================ */

// ── KONFIGURATION ─────────────────────────────────────────────────
const LEV_ADMIN_PIN    = "1234";          // Skift til din ønskede PIN
const LEV_DATA_URL     = "leverandorer.json";
const LEV_BILLEDER_STI = "billeder/";     // Mappe til billeder på GitHub

// ── INTERN STATE ──────────────────────────────────────────────────
let _levData          = { leverandoerer: [] };
let _levPostnrMap     = {};
let _levHighlights    = [];
let _levAdminUnlocked = false;


// ── BOOT ──────────────────────────────────────────────────────────
async function initLeverandoerModul() {
  await _levLoadData();
  _levLoadPostnrMap();
  _levBuildMarkers();
  _levBuildUI();
}

// ── DATA ──────────────────────────────────────────────────────────
async function _levLoadData() {
  try {
    const r = await fetch(LEV_DATA_URL + "?_=" + Date.now());
    if (r.ok) _levData = await r.json();
    else _levData = { leverandoerer: [] };
  } catch {
    _levData = { leverandoerer: [] };
  }
}

async function _levLoadPostnrMap() {
  try {
    const r    = await fetch("https://api.dataforsyningen.dk/postnumre?format=json");
    const data = await r.json();
    _levPostnrMap = {};
    data.forEach(p => {
      _levPostnrMap[p.nr] = (p.kommuner || []).map(k => k.kode);
    });
  } catch (e) {
    console.warn("Leverandørmodul: postnr-kort fejlede", e);
  }
}

// ── MARKØRER ──────────────────────────────────────────────────────
function _levBuildMarkers() {
  leverandoerLayer.clearLayers();
  (_levData.leverandoerer || [])
    .filter(l => l.aktiv !== false)
    .forEach(lev => {
      (lev.arbejdsAdresser || []).forEach(adr => {
        if (!adr.lat || !adr.lon) return;
        const marker = L.marker([adr.lat, adr.lon], { icon: _levIcon(lev) })
          .bindPopup(_levPopupHTML(lev, adr), { maxWidth: 340, className: "lev-leaflet-popup" })
          .on("mouseover", function() { this.openPopup(); _levHighlight(lev); })
          .on("mouseout",  function() { _levClearHighlights(); });
        leverandoerLayer.addLayer(marker);
      });
    });
}

function _levIcon(lev) {
  const initial = (lev.navn || "?")[0].toUpperCase();
  const color   = lev.farve || "#3498db";
  return L.divIcon({
    className:   "",
    html:        `<div class="lev-marker-icon" style="background:${color}">${initial}</div>`,
    iconSize:    [36, 36],
    iconAnchor:  [18, 18],
    popupAnchor: [0, -22]
  });
}

function _levBilledeSrc(billede) {
  if (!billede) return "";
  if (billede.startsWith("data:") || billede.startsWith("http") || billede.startsWith("/")) return billede;
  return LEV_BILLEDER_STI + billede;
}

function _levPopupHTML(lev, adr) {
  const c = lev.farve || "#3498db";
  let h = `<div class="lev-popup">
    <div class="lev-popup-top" style="border-left:4px solid ${c}">
      <b>${_esc(lev.navn)}</b>
      ${adr.label ? `<span class="lev-popup-sub">${_esc(adr.label)}</span>` : ""}
    </div>
    <div class="lev-popup-row">📍 ${_esc(adr.vej)}, ${_esc(adr.postnr)} ${_esc(adr.by)}</div>`;

  if (lev.kontakt?.tlf)
    h += `<div class="lev-popup-row">📞 <a href="tel:${_esc(lev.kontakt.tlf)}">${_esc(lev.kontakt.tlf)}</a></div>`;
  if (lev.kontakt?.email)
    h += `<div class="lev-popup-row">✉️ <a href="mailto:${_esc(lev.kontakt.email)}">${_esc(lev.kontakt.email)}</a></div>`;

  const vogne = lev.vogne || [];
  if (vogne.length) {
    h += `<hr class="lev-hr"><div class="lev-popup-section-hdr">🚗 Vogne (${vogne.length})</div>`;
    vogne.forEach(v => {
      h += `<div class="lev-popup-vogn">`;
      if (v.billede) h += `<img src="${_levBilledeSrc(v.billede)}" class="lev-popup-vogn-img" alt="${_esc(v.reg)}" onerror="this.style.display='none'">`;
      h += `<div>`;
      if (v.reg) h += `<b>${_esc(v.reg)}</b>`;
      if (v.beskrivelse) h += `<br><span class="lev-popup-vogn-besk">${_esc(v.beskrivelse)}</span>`;
      h += `</div></div>`;
    });
  }

  const pnr = lev.prioritetsPostnumre || [];
  if (pnr.length) {
    const vis    = pnr.slice(0, 10).join(", ");
    const ekstra = pnr.length > 10 ? ` +${pnr.length - 10} mere` : "";
    h += `<hr class="lev-hr"><div class="lev-popup-prio">📮 Prioritet: ${vis}${ekstra}</div>`;
  }
  h += `</div>`;
  return h;
}

// ── HIGHLIGHT KOMMUNER ────────────────────────────────────────────
function _levHighlight(lev) {
  _levClearHighlights();
  if (!kommuneGeoJSON?.features || !lev.prioritetsPostnumre?.length) return;
  const koder = new Set(
    (lev.prioritetsPostnumre || []).flatMap(pnr => _levPostnrMap[String(pnr).trim()] || [])
  );
  if (!koder.size) return;
  kommuneGeoJSON.features.forEach(feat => {
    const kode = feat.properties?.kode;
    if (!kode || !koder.has(kode)) return;
    const lay = L.geoJSON(feat, {
      style: { color: lev.farve || "#3498db", weight: 2, fillColor: lev.farve || "#3498db", fillOpacity: 0.22 },
      interactive: false
    }).addTo(map);
    _levHighlights.push(lay);
  });
}

function _levClearHighlights() {
  _levHighlights.forEach(l => map.removeLayer(l));
  _levHighlights = [];
}

// ── ADMIN UI ──────────────────────────────────────────────────────
function _levBuildUI() {
  document.body.insertAdjacentHTML("beforeend", `
    <div id="levPinModal" class="lev-modal-overlay" style="display:none">
      <div class="lev-modal-box">
        <div class="lev-modal-title">🔒 Leverandørstyring</div>
        <p class="lev-modal-desc">Indtast PIN-kode for at redigere leverandørdata</p>
        <input type="password" id="levPinInput" placeholder="PIN-kode" maxlength="20" autocomplete="off">
        <div id="levPinErr" class="lev-pin-err"></div>
        <div class="lev-modal-footer">
          <button id="levPinOk"  class="lev-btn-primary">Bekræft</button>
          <button id="levPinAfl" class="lev-btn-ghost">Annuller</button>
        </div>
      </div>
    </div>`);

  document.body.insertAdjacentHTML("beforeend", `
    <div id="levAdminPanel" class="lev-panel">
      <div class="lev-panel-hdr">
        <span id="levPanelTitle">🚛 Leverandørstyring</span>
        <button id="levPanelLuk" class="lev-panel-luk-btn" title="Luk panel">✕</button>
      </div>
      <div id="levPanelBody" class="lev-panel-body"></div>
    </div>`);

  document.getElementById("levPinOk") .addEventListener("click", _levCheckPin);
  document.getElementById("levPinAfl").addEventListener("click", () =>
    document.getElementById("levPinModal").style.display = "none");
  document.getElementById("levPinInput").addEventListener("keydown", e => {
    if (e.key === "Enter") _levCheckPin();
    document.getElementById("levPinErr").textContent = "";
  });
  document.getElementById("levPanelLuk").addEventListener("click", _levClosePanel);
}

function openLeverandoerAdmin() {
  if (_levAdminUnlocked) { _levOpenPanel(); return; }
  document.getElementById("levPinModal").style.display = "flex";
  setTimeout(() => document.getElementById("levPinInput")?.focus(), 60);
}

function _levCheckPin() {
  const val = document.getElementById("levPinInput").value;
  if (val === LEV_ADMIN_PIN) {
    _levAdminUnlocked = true;
    document.getElementById("levPinModal").style.display = "none";
    document.getElementById("levPinInput").value = "";
    _levOpenPanel();
  } else {
    const err = document.getElementById("levPinErr");
    err.textContent = "Forkert PIN – prøv igen";
    document.getElementById("levPinInput").value = "";
    document.getElementById("levPinInput").focus();
    setTimeout(() => err.textContent = "", 3000);
  }
}

function _levOpenPanel() {
  document.getElementById("levAdminPanel").classList.add("lev-panel-open");
  _levShowListe();
}

function _levClosePanel() {
  document.getElementById("levAdminPanel").classList.remove("lev-panel-open");
}

// ── LISTE ─────────────────────────────────────────────────────────
function _levShowListe() {
  document.getElementById("levPanelTitle").textContent = "🚛 Leverandørstyring";
  const body = document.getElementById("levPanelBody");

  const lister = (_levData.leverandoerer || []).map(lev => `
    <div class="lev-list-row" data-id="${lev.id}">
      <span class="lev-list-dot" style="background:${lev.farve || '#aaa'}"></span>
      <div class="lev-list-info">
        <span class="lev-list-navn">${_esc(lev.navn || "Navnløs")}</span>
        <span class="lev-list-meta">
          ${(lev.arbejdsAdresser || []).length} adresser · ${(lev.vogne || []).length} vogne
          ${lev.aktiv === false ? " · <em style='color:#e74c3c'>inaktiv</em>" : ""}
        </span>
      </div>
      <span class="lev-list-arrow">›</span>
    </div>`).join("") ||
    `<p class="lev-empty">Ingen leverandører endnu.<br>Klik "+ Ny leverandør" for at starte.</p>`;

  body.innerHTML = `
    <div class="lev-list-toolbar">
      <button id="levNyBtn" class="lev-btn-primary">+ Ny leverandør</button>
    </div>
    <div class="lev-list-container">${lister}</div>
    <div class="lev-panel-footer">
      <button id="levDlBtn" class="lev-btn-secondary">💾 Download JSON</button>
      <label class="lev-btn-secondary lev-file-label">
        📂 Indlæs JSON
        <input type="file" id="levUploadInput" accept=".json" style="display:none">
      </label>
      <p class="lev-footer-hint">
        "Gem" downloader <b>leverandorer.json</b> – upload til GitHub-rod.<br>
        Billeder uploades til mappen <b>billeder/</b> på GitHub.
      </p>
    </div>`;

  document.getElementById("levNyBtn").addEventListener("click", () => _levShowForm(null));
  document.getElementById("levDlBtn").addEventListener("click", _levDownload);
  document.getElementById("levUploadInput").addEventListener("change", _levIndlaes);
  body.querySelectorAll(".lev-list-row").forEach(row =>
    row.addEventListener("click", () => _levShowForm(row.dataset.id))
  );
}

// ── FORMULAR ──────────────────────────────────────────────────────
function _levShowForm(id) {
  let lev = id ? (_levData.leverandoerer || []).find(l => l.id === id) : null;
  const isNy = !lev;
  if (isNy) {
    lev = {
      id: "lev-" + Date.now(), navn: "", farve: "#3498db", aktiv: true,
      kontakt: { navn: "", tlf: "", email: "" },
      fakturaAdresse: { vej: "", postnr: "", by: "" },
      arbejdsAdresser: [], vogne: [], prioritetsPostnumre: []
    };
  }

  document.getElementById("levPanelTitle").textContent = isNy ? "Ny leverandør" : _esc(lev.navn) || "Rediger";
  const body = document.getElementById("levPanelBody");
  body.innerHTML = `
    <div class="lev-form">
      <button class="lev-tilbage-btn" id="levTilbage">← Tilbage til liste</button>

      <fieldset class="lev-fs">
        <legend>📋 Basisoplysninger</legend>
        <label>Firmanavn <input type="text" id="lf-navn" value="${_esc(lev.navn)}" placeholder="Firma ApS"></label>
        <div class="lev-row lev-row-color">
          <label>Farve på kortet <input type="color" id="lf-farve" value="${_esc(lev.farve || '#3498db')}"></label>
          <label class="lev-check-label"><input type="checkbox" id="lf-aktiv" ${lev.aktiv !== false ? "checked" : ""}> Aktiv</label>
        </div>
      </fieldset>

      <fieldset class="lev-fs">
        <legend>👤 Kontaktperson</legend>
        <label>Navn <input type="text" id="lf-knavn" value="${_esc(lev.kontakt?.navn)}"></label>
        <label>Telefon <input type="tel" id="lf-ktlf" value="${_esc(lev.kontakt?.tlf)}" placeholder="70 xx xx xx"></label>
        <label>Email <input type="email" id="lf-kemail" value="${_esc(lev.kontakt?.email)}" placeholder="kontakt@firma.dk"></label>
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

      <fieldset class="lev-fs">
        <legend>📮 Prioritetspostnumre</legend>
        <p class="lev-hint">Kommaseparerede 4-cifrede postnumre. Kommunerne fremhæves på kortet ved hover.</p>
        <textarea id="lf-pnr" rows="3" class="lev-textarea" placeholder="8000, 8200, 8210, 8220...">${(lev.prioritetsPostnumre || []).join(", ")}</textarea>
      </fieldset>

      <div class="lev-form-footer">
        <button id="levGemBtn" class="lev-btn-primary">💾 Gem leverandør</button>
        ${!isNy ? `<button id="levSletBtn" class="lev-btn-danger">🗑️ Slet</button>` : ""}
      </div>
    </div>`;

  const adrDiv  = document.getElementById("lf-adresser");
  const vognDiv = document.getElementById("lf-vogne");
  (lev.arbejdsAdresser || []).forEach(a => _levAppendAdrRow(adrDiv,  a));
  (lev.vogne || []).forEach(v => _levAppendVognRow(vognDiv, v));

  document.getElementById("levTilbage") .addEventListener("click", _levShowListe);
  document.getElementById("levAddAdr")  .addEventListener("click", () => _levAppendAdrRow(adrDiv,  {}));
  document.getElementById("levAddVogn") .addEventListener("click", () => _levAppendVognRow(vognDiv, {}));
  document.getElementById("levGemBtn")  .addEventListener("click", () => _levGem(lev));
  document.getElementById("levSletBtn")?.addEventListener("click", () => _levSlet(lev.id));
}

// ── ADRESSE-RÆKKE ─────────────────────────────────────────────────
function _levAppendAdrRow(container, a = {}) {
  const div = document.createElement("div");
  div.className = "lev-adr-row";
  div.dataset.id = a.id || "adr-" + Date.now();
  div.innerHTML = `
    <div class="lev-row lev-row-header">
      <label class="lev-label-grow">Navn/label
        <input type="text" class="a-label" value="${_esc(a.label)}" placeholder="f.eks. Nord-depot">
      </label>
      <button type="button" class="lev-slet-row-btn" title="Fjern adresse">✕</button>
    </div>
    <label>Vejnavn + nr. <input type="text" class="a-vej" value="${_esc(a.vej)}"></label>
    <div class="lev-row">
      <label class="lev-label-postnr">Postnr. <input type="text" class="a-postnr" value="${_esc(a.postnr)}" placeholder="8000"></label>
      <label class="lev-label-by">By <input type="text" class="a-by" value="${_esc(a.by)}"></label>
    </div>
    <div class="lev-row lev-coord-row">
      <label class="lev-label-coord">Bredde (lat) <input type="text" class="a-lat" value="${a.lat || ""}" placeholder="56.xxxx"></label>
      <label class="lev-label-coord">Længde (lon) <input type="text" class="a-lon" value="${a.lon || ""}" placeholder="10.xxxx"></label>
      <button type="button" class="lev-geocode-btn">📍 Geocode</button>
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
      alert("Adressen blev ikke fundet – tjek vejnavn og postnr.");
    }
  });
}

// ── VOGN-RÆKKE (GitHub-billeder) ──────────────────────────────────
function _levAppendVognRow(container, v = {}) {
  const div = document.createElement("div");
  div.className = "lev-vogn-row";
  div.dataset.id = v.id || "vogn-" + Date.now();

  // Gem billedets filnavn (uden sti-præfix)
  const gemtFilnavn = v.billede && !v.billede.startsWith("data:") ? v.billede : "";

  div.innerHTML = `
    <div class="lev-row lev-row-header">
      <label class="lev-label-grow">Reg.nr.
        <input type="text" class="v-reg" value="${_esc(v.reg)}" placeholder="AB 12 345">
      </label>
      <button type="button" class="lev-slet-row-btn" title="Fjern vogn">✕</button>
    </div>
    <label>Beskrivelse
      <input type="text" class="v-besk" value="${_esc(v.beskrivelse)}" placeholder="Kranvogn – 20t løftekapacitet">
    </label>
    <div class="lev-billede-sektion">
      <div class="lev-billede-hdr">📷 Billede fra GitHub</div>
      <div class="lev-billede-preview-wrap">
        <div class="lev-vogn-nofoto" id="nofoto-${div.dataset.id}">Intet billede endnu</div>
        ${gemtFilnavn ? `<img class="lev-vogn-thumb" id="thumb-${div.dataset.id}" src="${_levBilledeSrc(gemtFilnavn)}" alt="" onerror="this.style.display='none'">` : ""}
      </div>
      <label class="lev-hint" style="margin-top:6px; font-weight:600; color:#3a4a5a">
        Filnavn på billedet
        <input type="text" class="v-filnavn" value="${_esc(gemtFilnavn)}" placeholder="vogn-ab12345.jpg">
      </label>
      <p class="lev-hint">
        Upload billedet til <b>billeder/</b>-mappen på GitHub, skriv derefter filnavnet ovenfor og klik "Vis preview".
      </p>
      <button type="button" class="lev-preview-btn">👁️ Vis preview</button>
    </div>`;

  container.appendChild(div);

  // Auto-foreslå filnavn fra reg.nr når fokus forlader feltet
  div.querySelector(".v-reg").addEventListener("blur", (e) => {
    const fil = div.querySelector(".v-filnavn");
    if (!fil.value && e.target.value.trim()) {
      fil.value = "vogn-" + e.target.value.trim().toLowerCase().replace(/\s+/g, "") + ".jpg";
    }
  });

  div.querySelector(".lev-slet-row-btn").addEventListener("click", () => div.remove());

  // Preview-knap
  div.querySelector(".lev-preview-btn").addEventListener("click", () => {
    const filnavn = div.querySelector(".v-filnavn").value.trim();
    if (!filnavn) { alert("Skriv et filnavn først"); return; }
    const src    = _levBilledeSrc(filnavn) + "?_=" + Date.now();
    const nofoto = div.querySelector(".lev-vogn-nofoto");
    let   thumb  = div.querySelector(".lev-vogn-thumb");

    if (!thumb) {
      thumb = document.createElement("img");
      thumb.className = "lev-vogn-thumb";
      div.querySelector(".lev-billede-preview-wrap").appendChild(thumb);
    }
    thumb.style.display = "";
    thumb.src = src;
    thumb.onerror = () => {
      thumb.style.display = "none";
      if (nofoto) nofoto.style.display = "flex";
      alert(`Billedet "${filnavn}" blev ikke fundet i mappen "billeder/" på GitHub.\nHusk at uploade billedet til GitHub først.`);
    };
    thumb.onload = () => {
      if (nofoto) nofoto.style.display = "none";
    };
  });
}

// ── GEM ───────────────────────────────────────────────────────────
function _levGem(template) {
  const navn = document.getElementById("lf-navn").value.trim();
  if (!navn) { alert("Firmanavn er påkrævet"); return; }

  const lev = {
    id: template.id, navn,
    farve: document.getElementById("lf-farve").value,
    aktiv: document.getElementById("lf-aktiv").checked,
    kontakt: {
      navn:  document.getElementById("lf-knavn").value.trim(),
      tlf:   document.getElementById("lf-ktlf").value.trim(),
      email: document.getElementById("lf-kemail").value.trim()
    },
    fakturaAdresse: {
      vej:    document.getElementById("lf-fvej").value.trim(),
      postnr: document.getElementById("lf-fpostnr").value.trim(),
      by:     document.getElementById("lf-fby").value.trim()
    },
    arbejdsAdresser: [], vogne: [], prioritetsPostnumre: []
  };

  document.querySelectorAll("#lf-adresser .lev-adr-row").forEach(row => {
    lev.arbejdsAdresser.push({
      id: row.dataset.id,
      label:  row.querySelector(".a-label").value.trim(),
      vej:    row.querySelector(".a-vej").value.trim(),
      postnr: row.querySelector(".a-postnr").value.trim(),
      by:     row.querySelector(".a-by").value.trim(),
      lat:    parseFloat(row.querySelector(".a-lat").value) || null,
      lon:    parseFloat(row.querySelector(".a-lon").value) || null
    });
  });

  document.querySelectorAll("#lf-vogne .lev-vogn-row").forEach(row => {
    lev.vogne.push({
      id:          row.dataset.id,
      reg:         row.querySelector(".v-reg").value.trim(),
      beskrivelse: row.querySelector(".v-besk").value.trim(),
      billede:     row.querySelector(".v-filnavn").value.trim() || null
    });
  });

  lev.prioritetsPostnumre = document.getElementById("lf-pnr").value
    .split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d{4}$/.test(s));

  if (!_levData.leverandoerer) _levData.leverandoerer = [];
  const idx = _levData.leverandoerer.findIndex(l => l.id === lev.id);
  if (idx >= 0) _levData.leverandoerer[idx] = lev;
  else          _levData.leverandoerer.push(lev);

  _levBuildMarkers();
  _levShowListe();
  _levDownload();
}

function _levSlet(id) {
  if (!confirm("Er du sikker på at du vil slette denne leverandør?\nHandlingen kan ikke fortrydes.")) return;
  _levData.leverandoerer = (_levData.leverandoerer || []).filter(l => l.id !== id);
  _levBuildMarkers();
  _levShowListe();
  _levDownload();
}

function _levDownload() {
  const json = JSON.stringify(_levData, null, 2);
  const url  = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: "leverandorer.json" }).click();
  URL.revokeObjectURL(url);
}

function _levIndlaes(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try { _levData = JSON.parse(ev.target.result); _levBuildMarkers(); _levShowListe(); }
    catch { alert("Ugyldig JSON-fil – filen kunne ikke indlæses"); }
  };
  reader.readAsText(file);
}

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

function _esc(s) {
  return (s || "").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

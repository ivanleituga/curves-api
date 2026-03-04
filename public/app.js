/* global google */

// ===============================================
// K2 SISTEMAS - VISUALIZADOR DE POÇOS
// Versão 5.0 - Listas separadas (DLIS + PostgreSQL)
// ===============================================

// CONFIGURAÇÃO E ESTADO GLOBAL
const CONFIG = {
  API_URL: "/api",
  DEBUG_MODE: true,
  MAX_MAP_WELLS: 25
};

const state = {
  // ===== VIEWER (Perfis) =====
  wells: [],
  selectedWell: null,
  availableCurves: [],
  selectedCurves: [],
  maxCurves: 3,
  hasLito: true,
  isLoading: false,
  currentImageUrl: null,
  lastParams: null,
  
  // ===== MAPA =====
  geoWells: [],
  mapWells: [],
  mapWellsCoordinates: [],
  mapInstance: null,
  mapMarkers: [],
  googleMapsLoaded: false,
  
  // ===== NAVEGAÇÃO =====
  currentTab: "viewer",
  
  // ===== AUTENTICAÇÃO =====
  accessToken: null
};

// ELEMENTOS DO DOM - VIEWER
const elements = {
  form: document.getElementById("profileForm"),
  wellInput: document.getElementById("wellInput"),
  wellsList: document.getElementById("wells-list"),
  curvesContainer: document.getElementById("curvesContainer"),
  hasLitoInput: document.getElementById("hasLitoInput"),
  generateBtn: document.getElementById("generateBtn"),
  btnText: document.getElementById("btnText"),
  btnLoader: document.getElementById("btnLoader"),
  downloadBtn: document.getElementById("downloadBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  toggleDebug: document.getElementById("toggleDebug"),
  clearDebug: document.getElementById("clearDebug"),
  imageContainer: document.getElementById("imageContainer"),
  vizTitle: document.getElementById("vizTitle"),
  errorContainer: document.getElementById("errorContainer"),
  errorText: document.getElementById("errorText"),
  statusText: document.getElementById("statusText"),
  lastUpdate: document.getElementById("lastUpdate"),
  apiStatus: document.getElementById("apiStatus"),
  linkPanel: document.getElementById("linkPanel"),
  generatedLink: document.getElementById("generatedLink"),
  debugPanel: document.getElementById("debugPanel"),
  debugContent: document.getElementById("debugContent")
};

// ELEMENTOS DO DOM - MAPA
const mapElements = {
  wellInput: document.getElementById("mapWellInput"),
  wellsDatalist: document.getElementById("map-wells-datalist"),
  wellsList: document.getElementById("mapWellsList"),
  wellCount: document.getElementById("mapWellCount"),
  addWellBtn: document.getElementById("addWellBtn"),
  generateMapBtn: document.getElementById("generateMapBtn"),
  mapBtnText: document.getElementById("mapBtnText"),
  mapBtnLoader: document.getElementById("mapBtnLoader"),
  clearMapBtn: document.getElementById("clearMapBtn"),
  downloadMapBtn: document.getElementById("downloadMapBtn"),
  copyMapLinkBtn: document.getElementById("copyMapLinkBtn"),
  mapContainer: document.getElementById("mapContainer"),
  mapTitle: document.getElementById("mapTitle"),
  mapErrorContainer: document.getElementById("mapErrorContainer"),
  mapErrorText: document.getElementById("mapErrorText"),
  mapStatusCount: document.getElementById("mapStatusCount"),
  mapsApiStatus: document.getElementById("mapsApiStatus"),
  mapLinkPanel: document.getElementById("mapLinkPanel"),
  generatedMapLink: document.getElementById("generatedMapLink")
};

// ELEMENTOS DO DOM - ABAS
const tabElements = {
  tabButtons: document.querySelectorAll(".tab-btn"),
  viewerContent: document.getElementById("viewer-content"),
  mapsContent: document.getElementById("maps-content")
};

// ===============================================
// GERENCIAMENTO DE TOKEN
// ===============================================

function extractTokenFromHash() {
  const hash = window.location.hash;
  
  if (!hash || !hash.includes("token=")) {
    log("Nenhum token encontrado no hash");
    return null;
  }
  
  const match = hash.match(/token=([^&]+)/);
  
  if (match && match[1]) {
    const token = match[1];
    log("Token extraído do hash", { length: token.length });
    
    const currentTab = getTabFromHash();
    const newHash = currentTab ? `#${currentTab}` : "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search + newHash);
    
    return token;
  }
  
  return null;
}

function loadToken() {
  const hashToken = extractTokenFromHash();
  
  if (hashToken) {
    log("Token encontrado no hash, armazenando em sessão");
    sessionStorage.setItem("api_token", hashToken);
    state.accessToken = hashToken;
    return hashToken;
  }
  
  const storedToken = sessionStorage.getItem("api_token");
  
  if (storedToken) {
    log("Token recuperado do sessionStorage");
    state.accessToken = storedToken;
    return storedToken;
  }
  
  log("Nenhum token disponível", null);
  return null;
}

function clearToken() {
  sessionStorage.removeItem("api_token");
  state.accessToken = null;
  log("Token removido da sessão");
}

function getFetchHeaders() {
  const headers = { "Content-Type": "application/json" };
  
  if (state.accessToken) {
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  }
  
  return headers;
}

function getTokenHashPart() {
  return state.accessToken ? `token=${state.accessToken}&` : "";
}

// ===============================================
// NAVEGAÇÃO POR ABAS
// ===============================================

function getTabFromHash() {
  const hash = window.location.hash;
  if (hash.includes("maps")) return "maps";
  if (hash.includes("viewer")) return "viewer";
  return null;
}

function switchTab(tabName) {
  log("Mudando para aba", tabName);
  
  state.currentTab = tabName;
  
  tabElements.tabButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  
  if (tabName === "viewer") {
    tabElements.viewerContent.classList.add("active");
    tabElements.mapsContent.classList.remove("active");
  } else if (tabName === "maps") {
    tabElements.viewerContent.classList.remove("active");
    tabElements.mapsContent.classList.add("active");
  }
  
  const currentSearch = window.location.search;
  window.history.replaceState(null, "", `${window.location.pathname}${currentSearch}#${tabName}`);
  
  log("Aba ativa", tabName);
}

function setupTabNavigation() {
  tabElements.tabButtons.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  
  window.addEventListener("hashchange", () => {
    const tab = getTabFromHash();
    if (tab && tab !== state.currentTab) {
      switchTab(tab);
    }
  });
}

// ===============================================
// FUNÇÕES AUXILIARES
// ===============================================

function log(label, data = null) {
  if (!CONFIG.DEBUG_MODE) return;
  
  const timestamp = new Date().toLocaleTimeString("pt-BR");
  const message = data ? 
    `[${timestamp}] ${label}: ${JSON.stringify(data, null, 2)}` :
    `[${timestamp}] ${label}`;
  
  console.log(label, data);
  
  if (elements.debugContent) {
    elements.debugContent.textContent = message + "\n" + elements.debugContent.textContent;
  }
}

function updateStatus(message, type = "info") {
  const colors = {
    info: "#6b7280",
    success: "#10b981",
    error: "#ef4444",
    warning: "#f59e0b"
  };
  
  elements.statusText.textContent = message;
  elements.statusText.style.color = colors[type] || colors.info;
  
  if (type === "success") {
    elements.lastUpdate.textContent = new Date().toLocaleString("pt-BR");
  }
}

function showError(message) {
  elements.errorContainer.classList.remove("hidden");
  elements.errorText.textContent = message;
  updateStatus("Erro", "error");
  log("ERRO", message);
}

function clearError() {
  elements.errorContainer.classList.add("hidden");
  elements.errorText.textContent = "";
}

function showMapError(message) {
  mapElements.mapErrorContainer.classList.remove("hidden");
  mapElements.mapErrorText.textContent = message;
  log("ERRO MAPA", message);
}

function clearMapError() {
  mapElements.mapErrorContainer.classList.add("hidden");
  mapElements.mapErrorText.textContent = "";
}

// ===============================================
// VERIFICAR SAÚDE DA API
// ===============================================

async function checkAPIHealth() {
  try {
    const response = await fetch(`${CONFIG.API_URL}/health`, {
      headers: getFetchHeaders()
    });
    const data = await response.json();
    
    if (data.status === "ok") {
      elements.apiStatus.textContent = "Conectada";
      elements.apiStatus.style.color = "var(--success)";
      log("API Health Check", data);
    } else {
      elements.apiStatus.textContent = "Degradada";
      elements.apiStatus.style.color = "var(--warning)";
    }
  } catch (error) {
    elements.apiStatus.textContent = "Offline";
    elements.apiStatus.style.color = "var(--danger)";
    log("API Health Check Falhou", error.message);
  }
}

// ===============================================
// CARREGAR LISTA DE POÇOS DLIS (API K2 - para Perfis)
// ===============================================

async function loadWells() {
  try {
    log("Carregando poços DLIS (API K2)...");
    
    const response = await fetch(`${CONFIG.API_URL}/wells`, {
      headers: getFetchHeaders()
    });
    
    if (response.status === 401) {
      showError("Não autenticado. Token inválido ou ausente.");
      log("Erro 401: Token inválido");
      clearToken();
      return;
    }
    
    const wells = await response.json();
    
    state.wells = wells;
    log(`${wells.length} poços DLIS carregados`);
    
    elements.wellsList.innerHTML = wells.map(well => 
      `<option value="${well.id}">${well.name} (${well.state})</option>`
    ).join("");
    
  } catch (error) {
    log("Erro ao carregar poços DLIS", error);
    showError("Erro ao carregar lista de poços");
  }
}

// ===============================================
// CARREGAR LISTA DE POÇOS COM COORDENADAS (PostgreSQL - para Mapas)
// ===============================================

async function loadGeoWells() {
  try {
    log("Carregando poços com coordenadas (PostgreSQL)...");
    
    const response = await fetch(`${CONFIG.API_URL}/wells-geo`, {
      headers: getFetchHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const wells = await response.json();
    
    state.geoWells = wells;
    log(`${wells.length} poços com coordenadas carregados`);
    
    mapElements.wellsDatalist.innerHTML = wells.map(well => 
      `<option value="${well.id}">${well.name} (${well.state})</option>`
    ).join("");
    
    if (mapElements.mapsApiStatus) {
      mapElements.mapsApiStatus.textContent = `${wells.length} poços`;
      mapElements.mapsApiStatus.style.color = "var(--success)";
    }
    
  } catch (error) {
    log("Erro ao carregar poços com coordenadas", error);
    if (mapElements.mapsApiStatus) {
      mapElements.mapsApiStatus.textContent = "Erro";
      mapElements.mapsApiStatus.style.color = "var(--danger)";
    }
  }
}

// ===============================================
// EVENT LISTENERS - VIEWER
// ===============================================

function setupEventListeners() {
  elements.form.addEventListener("submit", generateProfile);
  elements.wellInput.addEventListener("change", handleWellSelection);
  elements.wellInput.addEventListener("input", handleWellInput);
  
  elements.hasLitoInput.addEventListener("change", (e) => {
    state.hasLito = e.target.checked;
    log("Litologia alterada", state.hasLito);
  });
  
  elements.downloadBtn.addEventListener("click", downloadImage);
  document.getElementById("copyBtn")?.addEventListener("click", copyLink);
  elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
  elements.toggleDebug.addEventListener("click", toggleDebug);
  elements.clearDebug.addEventListener("click", clearDebugPanel);
  
  document.addEventListener("keydown", handleKeyPress);
}

function handleWellInput(e) {
  const value = e.target.value;
  
  if (!value && state.selectedWell) {
    log("Resetando seleção de poço");
    state.selectedWell = null;
    state.availableCurves = [];
    state.selectedCurves = [];
    resetCurvesDisplay();
    elements.generateBtn.disabled = true;
  }
}

async function handleWellSelection(e) {
  const wellId = e.target.value;
  
  const well = state.wells.find(w => w.id === wellId);
  if (!well) {
    log("Poço não encontrado", wellId);
    return;
  }
  
  log("Poço selecionado", well);
  state.selectedWell = well;
  
  await loadWellCurves(wellId);
}

async function loadWellCurves(wellId) {
  try {
    clearError();
    
    elements.curvesContainer.innerHTML = "<div class=\"placeholder-text\">Carregando curvas...</div>";
    
    const response = await fetch(`${CONFIG.API_URL}/wells/${wellId}/curves`, {
      headers: getFetchHeaders()
    });
    
    if (response.status === 401) {
      showError("Não autenticado. Token inválido ou ausente.");
      log("Erro 401: Token inválido");
      clearToken();
      return;
    }
    
    const data = await response.json();
    
    if (data.curves && data.curves.length > 0) {
      state.availableCurves = data.curves;
      state.selectedCurves = [];
      displayCurveSelector(data.curves);
      log(`${data.curves.length} curvas disponíveis`);
    } else {
      elements.curvesContainer.innerHTML = "<div class=\"placeholder-text\">Nenhuma curva disponível</div>";
      log("Nenhuma curva encontrada");
    }
    
  } catch (error) {
    log("Erro ao carregar curvas", error);
    elements.curvesContainer.innerHTML = "<div class=\"placeholder-text\">Erro ao carregar curvas</div>";
  }
}

function displayCurveSelector(curves) {
  elements.curvesContainer.classList.add("has-curves");
  
  const chipsHTML = curves.map(curve => 
    `<button type="button" class="curve-chip" data-curve="${curve}">${curve}</button>`
  ).join("");
  
  elements.curvesContainer.innerHTML = `
    <div class="curves-selector">${chipsHTML}</div>
    <div class="selection-counter">
      <span id="selectionCount">0</span>/${state.maxCurves} curvas selecionadas
    </div>
  `;
  
  document.querySelectorAll(".curve-chip").forEach(chip => {
    chip.addEventListener("click", () => toggleCurveSelection(chip));
  });
}

function toggleCurveSelection(chip) {
  const curve = chip.dataset.curve;
  
  if (chip.classList.contains("selected")) {
    chip.classList.remove("selected");
    state.selectedCurves = state.selectedCurves.filter(c => c !== curve);
  } else {
    if (state.selectedCurves.length >= state.maxCurves) {
      showMaxReachedFeedback();
      return;
    }
    
    chip.classList.add("selected");
    state.selectedCurves.push(curve);
  }
  
  updateCurveSelectionUI();
  updateURL();
}

function updateCurveSelectionUI() {
  const count = state.selectedCurves.length;
  const counter = document.getElementById("selectionCount");
  if (counter) counter.textContent = count;
  
  const allChips = document.querySelectorAll(".curve-chip");
  
  if (count >= state.maxCurves) {
    allChips.forEach(chip => {
      if (!chip.classList.contains("selected")) {
        chip.classList.add("disabled");
      }
    });
  } else {
    allChips.forEach(chip => chip.classList.remove("disabled"));
  }
  
  elements.generateBtn.disabled = count === 0;
  
  log("Seleção atualizada", { count, curves: state.selectedCurves });
}

function showMaxReachedFeedback() {
  const container = document.querySelector(".curves-selector");
  container.classList.add("shake");
  setTimeout(() => container.classList.remove("shake"), 300);
}

function resetCurvesDisplay() {
  elements.curvesContainer.classList.remove("has-curves");
  elements.curvesContainer.innerHTML = "<div class=\"placeholder-text\">Selecione um poço primeiro</div>";
}

// ===============================================
// GERAR PERFIL
// ===============================================

async function generateProfile(e) {
  if (e) e.preventDefault();
  
  if (!state.selectedWell || state.selectedCurves.length === 0) {
    showError("Selecione um poço e pelo menos uma curva");
    return;
  }
  
  if (!state.accessToken) {
    showError("Token de autenticação não disponível. Recarregue a página com um link válido.");
    return;
  }
  
  const params = {
    well: state.selectedWell.id,
    curves: state.selectedCurves,
    hasLito: state.hasLito
  };
  
  log("Gerando perfil", params);
  state.lastParams = params;
  
  showLoading();
  
  try {
    const response = await fetch("/api/generate-profile", {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify(params)
    });
    
    if (response.status === 401) {
      throw new Error("Token inválido ou expirado. Solicite um novo link.");
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    
    displayImage(imageUrl, params);
    updateURL();
    
    log("Perfil gerado com sucesso");
    
  } catch (error) {
    console.error("Erro ao gerar perfil:", error);
    showError(error.message || "Erro ao gerar o perfil. Tente novamente.");
    
    if (error.message.includes("Token")) {
      clearToken();
    }
  } finally {
    hideLoading();
  }
}

function showLoading() {
  state.isLoading = true;
  elements.generateBtn.disabled = true;
  elements.btnText.classList.add("hidden");
  elements.btnLoader.classList.remove("hidden");
  
  elements.imageContainer.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Gerando perfil composto...</p>
        <p style="font-size: 0.75rem; margin-top: 0.5rem; color: #6b7280;">
          Processando dados do poço ${state.selectedWell.id}...
        </p>
      </div>
    </div>
  `;
  
  updateStatus("Processando...", "info");
}

function hideLoading() {
  state.isLoading = false;
  elements.generateBtn.disabled = false;
  elements.btnText.classList.remove("hidden");
  elements.btnLoader.classList.add("hidden");
}

function displayImage(imageUrl, params) {
  elements.imageContainer.innerHTML = `
    <img src="${imageUrl}" 
         alt="Perfil Composto - ${params.well}"
         style="max-width: 100%; height: auto;">
  `;
  
  elements.vizTitle.textContent = `Perfil: ${params.well}`;
  elements.downloadBtn.disabled = false;
  elements.fullscreenBtn.disabled = false;
  
  state.currentImageUrl = imageUrl;
  updateStatus("Perfil gerado com sucesso", "success");
  
  log("Perfil exibido", { well: params.well, curves: params.curves });
}

function updateURL() {
  if (!state.selectedWell || state.selectedCurves.length === 0) {
    window.history.replaceState({}, "", "/#viewer");
    return;
  }
  
  const params = new URLSearchParams();
  params.set("well", state.selectedWell.id);
  params.set("curves", state.selectedCurves.join(","));
  if (state.hasLito) params.set("lito", "true");
  
  const visibleURL = `/?${params.toString()}#viewer`;
  window.history.replaceState({}, "", visibleURL);
  
  const tokenPart = getTokenHashPart();
  const shareableURL = `${window.location.origin}/?${params.toString()}#${tokenPart}viewer`;
  elements.generatedLink.value = shareableURL;
  elements.linkPanel.classList.remove("hidden");
  
  log("URL atualizada", visibleURL);
}

async function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  
  const wellId = urlParams.get("well");
  const curvesParam = urlParams.get("curves");
  const hasLito = urlParams.get("lito") === "true";
  
  const wellsParam = urlParams.get("wells");
  if (wellsParam) {
    await processMapURLParams(wellsParam);
    return;
  }
  
  if (!wellId || !curvesParam) {
    log("Sem parâmetros na URL");
    return;
  }
  
  log("Parâmetros encontrados na URL", { wellId, curves: curvesParam, hasLito });
  
  if (state.wells.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const well = state.wells.find(w => w.id === wellId);
  if (!well) {
    log("Poço da URL não encontrado", wellId);
    return;
  }
  
  elements.wellInput.value = wellId;
  elements.hasLitoInput.checked = hasLito;
  state.hasLito = hasLito;
  state.selectedWell = well;
  
  await loadWellCurves(wellId);
  
  const curves = curvesParam.split(",");
  curves.forEach(curve => {
    const chip = document.querySelector(`[data-curve="${curve}"]`);
    if (chip && state.selectedCurves.length < state.maxCurves) {
      chip.click();
    }
  });
  
  if (state.selectedCurves.length > 0) {
    log("Gerando perfil automaticamente da URL");
    setTimeout(() => generateProfile(), 500);
  }
}

// ===============================================
// FUNÇÕES DE AÇÃO - VIEWER
// ===============================================

function downloadImage() {
  if (!state.currentImageUrl || !state.lastParams) return;
  
  const link = document.createElement("a");
  link.href = state.currentImageUrl;
  link.download = `perfil_${state.lastParams.well}_${Date.now()}.png`;
  link.click();
  
  log("Download iniciado", { well: state.lastParams.well });
}

function toggleFullscreen() {
  const img = elements.imageContainer.querySelector("img");
  if (!img) return;
  
  if (img.requestFullscreen) {
    img.requestFullscreen();
  } else if (img.webkitRequestFullscreen) {
    img.webkitRequestFullscreen();
  } else if (img.msRequestFullscreen) {
    img.msRequestFullscreen();
  }
  
  log("Tela cheia ativada");
}

function toggleDebug() {
  elements.debugPanel.classList.toggle("hidden");
}

function clearDebugPanel() {
  elements.debugContent.textContent = "";
  log("Debug limpo");
}

async function copyLink() {
  const input = elements.generatedLink;
  const btn = document.getElementById("copyBtn");
  
  await navigator.clipboard.writeText(input.value);
  
  const originalHTML = btn.innerHTML;
  btn.innerHTML = "✓";
  btn.style.background = "var(--success)";
  
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.background = "";
  }, 2000);
  
  log("Link copiado", input.value);
}

function handleKeyPress(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !state.isLoading) {
    if (state.currentTab === "viewer") {
      generateProfile();
    } else {
      generateMap();
    }
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === "d") {
    e.preventDefault();
    toggleDebug();
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && state.currentImageUrl) {
    e.preventDefault();
    downloadImage();
  }
}

// ===============================================
// MAPA - EVENT LISTENERS
// ===============================================

function setupMapEventListeners() {
  mapElements.addWellBtn.addEventListener("click", addWellToMap);
  
  mapElements.wellInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWellToMap();
    }
  });
  
  mapElements.generateMapBtn.addEventListener("click", generateMap);
  mapElements.clearMapBtn.addEventListener("click", clearMapSelection);
  mapElements.downloadMapBtn.addEventListener("click", downloadStaticMap);
  mapElements.copyMapLinkBtn?.addEventListener("click", copyMapLink);
}

// ===============================================
// MAPA - ADICIONAR/REMOVER POÇOS
// ===============================================

function addWellToMap() {
  const wellId = mapElements.wellInput.value.trim();
  
  if (!wellId) {
    log("Nenhum poço informado");
    return;
  }
  
  if (state.mapWells.find(w => w.id === wellId)) {
    log("Poço já está na lista", wellId);
    mapElements.wellInput.value = "";
    return;
  }
  
  if (state.mapWells.length >= CONFIG.MAX_MAP_WELLS) {
    showMapError(`Máximo de ${CONFIG.MAX_MAP_WELLS} poços por mapa`);
    return;
  }
  
  const well = state.geoWells.find(w => w.id === wellId);
  if (!well) {
    showMapError(`Poço "${wellId}" não encontrado ou sem coordenadas`);
    return;
  }
  
  state.mapWells.push(well);
  mapElements.wellInput.value = "";
  
  updateMapWellsDisplay();
  clearMapError();
  
  log("Poço adicionado ao mapa", well);
}

function removeWellFromMap(wellId) {
  state.mapWells = state.mapWells.filter(w => w.id !== wellId);
  updateMapWellsDisplay();
  log("Poço removido do mapa", wellId);
}

function clearMapSelection() {
  state.mapWells = [];
  state.mapWellsCoordinates = [];
  updateMapWellsDisplay();
  
  state.mapMarkers.forEach(marker => marker.setMap(null));
  state.mapMarkers = [];
  
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "flex";
  if (mapDiv) mapDiv.style.display = "none";
  
  mapElements.mapLinkPanel.classList.add("hidden");
  mapElements.downloadMapBtn.disabled = true;
  mapElements.mapTitle.textContent = "Mapa de Localização";
  
  log("Seleção de mapa limpa");
}

function updateMapWellsDisplay() {
  const count = state.mapWells.length;
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  mapElements.wellCount.textContent = `(${count})`;
  mapElements.mapStatusCount.textContent = count;
  mapElements.generateMapBtn.disabled = count === 0;
  
  if (count === 0) {
    mapElements.wellsList.innerHTML = "<div class=\"placeholder-text\">Nenhum poço selecionado</div>";
  } else {
    mapElements.wellsList.innerHTML = state.mapWells.map((well, index) => `
      <div class="map-well-item">
        <span class="well-label">
          <span class="well-marker">${labels[index]}</span>
          <span>${well.id}</span>
        </span>
        <button class="btn-remove" onclick="removeWellFromMap('${well.id}')" title="Remover">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join("");
  }
}

// ===============================================
// MAPA - CARREGAR GOOGLE MAPS API
// ===============================================

function loadGoogleMapsAPI() {
  return new Promise((resolve, reject) => {
    if (state.googleMapsLoaded && window.google && window.google.maps) {
      log("Google Maps API já carregada");
      resolve();
      return;
    }
    
    fetch("/api/maps-config")
      .then(response => {
        if (!response.ok) {
          throw new Error("Falha ao buscar configuração do Maps");
        }
        return response.json();
      })
      .then(config => {
        if (!config.apiKey) {
          throw new Error("Google Maps API Key não configurada no servidor");
        }
        
        log("API Key obtida, carregando Google Maps...");
        
        window.initGoogleMapsCallback = function() {
          log("Google Maps API carregada com sucesso");
          state.googleMapsLoaded = true;
          resolve();
        };
        
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${config.apiKey}&callback=initGoogleMapsCallback`;
        script.async = true;
        script.defer = true;
        
        script.onerror = function() {
          log("Erro ao carregar script do Google Maps");
          reject(new Error("Falha ao carregar Google Maps API"));
        };
        
        document.head.appendChild(script);
      })
      .catch(error => {
        log("Erro no loadGoogleMapsAPI", error.message);
        reject(error);
      });
  });
}

// ===============================================
// MAPA - GERAR
// ===============================================

async function generateMap() {
  if (state.mapWells.length === 0) {
    showMapError("Adicione pelo menos um poço");
    return;
  }
  
  clearMapError();
  showMapLoading();
  
  try {
    log("Verificando Google Maps API...");
    await loadGoogleMapsAPI();
    
    const wellNames = state.mapWells.map(w => w.id);
    log("Buscando coordenadas para poços", wellNames);
    
    const response = await fetch(`${CONFIG.API_URL}/wells-coordinates`, {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify({ wellNames })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    log("Coordenadas recebidas", data);
    
    displayMap(data);
    updateMapURL();
    
  } catch (error) {
    console.error("Erro ao gerar mapa:", error);
    showMapError(error.message || "Erro ao gerar mapa");
  } finally {
    hideMapLoading();
  }
}

function showMapLoading() {
  mapElements.generateMapBtn.disabled = true;
  mapElements.mapBtnText.classList.add("hidden");
  mapElements.mapBtnLoader.classList.remove("hidden");
  
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "none";
  if (mapDiv) mapDiv.style.display = "none";
  
  let loadingEl = document.getElementById("mapLoadingOverlay");
  if (!loadingEl) {
    loadingEl = document.createElement("div");
    loadingEl.id = "mapLoadingOverlay";
    loadingEl.className = "loading-overlay";
    loadingEl.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Carregando mapa...</p>
      </div>
    `;
    mapElements.mapContainer.appendChild(loadingEl);
  } else {
    loadingEl.style.display = "flex";
  }
}

function hideMapLoading() {
  mapElements.generateMapBtn.disabled = state.mapWells.length === 0;
  mapElements.mapBtnText.classList.remove("hidden");
  mapElements.mapBtnLoader.classList.add("hidden");
  
  const loadingEl = document.getElementById("mapLoadingOverlay");
  if (loadingEl) {
    loadingEl.style.display = "none";
  }
}

function displayMap(data) {
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  // Reordenar wells para corresponder à ordem de state.mapWells
  const wells = state.mapWells.map(mapWell => {
    return data.wells.find(w => w.name === mapWell.id) || null;
  }).filter(w => w !== null);
  
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "none";
  if (mapDiv) mapDiv.style.display = "block";
  
  const avgLat = wells.reduce((sum, w) => sum + w.lat, 0) / wells.length;
  const avgLng = wells.reduce((sum, w) => sum + w.lng, 0) / wells.length;
  
  const map = new google.maps.Map(mapDiv, {
    center: { lat: avgLat, lng: avgLng },
    zoom: 8,
    mapTypeId: "terrain"
  });
  
  state.mapInstance = map;
  
  state.mapMarkers.forEach(marker => marker.setMap(null));
  state.mapMarkers = [];
  
  const bounds = new google.maps.LatLngBounds();
  
  wells.forEach((well, index) => {
    const position = { lat: well.lat, lng: well.lng };
    
    const marker = new google.maps.Marker({
      position: position,
      map: map,
      label: {
        text: labels[index] || "",
        color: "white",
        fontWeight: "bold"
      },
      title: well.name
    });
    
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="padding: 8px;">
          <strong>${well.name}</strong><br>
          <small>Estado: ${well.state || "N/A"}</small><br>
          <small>Lat: ${well.lat.toFixed(6)}</small><br>
          <small>Lng: ${well.lng.toFixed(6)}</small>
        </div>
      `
    });
    
    marker.addListener("click", () => {
      infoWindow.open(map, marker);
    });
    
    state.mapMarkers.push(marker);
    bounds.extend(position);
  });
  
  if (wells.length > 1) {
    map.fitBounds(bounds);
    
    const listener = google.maps.event.addListener(map, "idle", () => {
      if (map.getZoom() > 14) {
        map.setZoom(14);
      }
      google.maps.event.removeListener(listener);
    });
  } else {
    map.setZoom(12);
  }
  
  state.mapWellsCoordinates = wells;
  
  mapElements.downloadMapBtn.disabled = false;
  mapElements.mapTitle.textContent = `Mapa: ${wells.length} poço(s)`;
  
  log("Mapa interativo exibido", { wellsCount: wells.length });
}

function updateMapURL() {
  const wellIds = state.mapWells.map(w => w.id).join(",");
  
  const visibleURL = `/?wells=${wellIds}#maps`;
  window.history.replaceState({}, "", visibleURL);
  
  const tokenPart = getTokenHashPart();
  const shareableURL = `${window.location.origin}/?wells=${wellIds}#${tokenPart}maps`;
  mapElements.generatedMapLink.value = shareableURL;
  mapElements.mapLinkPanel.classList.remove("hidden");
  
  log("URL do mapa atualizada", visibleURL);
}

async function processMapURLParams(wellsParam) {
  log("Processando parâmetros de mapa da URL", wellsParam);
  
  switchTab("maps");
  
  if (state.geoWells.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const wellIds = wellsParam.split(",");
  wellIds.forEach(wellId => {
    const well = state.geoWells.find(w => w.id === wellId.trim());
    if (well && !state.mapWells.find(w => w.id === well.id)) {
      state.mapWells.push(well);
    }
  });
  
  updateMapWellsDisplay();
  
  if (state.mapWells.length > 0) {
    log("Gerando mapa automaticamente da URL");
    setTimeout(() => generateMap(), 500);
  }
}

// ===============================================
// MAPA - DOWNLOAD ESTÁTICO
// ===============================================

async function downloadStaticMap() {
  if (!state.mapWellsCoordinates || state.mapWellsCoordinates.length === 0) {
    showMapError("Nenhuma coordenada disponível para download");
    return;
  }
  
  log("Iniciando download do mapa estático...");
  
  try {
    const response = await fetch(`${CONFIG.API_URL}/static-map`, {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify({ wells: state.mapWellsCoordinates })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.mapUrl) {
      throw new Error("URL do mapa não retornada");
    }
    
    log("URL do mapa estático obtida", data.mapUrl);
    
    const imgResponse = await fetch(data.mapUrl);
    const blob = await imgResponse.blob();
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mapa_pocos_${state.mapWellsCoordinates.length}_${Date.now()}.png`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    log("Download do mapa estático concluído");
    
  } catch (error) {
    console.error("Erro ao baixar mapa:", error);
    showMapError(error.message || "Erro ao baixar mapa estático");
  }
}

async function copyMapLink() {
  const input = mapElements.generatedMapLink;
  const btn = mapElements.copyMapLinkBtn;
  
  await navigator.clipboard.writeText(input.value);
  
  const originalHTML = btn.innerHTML;
  btn.innerHTML = "✓";
  btn.style.background = "var(--success)";
  
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.background = "";
  }, 2000);
  
  log("Link do mapa copiado", input.value);
}

// ===============================================
// INICIALIZAÇÃO
// ===============================================

document.addEventListener("DOMContentLoaded", async () => {
  log("Iniciando aplicação v5.0");
  
  loadToken();
  
  if (state.accessToken) {
    log("Token carregado com sucesso", { length: state.accessToken.length });
    updateStatus("Autenticado", "success");
  } else {
    log("Nenhum token disponível - modo limitado");
    updateStatus("Sem autenticação", "warning");
  }
  
  setupTabNavigation();
  
  const initialTab = getTabFromHash() || "viewer";
  switchTab(initialTab);
  
  await checkAPIHealth();
  
  await Promise.all([
    loadWells(),
    loadGeoWells()
  ]);
  
  setupEventListeners();
  setupMapEventListeners();
  
  await checkURLParams();
  
  log("Aplicação inicializada");
});

// EXPORTAR PARA DEBUGGING GLOBAL
window.CurvesAPI = {
  state,
  CONFIG,
  generateProfile,
  generateMap,
  log,
  clearToken,
  loadToken,
  switchTab,
  removeWellFromMap,
  downloadStaticMap
};

window.removeWellFromMap = removeWellFromMap;
/* global google, markerClusterer, OverlappingMarkerSpiderfier */

// ===============================================
// K2 SISTEMAS - VISUALIZADOR DE POÇOS
// Versão 7.0 - Comportamento unificado
// ===============================================

// CONFIGURAÇÃO E ESTADO GLOBAL
const CONFIG = {
  API_URL: "/api",
  DEBUG_MODE: true
  // Limite de 25 poços removido na v6.0
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
  geoWells: [],         // Todos os poços com coordenadas (do PostgreSQL)
  mapWells: [],          // Poços selecionados para o mapa atual
  mapWellsCoordinates: [],
  mapInstance: null,
  mapMarkers: [],
  mapClusterer: null,
  mapSpiderfier: null,      // MarkerClusterer para muitos poços
  googleMapsLoaded: false,
  currentSessionId: null, // ID da sessão salva no banco
  
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
  generatedMapLink: document.getElementById("generatedMapLink"),
  // Novos elementos - Filtros por Bacia/Campo
  baciaSelect: document.getElementById("baciaSelect"),
  campoSelect: document.getElementById("campoSelect"),
  addByFilterBtn: document.getElementById("addByFilterBtn"),
  filterCount: document.getElementById("filterCount")
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
      log("Erro 401 na API DLIS - token pode ser inválido ou API inacessível");
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
  }
}

// ===============================================
// CARREGAR LISTA DE POÇOS COM COORDENADAS (PostgreSQL - para Mapas)
// Agora inclui Bacia e Campo para popular os filtros
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
    
    // Popular datalist de poços individuais
    mapElements.wellsDatalist.innerHTML = wells.map(well => 
      `<option value="${well.id}">${well.name} (${well.state})</option>`
    ).join("");
    
    if (mapElements.mapsApiStatus) {
      mapElements.mapsApiStatus.textContent = `${wells.length} poços`;
      mapElements.mapsApiStatus.style.color = "var(--success)";
    }
    
    // Popular dropdown de Bacias (valores únicos, ordenados)
    populateBasinFilter();
    
  } catch (error) {
    log("Erro ao carregar poços com coordenadas", error);
    if (mapElements.mapsApiStatus) {
      mapElements.mapsApiStatus.textContent = "Erro";
      mapElements.mapsApiStatus.style.color = "var(--danger)";
    }
  }
}

// ===============================================
// FILTROS POR BACIA E CAMPO
// ===============================================

/**
 * Popula o dropdown de Bacias com valores únicos dos poços carregados
 */
function populateBasinFilter() {
  // Extrair bacias únicas (ignorar vazias)
  const bacias = [...new Set(
    state.geoWells
      .map(w => w.bacia)
      .filter(b => b && b.trim() !== "")
  )].sort();
  
  log(`${bacias.length} bacias encontradas`);
  
  // Popular o select de bacias
  mapElements.baciaSelect.innerHTML = 
    "<option value=\"\">Selecione uma bacia...</option>" +
    bacias.map(b => `<option value="${b}">${b}</option>`).join("");
}

/**
 * Quando uma bacia é selecionada, popula o dropdown de Campos
 * correspondentes àquela bacia
 */
function onBaciaChange() {
  const selectedBacia = mapElements.baciaSelect.value;
  
  // Resetar campo
  mapElements.campoSelect.innerHTML = "<option value=\"\">Todos os campos</option>";
  mapElements.campoSelect.disabled = !selectedBacia;
  
  if (!selectedBacia) {
    updateFilterCount();
    return;
  }
  
  // Extrair campos únicos da bacia selecionada
  const campos = [...new Set(
    state.geoWells
      .filter(w => w.bacia === selectedBacia)
      .map(w => w.campo)
      .filter(c => c && c.trim() !== "")
  )].sort();
  
  log(`${campos.length} campos na bacia ${selectedBacia}`);
  
  // Popular o select de campos
  mapElements.campoSelect.innerHTML = 
    "<option value=\"\">Todos os campos</option>" +
    campos.map(c => `<option value="${c}">${c}</option>`).join("");
  
  updateFilterCount();
}

/**
 * Atualiza o contador de poços que serão adicionados pelo filtro
 */
function updateFilterCount() {
  const count = getFilteredWells().length;
  
  if (mapElements.filterCount) {
    // Ícone de pin SVG para exibir ao lado do contador
    const pinIcon = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path><circle cx=\"12\" cy=\"10\" r=\"3\"></circle></svg>";
    
    if (count > 0) {
      mapElements.filterCount.innerHTML = `${pinIcon} ${count} poço(s) encontrado(s)`;
      mapElements.filterCount.classList.add("has-results");
    } else {
      mapElements.filterCount.innerHTML = "Selecione uma bacia";
      mapElements.filterCount.classList.remove("has-results");
    }
  }
  
  // Habilitar/desabilitar botão de adicionar
  if (mapElements.addByFilterBtn) {
    mapElements.addByFilterBtn.disabled = count === 0;
  }
}

/**
 * Retorna os poços que correspondem aos filtros selecionados
 */
function getFilteredWells() {
  const selectedBacia = mapElements.baciaSelect.value;
  const selectedCampo = mapElements.campoSelect.value;
  
  if (!selectedBacia) return [];
  
  return state.geoWells.filter(w => {
    // Filtrar por bacia
    if (w.bacia !== selectedBacia) return false;
    // Filtrar por campo (se selecionado)
    if (selectedCampo && w.campo !== selectedCampo) return false;
    return true;
  });
}

/**
 * Adiciona todos os poços do filtro à seleção do mapa
 */
function addWellsByFilter() {
  const filteredWells = getFilteredWells();
  
  if (filteredWells.length === 0) {
    showMapError("Nenhum poço corresponde ao filtro selecionado");
    return;
  }
  
  let added = 0;
  
  filteredWells.forEach(well => {
    // Só adicionar se ainda não estiver na lista
    if (!state.mapWells.find(w => w.id === well.id)) {
      state.mapWells.push(well);
      added++;
    }
  });
  
  updateMapWellsDisplay();
  clearMapError();
  
  const bacia = mapElements.baciaSelect.value;
  const campo = mapElements.campoSelect.value;
  const filterDesc = campo ? `${campo} (${bacia})` : bacia;
  
  log(`${added} poços adicionados pelo filtro`, { 
    filtro: filterDesc, 
    total: state.mapWells.length 
  });
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
  
  // NOVO: Verificar se há um ID de sessão na URL
  const sessionId = urlParams.get("sid");
  if (sessionId) {
    await processSessionURLParam(sessionId);
    return;
  }
  
  // Compatibilidade: formato antigo com ?wells=
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
  
  // Event listeners dos filtros por Bacia/Campo
  mapElements.baciaSelect.addEventListener("change", () => {
    onBaciaChange();
  });
  mapElements.campoSelect.addEventListener("change", () => {
    updateFilterCount();
  });
  mapElements.addByFilterBtn.addEventListener("click", addWellsByFilter);
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
  // Remover marcador do clusterer, spiderfier e mapa
  const markerIndex = state.mapMarkers.findIndex(m => m.wellId === wellId);
  if (markerIndex >= 0) {
    const marker = state.mapMarkers[markerIndex];
    if (state.mapSpiderfier) {
      state.mapSpiderfier.removeMarker(marker);
    }
    if (state.mapClusterer) {
      state.mapClusterer.removeMarker(marker);
    } else {
      marker.setMap(null);
    }
    state.mapMarkers.splice(markerIndex, 1);
  }
  
  state.mapWells = state.mapWells.filter(w => w.id !== wellId);
  updateMapWellsDisplay();
  log("Poço removido do mapa", wellId);
}

function clearMapSelection() {
  state.mapWells = [];
  state.mapWellsCoordinates = [];
  state.currentSessionId = null;
  updateMapWellsDisplay();
  
  // Limpar clusterer se ativo
  if (state.mapClusterer) {
    state.mapClusterer.clearMarkers();
    state.mapClusterer = null;
  }
  
  if (state.mapSpiderfier) {
    state.mapSpiderfier = null;
  }
  
  state.mapMarkers.forEach(marker => marker.setMap(null));
  state.mapMarkers = [];
  
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "flex";
  if (mapDiv) mapDiv.style.display = "none";
  
  mapElements.mapLinkPanel.classList.add("hidden");
  mapElements.downloadMapBtn.disabled = true;
  mapElements.mapTitle.textContent = "Mapa de Localização";
  
  // Resetar filtros
  mapElements.baciaSelect.value = "";
  mapElements.campoSelect.innerHTML = "<option value=\"\">Todos os campos</option>";
  mapElements.campoSelect.disabled = true;
  updateFilterCount();
  
  log("Seleção de mapa limpa");
}

function updateMapWellsDisplay() {
  const count = state.mapWells.length;
  
  mapElements.wellCount.textContent = `(${count})`;
  mapElements.mapStatusCount.textContent = count;
  mapElements.generateMapBtn.disabled = count === 0;
  
  if (count === 0) {
    mapElements.wellsList.innerHTML = "<div class=\"placeholder-text\">Nenhum poço selecionado</div>";
    return;
  }
  
  // Sempre agrupa por Bacia - Campo
  const groups = {};
  state.mapWells.forEach(well => {
    const bacia = well.bacia || "Sem Bacia";
    const campo = well.campo || "Sem Campo";
    const groupKey = `${bacia} - ${campo}`;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(well);
  });
  
  const sortedGroups = Object.keys(groups).sort();
  
  mapElements.wellsList.innerHTML = sortedGroups.map(groupName => {
    const groupWells = groups[groupName];
    const groupId = groupName.replace(/[^a-zA-Z0-9]/g, "_");
    
    return `
      <div class="well-group">
        <div class="well-group-header" onclick="toggleWellGroup('${groupId}')">
          <svg class="well-group-arrow" id="arrow-${groupId}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="well-group-name">${groupName}</span>
          <span class="well-group-count">${groupWells.length}</span>
        </div>
        <div class="well-group-items" id="group-${groupId}" style="display: none;">
          ${groupWells.map(well => `
            <div class="map-well-item">
              <span class="well-label">
                <span class="well-marker-dot"></span>
                <span>${well.id}</span>
              </span>
              <button class="btn-remove" onclick="removeWellFromMap('${well.id}')" title="Remover">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Expande/recolhe um grupo de poços na sidebar
 */
function toggleWellGroup(groupId) {
  const items = document.getElementById(`group-${groupId}`);
  const arrow = document.getElementById(`arrow-${groupId}`);
  
  if (!items || !arrow) return;
  
  if (items.style.display === "none") {
    items.style.display = "block";
    arrow.classList.add("expanded");
  } else {
    items.style.display = "none";
    arrow.classList.remove("expanded");
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
    log("Buscando coordenadas para poços", { count: wellNames.length });
    
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
    log("Coordenadas recebidas", { count: data.count });
    
    displayMap(data);
    
    // Criar sessão no banco e gerar link curto
    await updateMapURLWithSession();
    
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
  
  // Limpar marcadores, clusterer e spiderfier antigos
  state.mapMarkers.forEach(marker => marker.setMap(null));
  state.mapMarkers = [];
  if (state.mapClusterer) {
    state.mapClusterer.clearMarkers();
    state.mapClusterer = null;
  }
  state.mapSpiderfier = null;
  
  const bounds = new google.maps.LatLngBounds();
  
  // Inicializar Spiderfier para separar marcadores sobrepostos
  // Quando dois poços têm coordenadas iguais/próximas, o clique abre em leque
  let oms = null;
  if (window.OverlappingMarkerSpiderfier) {
    oms = new OverlappingMarkerSpiderfier(map, {
      markersWontMove: true,
      markersWontHide: true,
      basicFormatEvents: true,
      keepSpiderfied: true
    });
    state.mapSpiderfier = oms;
    log("Spiderfier inicializado");
  }
  
  // InfoWindow compartilhado - só um aberto por vez
  const sharedInfoWindow = new google.maps.InfoWindow();
  
  // Ícone padrão com labelOrigin posicionado abaixo do pin
  // Isso faz a etiqueta com nome do poço aparecer embaixo do marcador
  const pinIcon = {
    url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
    scaledSize: new google.maps.Size(32, 32),
    labelOrigin: new google.maps.Point(16, 44)
  };
  
  wells.forEach((well) => {
    const position = { lat: well.lat, lng: well.lng };
    
    // Buscar dados completos (bacia, campo) do geoWells
    const fullWell = state.mapWells.find(mw => mw.id === well.name);
    const bacia = fullWell ? fullWell.bacia : "";
    const campo = fullWell ? fullWell.campo : "";
    
    const markerOptions = {
      position: position,
      // Clusterer gerencia a exibição - não adiciona direto ao mapa
      map: null,
      title: well.name,
      icon: pinIcon,
      // Nome do poço como label com classe CSS para fundo escuro
      label: {
        text: well.name,
        className: "well-pin-label"
      }
    };
    
    const marker = new google.maps.Marker(markerOptions);
    marker.wellId = well.name;
    
    // Guardar conteúdo do InfoWindow no marcador para o spiderfier usar
    marker.infoContent = `
      <div style="font-family: 'Inter', -apple-system, sans-serif; width: 240px;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 14px; text-align: center;">
          <div style="font-size: 0.9375rem; font-weight: 600;">${well.name}</div>
        </div>
        <div style="padding: 12px;">
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 0.8125rem; color: #374151;">
            ${bacia ? `<span style="color: #6b7280; font-weight: 500;">Bacia</span><span>${bacia}</span>` : ""}
            ${campo ? `<span style="color: #6b7280; font-weight: 500;">Campo</span><span>${campo}</span>` : ""}
            <span style="color: #6b7280; font-weight: 500;">Estado</span><span>${well.state || "N/A"}</span>
            <span style="color: #6b7280; font-weight: 500;">Lat</span><span>${well.lat.toFixed(6)}</span>
            <span style="color: #6b7280; font-weight: 500;">Lng</span><span>${well.lng.toFixed(6)}</span>
          </div>
          ${state.wells.find(w => w.id === well.name)
    ? `<button onclick="viewWellProfile('${well.name}')"
                style="margin-top: 10px; width: 100%; padding: 7px; background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; border: none; border-radius: 4px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; font-family: 'Inter', -apple-system, sans-serif;">
                Ver Perfil
              </button>`
    : `<button disabled
                style="margin-top: 10px; width: 100%; padding: 7px; background: #d1d5db; color: #6b7280; border: none; border-radius: 4px; font-size: 0.8125rem; font-weight: 500; cursor: not-allowed; font-family: 'Inter', -apple-system, sans-serif;">
                Sem dados DLIS
              </button>`
}
        </div>
      </div>
    `;
    
    // Se spiderfier disponível, ele gerencia os cliques
    // Senão, fallback com click listener direto
    if (oms) {
      oms.addMarker(marker);
    } else {
      marker.addListener("click", () => {
        sharedInfoWindow.setContent(marker.infoContent);
        sharedInfoWindow.open(map, marker);
      });
    }
    
    state.mapMarkers.push(marker);
    bounds.extend(position);
  });
  
  // Configurar evento de clique do spiderfier
  // Abre o InfoWindow do marcador clicado (mesmo quando "spiderfied")
  if (oms) {
    oms.addListener("click", (marker) => {
      sharedInfoWindow.setContent(marker.infoContent);
      sharedInfoWindow.open(map, marker);
    });
  }
  
  // Sempre usar MarkerClusterer
  if (window.markerClusterer) {
    state.mapClusterer = new markerClusterer.MarkerClusterer({
      map,
      markers: state.mapMarkers
    });
    log("MarkerClusterer ativado", { markers: state.mapMarkers.length });
  }
  
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

/**
 * Abre a aba de Perfis com o poço selecionado
 * Chamado pelo botão "Ver Perfil" no InfoWindow do mapa
 */
function viewWellProfile(wellId) {
  // Mudar para a aba de perfis
  switchTab("viewer");
  
  // Preencher o input com o poço
  elements.wellInput.value = wellId;
  
  // Tentar encontrar o poço na lista de DLIS
  const well = state.wells.find(w => w.id === wellId);
  if (well) {
    state.selectedWell = well;
    loadWellCurves(wellId);
    log("Perfil aberto do mapa", wellId);
  } else {
    log("Poço não encontrado na lista DLIS (pode não ter DLIS)", wellId);
  }
}

// ===============================================
// MAPA - URL COM SESSÃO
// Sempre cria sessão no banco para links limpos
// Mantém compatibilidade com formato antigo ?wells=
// ===============================================

/**
 * Cria sessão no banco e atualiza URL com ?sid=
 */
async function updateMapURLWithSession() {
  try {
    const wellIds = state.mapWells.map(w => w.id);
    
    // Montar filtros usados (para referência futura)
    const filters = {};
    if (mapElements.baciaSelect.value) {
      filters.bacia = mapElements.baciaSelect.value;
    }
    if (mapElements.campoSelect.value) {
      filters.campo = mapElements.campoSelect.value;
    }
    
    // Criar sessão no banco
    const response = await fetch(`${CONFIG.API_URL}/map-sessions`, {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify({
        wells: wellIds,
        filters: Object.keys(filters).length > 0 ? filters : null
      })
    });
    
    if (!response.ok) {
      throw new Error("Falha ao criar sessão");
    }
    
    const data = await response.json();
    state.currentSessionId = data.sessionId;
    
    // Atualizar URL do navegador (sem token, para exibição limpa)
    const visibleURL = `/?sid=${data.sessionId}#maps`;
    window.history.replaceState({}, "", visibleURL);
    
    // Gerar link compartilhável (com token)
    const tokenPart = getTokenHashPart();
    const shareableURL = `${window.location.origin}/?sid=${data.sessionId}#${tokenPart}maps`;
    mapElements.generatedMapLink.value = shareableURL;
    mapElements.mapLinkPanel.classList.remove("hidden");
    
    log("Sessão criada e URL atualizada", { 
      sessionId: data.sessionId, 
      wellCount: data.wellCount 
    });
    
  } catch (error) {
    // Fallback: usar formato antigo com ?wells= se sessão falhar
    log("Erro ao criar sessão, usando formato antigo", error.message);
    updateMapURLLegacy();
  }
}

/**
 * Formato antigo de URL (fallback caso sessão falhe)
 */
function updateMapURLLegacy() {
  const wellIds = state.mapWells.map(w => w.id).join(",");
  
  const visibleURL = `/?wells=${wellIds}#maps`;
  window.history.replaceState({}, "", visibleURL);
  
  const tokenPart = getTokenHashPart();
  const shareableURL = `${window.location.origin}/?wells=${wellIds}#${tokenPart}maps`;
  mapElements.generatedMapLink.value = shareableURL;
  mapElements.mapLinkPanel.classList.remove("hidden");
  
  log("URL do mapa atualizada (formato legado)", visibleURL);
}

/**
 * NOVO: Processar parâmetro ?sid= da URL
 * Busca sessão no banco e carrega os poços
 */
async function processSessionURLParam(sessionId) {
  log("Processando sessão da URL", sessionId);
  
  switchTab("maps");
  
  try {
    // Buscar sessão no banco
    const response = await fetch(`${CONFIG.API_URL}/map-sessions/${sessionId}`, {
      headers: getFetchHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        showMapError("Link expirado ou inválido. A sessão não foi encontrada.");
      } else {
        showMapError("Erro ao carregar sessão do mapa.");
      }
      return;
    }
    
    const data = await response.json();
    state.currentSessionId = data.sessionId;
    
    log(`Sessão encontrada: ${data.wellCount} poços`, data.filters);
    
    // Aguardar carregamento dos poços geo se necessário
    if (state.geoWells.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Adicionar poços da sessão à seleção
    data.wells.forEach(wellId => {
      const well = state.geoWells.find(w => w.id === wellId);
      if (well && !state.mapWells.find(w => w.id === well.id)) {
        state.mapWells.push(well);
      }
    });
    
    updateMapWellsDisplay();
    
    if (state.mapWells.length > 0) {
      log("Gerando mapa automaticamente da sessão");
      setTimeout(() => generateMap(), 500);
    }
    
  } catch (error) {
    log("Erro ao processar sessão", error.message);
    showMapError("Erro ao carregar mapa compartilhado.");
  }
}

/**
 * Compatibilidade: processar formato antigo ?wells=
 */
async function processMapURLParams(wellsParam) {
  log("Processando parâmetros de mapa da URL (formato legado)", wellsParam);
  
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
  log("Iniciando aplicação v6.0");
  
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
  
  // Esconder overlay de carregamento com fade
  const appOverlay = document.getElementById("appLoadingOverlay");
  if (appOverlay) {
    appOverlay.classList.add("fade-out");
    setTimeout(() => appOverlay.remove(), 300);
  }
  
  log("Aplicação inicializada v7.0");
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
  downloadStaticMap,
  viewWellProfile
};

window.removeWellFromMap = removeWellFromMap;
window.toggleWellGroup = toggleWellGroup;
window.viewWellProfile = viewWellProfile;
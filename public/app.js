// ===============================================
// K2 SISTEMAS - VISUALIZADOR DE POÇOS
// Versão 8.0 - Modular
//
// Estrutura de arquivos:
//   app.js              → Core: estado, config, DOM, token, abas, utils, init
//   profile-viewer.js   → Aba Perfis: curvas, geração de perfil, imagem
//   map-google.js       → Aba Google Maps: marcadores, clusters, sessões
//   map-arcgis.js       → Aba ArcGIS: FeatureLayer, clustering nativo
//
// Ordem de carregamento no HTML:
//   app.js → profile-viewer.js → map-google.js → map-arcgis.js
// ===============================================

// ===============================================
// CONFIGURAÇÃO GLOBAL
// ===============================================

const CONFIG = {
  API_URL: "/api",
  DEBUG_MODE: true
};

// ===============================================
// ESTADO GLOBAL (compartilhado por todos os módulos)
// ===============================================

const state = {
  // ===== VIEWER (Perfis) =====
  wells: [],              // Poços DLIS disponíveis (API K2)
  selectedWell: null,      // Poço selecionado para perfil
  availableCurves: [],     // Curvas disponíveis do poço selecionado
  selectedCurves: [],      // Curvas escolhidas pelo usuário
  maxCurves: 3,            // Máximo de curvas por perfil
  hasLito: true,           // Incluir litologia no perfil
  isLoading: false,        // Flag de loading do perfil
  currentImageUrl: null,   // URL da imagem do perfil gerado
  lastParams: null,        // Últimos parâmetros usados na geração

  // ===== MAPA (Google Maps) =====
  geoWells: [],            // Todos os poços com coordenadas (PostgreSQL)
  mapWells: [],            // Poços selecionados para o mapa atual
  mapWellsCoordinates: [], // Coordenadas dos poços exibidos
  mapInstance: null,        // Instância do google.maps.Map
  mapMarkers: [],           // Marcadores no mapa
  mapClusterer: null,       // MarkerClusterer
  mapSpiderfier: null,      // OverlappingMarkerSpiderfier
  googleMapsLoaded: false,  // Flag de carregamento da API
  currentSessionId: null,   // ID da sessão salva no banco

  // ===== NAVEGAÇÃO =====
  currentTab: "viewer",

  // ===== ARCGIS =====
  arcgisMapView: null,     // Instância do MapView
  arcgisLayer: null,        // FeatureLayer de poços
  arcgisLoaded: false,      // Flag de carregamento

  // ===== AUTENTICAÇÃO =====
  accessToken: null
};

// ===============================================
// ELEMENTOS DO DOM - VIEWER
// ===============================================

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

// ===============================================
// ELEMENTOS DO DOM - MAPA (Google Maps)
// ===============================================

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
  baciaSelect: document.getElementById("baciaSelect"),
  campoSelect: document.getElementById("campoSelect"),
  addByFilterBtn: document.getElementById("addByFilterBtn"),
  filterCount: document.getElementById("filterCount")
};

// ===============================================
// ELEMENTOS DO DOM - ABAS
// ===============================================

const tabElements = {
  tabButtons: document.querySelectorAll(".tab-btn"),
  viewerContent: document.getElementById("viewer-content"),
  mapsContent: document.getElementById("maps-content"),
  arcgisContent: document.getElementById("arcgis-content")
};

// ===============================================
// ELEMENTOS DO DOM - ARCGIS
// ===============================================

const arcgisElements = {
  generateBtn: document.getElementById("generateArcGISBtn"),
  btnText: document.getElementById("arcgisBtnText"),
  btnLoader: document.getElementById("arcgisBtnLoader"),
  clearBtn: document.getElementById("clearArcGISBtn"),
  mapContainer: document.getElementById("arcgisMapContainer"),
  mapDiv: document.getElementById("arcgisMap"),
  placeholder: document.getElementById("arcgisPlaceholder"),
  title: document.getElementById("arcgisTitle"),
  wellInfo: document.getElementById("arcgisWellInfo"),
  wellCount: document.getElementById("arcgisWellCount"),
  apiStatus: document.getElementById("arcgisApiStatus"),
  errorContainer: document.getElementById("arcgisErrorContainer"),
  errorText: document.getElementById("arcgisErrorText")
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
  if (hash.includes("arcgis")) return "arcgis";
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

  tabElements.viewerContent.classList.remove("active");
  tabElements.mapsContent.classList.remove("active");
  tabElements.arcgisContent.classList.remove("active");

  if (tabName === "viewer") {
    tabElements.viewerContent.classList.add("active");
  } else if (tabName === "maps") {
    tabElements.mapsContent.classList.add("active");
  } else if (tabName === "arcgis") {
    tabElements.arcgisContent.classList.add("active");
    updateArcGISWellInfo();
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
// FUNÇÕES UTILITÁRIAS
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

    // Popular dropdown de Bacias
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
// FILTROS POR BACIA (população inicial)
// ===============================================

function populateBasinFilter() {
  const bacias = [...new Set(
    state.geoWells
      .map(w => w.bacia)
      .filter(b => b && b.trim() !== "")
  )].sort();

  log(`${bacias.length} bacias encontradas`);

  mapElements.baciaSelect.innerHTML =
    "<option value=\"\">Selecione uma bacia...</option>" +
    bacias.map(b => `<option value="${b}">${b}</option>`).join("");
}

// ===============================================
// ROTEADOR DE URL (despacha para viewer ou mapa)
// ===============================================

async function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);

  const wellId = urlParams.get("well");
  const curvesParam = urlParams.get("curves");
  const hasLito = urlParams.get("lito") === "true";

  // Verificar se há um ID de sessão na URL (mapa)
  const sessionId = urlParams.get("sid");
  if (sessionId) {
    await processSessionURLParam(sessionId);
    return;
  }

  // Compatibilidade: formato antigo com ?wells= (mapa)
  const wellsParam = urlParams.get("wells");
  if (wellsParam) {
    await processMapURLParams(wellsParam);
    return;
  }

  // Parâmetros de perfil
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
// ATALHOS DE TECLADO (despacho entre abas)
// ===============================================

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
// INICIALIZAÇÃO
// ===============================================

document.addEventListener("DOMContentLoaded", async () => {
  log("Iniciando aplicação v8.0 (modular)");

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

  // Setup de cada módulo (funções definidas nos respectivos arquivos)
  setupEventListeners();        // profile-viewer.js
  setupMapEventListeners();     // map-google.js
  setupArcGISEventListeners();  // map-arcgis.js

  await checkURLParams();

  // Esconder overlay de carregamento com fade
  const appOverlay = document.getElementById("appLoadingOverlay");
  if (appOverlay) {
    appOverlay.classList.add("fade-out");
    setTimeout(() => appOverlay.remove(), 300);
  }

  log("Aplicação inicializada v8.0");
});

// ===============================================
// EXPORTAR PARA DEBUGGING GLOBAL
// ===============================================

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

// Funções chamadas via onclick no HTML gerado dinamicamente
window.removeWellFromMap = removeWellFromMap;
window.removeBaciaFromMap = removeBaciaFromMap;
window.removeCampoFromMap = removeCampoFromMap;
window.toggleWellGroup = toggleWellGroup;
window.viewWellProfile = viewWellProfile;
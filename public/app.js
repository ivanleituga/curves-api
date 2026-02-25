/* global google */
// ===============================================
// K2 SISTEMAS - VISUALIZADOR DE POÇOS
// app.js - Lógica principal (Perfis + Mapas)
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
  mapWells: [],           // Poços selecionados para o mapa
  mapWellsCoordinates: [], // Coordenadas dos poços no mapa
  mapInstance: null,      // Instância do Google Maps
  mapMarkers: [],         // Marcadores no mapa
  googleMapsLoaded: false, // Flag para saber se API foi carregada
  
  // ===== NAVEGAÇÃO =====
  currentTab: "viewer",   // "viewer" ou "maps"
  
  // ===== AUTENTICAÇÃO =====
  accessToken: null
};

// ELEMENTOS DO DOM - VIEWER
const elements = {
  // Form
  form: document.getElementById("profileForm"),
  wellInput: document.getElementById("wellInput"),
  wellsList: document.getElementById("wells-list"),
  curvesContainer: document.getElementById("curvesContainer"),
  hasLitoInput: document.getElementById("hasLitoInput"),
  
  // Buttons
  generateBtn: document.getElementById("generateBtn"),
  btnText: document.getElementById("btnText"),
  btnLoader: document.getElementById("btnLoader"),
  downloadBtn: document.getElementById("downloadBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  toggleDebug: document.getElementById("toggleDebug"),
  clearDebug: document.getElementById("clearDebug"),
  
  // Display areas
  imageContainer: document.getElementById("imageContainer"),
  vizTitle: document.getElementById("vizTitle"),
  errorContainer: document.getElementById("errorContainer"),
  errorText: document.getElementById("errorText"),
  
  // Status
  statusText: document.getElementById("statusText"),
  lastUpdate: document.getElementById("lastUpdate"),
  apiStatus: document.getElementById("apiStatus"),
  
  // Link
  linkPanel: document.getElementById("linkPanel"),
  generatedLink: document.getElementById("generatedLink"),
  
  // Debug
  debugPanel: document.getElementById("debugPanel"),
  debugContent: document.getElementById("debugContent")
};

// ELEMENTOS DO DOM - MAPA
const mapElements = {
  // Inputs
  wellInput: document.getElementById("mapWellInput"),
  wellsDatalist: document.getElementById("map-wells-datalist"),
  wellsList: document.getElementById("mapWellsList"),
  wellCount: document.getElementById("mapWellCount"),
  
  // Buttons
  addWellBtn: document.getElementById("addWellBtn"),
  generateMapBtn: document.getElementById("generateMapBtn"),
  mapBtnText: document.getElementById("mapBtnText"),
  mapBtnLoader: document.getElementById("mapBtnLoader"),
  clearMapBtn: document.getElementById("clearMapBtn"),
  openGoogleMapsBtn: document.getElementById("openGoogleMapsBtn"),
  copyMapLinkBtn: document.getElementById("copyMapLinkBtn"),
  
  // Display areas
  mapContainer: document.getElementById("mapContainer"),
  mapTitle: document.getElementById("mapTitle"),
  mapLegend: document.getElementById("mapLegend"),
  legendContent: document.getElementById("legendContent"),
  mapErrorContainer: document.getElementById("mapErrorContainer"),
  mapErrorText: document.getElementById("mapErrorText"),
  
  // Status
  mapStatusCount: document.getElementById("mapStatusCount"),
  mapsApiStatus: document.getElementById("mapsApiStatus"),
  
  // Link
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

/**
 * Extrai token do hash fragment da URL
 * Formato esperado: #token=abc123...
 */
function extractTokenFromHash() {
  const hash = window.location.hash;
  
  if (!hash || !hash.includes("token=")) {
    log("Nenhum token encontrado no hash");
    return null;
  }
  
  // Extrair token do hash (#token=abc123)
  const match = hash.match(/token=([^&]+)/);
  
  if (match && match[1]) {
    const token = match[1];
    log("Token extraído do hash", { length: token.length });
    
    // Limpar hash da URL (segurança visual) - manter a aba se existir
    const currentTab = getTabFromHash();
    const newHash = currentTab ? `#${currentTab}` : "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search + newHash);
    
    return token;
  }
  
  return null;
}

/**
 * Carrega token do sessionStorage ou hash
 */
function loadToken() {
  // Primeiro, tenta extrair do hash (prioridade)
  const hashToken = extractTokenFromHash();
  
  if (hashToken) {
    log("Token encontrado no hash, armazenando em sessão");
    sessionStorage.setItem("api_token", hashToken);
    state.accessToken = hashToken;
    return hashToken;
  }
  
  // Se não há token no hash, tenta recuperar do sessionStorage
  const storedToken = sessionStorage.getItem("api_token");
  
  if (storedToken) {
    log("Token recuperado do sessionStorage");
    state.accessToken = storedToken;
    return storedToken;
  }
  
  log("Nenhum token disponível", null);
  return null;
}

/**
 * Remove token da sessão
 */
function clearToken() {
  sessionStorage.removeItem("api_token");
  state.accessToken = null;
  log("Token removido da sessão");
}

/**
 * Adiciona Authorization header nas requisições
 */
function getFetchHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  
  if (state.accessToken) {
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  }
  
  return headers;
}

// ===============================================
// NAVEGAÇÃO POR ABAS
// ===============================================

/**
 * Extrai a aba do hash da URL
 */
function getTabFromHash() {
  const hash = window.location.hash;
  if (hash.includes("maps")) return "maps";
  if (hash.includes("viewer")) return "viewer";
  return null;
}

/**
 * Muda para a aba especificada
 */
function switchTab(tabName) {
  log("Mudando para aba", tabName);
  
  // Atualizar estado
  state.currentTab = tabName;
  
  // Atualizar botões das abas
  tabElements.tabButtons.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  
  // Atualizar conteúdo visível
  if (tabName === "viewer") {
    tabElements.viewerContent.classList.add("active");
    tabElements.mapsContent.classList.remove("active");
  } else if (tabName === "maps") {
    tabElements.viewerContent.classList.remove("active");
    tabElements.mapsContent.classList.add("active");
  }
  
  // Atualizar hash da URL (sem recarregar)
  const currentSearch = window.location.search;
  window.history.replaceState(null, "", `${window.location.pathname}${currentSearch}#${tabName}`);
  
  log("Aba ativa", tabName);
}

/**
 * Configura event listeners das abas
 */
function setupTabNavigation() {
  tabElements.tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Detectar mudança de hash (navegação do browser)
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

// Logger para debug
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

// Atualizar status
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

// Mostrar erro (viewer)
function showError(message) {
  elements.errorContainer.classList.remove("hidden");
  elements.errorText.textContent = message;
  updateStatus("Erro", "error");
  log("ERRO", message);
}

// Limpar erro (viewer)
function clearError() {
  elements.errorContainer.classList.add("hidden");
  elements.errorText.textContent = "";
}

// Mostrar erro (mapa)
function showMapError(message) {
  mapElements.mapErrorContainer.classList.remove("hidden");
  mapElements.mapErrorText.textContent = message;
  log("ERRO MAPA", message);
}

// Limpar erro (mapa)
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
    }
  } catch (error) {
    elements.apiStatus.textContent = "Offline";
    elements.apiStatus.style.color = "var(--danger)";
    log("API Health Check Falhou", error.message);
  }
}

// ===============================================
// CARREGAR LISTA DE POÇOS
// ===============================================

async function loadWells() {
  try {
    log("Carregando lista de poços");
    
    const response = await fetch(`${CONFIG.API_URL}/wells`, {
      headers: getFetchHeaders()
    });
    
    // Tratar erro 401 (não autorizado)
    if (response.status === 401) {
      showError("Não autenticado. Token inválido ou ausente.");
      log("Erro 401: Token inválido");
      clearToken();
      return;
    }
    
    const wells = await response.json();
    
    state.wells = wells;
    log(`${wells.length} poços carregados`);
    
    // Preencher datalist do viewer
    elements.wellsList.innerHTML = wells.map(well => 
      `<option value="${well.id}">${well.name} - ${well.field} (${well.state})</option>`
    ).join("");
    
    // Preencher datalist do mapa
    mapElements.wellsDatalist.innerHTML = wells.map(well => 
      `<option value="${well.id}">${well.name} - ${well.field} (${well.state})</option>`
    ).join("");
    
  } catch (error) {
    log("Erro ao carregar poços", error);
    showError("Erro ao carregar lista de poços");
  }
}

// ===============================================
// EVENT LISTENERS - VIEWER
// ===============================================

function setupEventListeners() {
  // Formulário
  elements.form.addEventListener("submit", generateProfile);
  
  // Input de poço
  elements.wellInput.addEventListener("change", handleWellSelection);
  elements.wellInput.addEventListener("input", handleWellInput);
  
  // Checkbox litologia
  elements.hasLitoInput.addEventListener("change", (e) => {
    state.hasLito = e.target.checked;
    log("Litologia alterada", state.hasLito);
  });
  
  // Botões
  elements.downloadBtn.addEventListener("click", downloadImage);
  document.getElementById("copyBtn")?.addEventListener("click", copyLink);
  elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
  elements.toggleDebug.addEventListener("click", toggleDebug);
  elements.clearDebug.addEventListener("click", clearDebugPanel);
  
  // Atalhos de teclado
  document.addEventListener("keydown", handleKeyPress);
}

// MANIPULAR SELEÇÃO DE POÇO
function handleWellInput(e) {
  const value = e.target.value;
  
  // Se o campo foi limpo, resetar seleção
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
  
  // Verificar se é um poço válido
  const well = state.wells.find(w => w.id === wellId);
  if (!well) {
    log("Poço não encontrado", wellId);
    return;
  }
  
  log("Poço selecionado", well);
  state.selectedWell = well;
  
  // Carregar curvas disponíveis
  await loadWellCurves(wellId);
}

// CARREGAR CURVAS DO POÇO
async function loadWellCurves(wellId) {
  try {
    clearError();
    
    // Mostrar loading
    elements.curvesContainer.innerHTML = "<div class=\"placeholder-text\">Carregando curvas...</div>";
    
    const response = await fetch(`${CONFIG.API_URL}/wells/${wellId}/curves`, {
      headers: getFetchHeaders()
    });
    
    // Tratar erro 401
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

// EXIBIR SELETOR DE CURVAS
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
  
  // Adicionar event listeners
  document.querySelectorAll(".curve-chip").forEach(chip => {
    chip.addEventListener("click", () => toggleCurveSelection(chip));
  });
}

// TOGGLE SELEÇÃO DE CURVA
function toggleCurveSelection(chip) {
  const curve = chip.dataset.curve;
  
  if (chip.classList.contains("selected")) {
    // Remover seleção
    chip.classList.remove("selected");
    state.selectedCurves = state.selectedCurves.filter(c => c !== curve);
  } else {
    // Verificar limite
    if (state.selectedCurves.length >= state.maxCurves) {
      showMaxReachedFeedback();
      return;
    }
    
    // Adicionar seleção
    chip.classList.add("selected");
    state.selectedCurves.push(curve);
  }
  
  updateCurveSelectionUI();
  updateURL();
}

// ATUALIZAR UI DE SELEÇÃO
function updateCurveSelectionUI() {
  const count = state.selectedCurves.length;
  const counter = document.getElementById("selectionCount");
  if (counter) counter.textContent = count;
  
  // Desabilitar não-selecionados se atingiu o limite
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
  
  // Habilitar/desabilitar botão gerar
  elements.generateBtn.disabled = count === 0;
  
  log("Seleção atualizada", { count, curves: state.selectedCurves });
}

// FEEDBACK MÁXIMO ATINGIDO
function showMaxReachedFeedback() {
  const container = document.querySelector(".curves-selector");
  container.classList.add("shake");
  setTimeout(() => {
    container.classList.remove("shake");
  }, 300);
}

// RESETAR DISPLAY DE CURVAS
function resetCurvesDisplay() {
  elements.curvesContainer.classList.remove("has-curves");
  elements.curvesContainer.innerHTML = "<div class=\"placeholder-text\">Selecione um poço primeiro</div>";
}

// ===============================================
// GERAR PERFIL
// ===============================================

async function generateProfile(e) {
  if (e) e.preventDefault();
  
  // Validar seleção
  if (!state.selectedWell || state.selectedCurves.length === 0) {
    showError("Selecione um poço e pelo menos uma curva");
    return;
  }
  
  // Validar token
  if (!state.accessToken) {
    showError("Token de autenticação não disponível. Recarregue a página com um link válido.");
    return;
  }
  
  // Preparar parâmetros
  const params = {
    well: state.selectedWell.id,
    curves: state.selectedCurves,
    hasLito: state.hasLito
  };
  
  log("Gerando perfil", params);
  state.lastParams = params;
  
  // Mostrar loading
  showLoading();
  
  try {
    const response = await fetch("/api/generate-profile", {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify(params)
    });
    
    // Tratar erro 401
    if (response.status === 401) {
      throw new Error("Token inválido ou expirado. Solicite um novo link.");
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    // Converter resposta para blob
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    
    // Exibir imagem
    displayImage(imageUrl, params);
    
    // Atualizar URL
    updateURL();
    
    log("Perfil gerado com sucesso");
    
  } catch (error) {
    console.error("Erro ao gerar perfil:", error);
    showError(error.message || "Erro ao gerar o perfil. Tente novamente.");
    
    // Se erro de autenticação, limpar token
    if (error.message.includes("Token")) {
      clearToken();
    }
  } finally {
    hideLoading();
  }
}

// MOSTRAR/ESCONDER LOADING
function showLoading() {
  state.isLoading = true;
  elements.generateBtn.disabled = true;
  elements.btnText.classList.add("hidden");
  elements.btnLoader.classList.remove("hidden");
  
  const loadingHTML = `
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
  
  elements.imageContainer.innerHTML = loadingHTML;
  updateStatus("Processando...", "info");
}

function hideLoading() {
  state.isLoading = false;
  elements.generateBtn.disabled = false;
  elements.btnText.classList.remove("hidden");
  elements.btnLoader.classList.add("hidden");
}

// EXIBIR IMAGEM
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

// ATUALIZAR URL SEM RECARREGAR
function updateURL() {
  if (!state.selectedWell || state.selectedCurves.length === 0) {
    // Limpar URL se não há seleção completa
    window.history.replaceState({}, "", "/#viewer");
    return;
  }
  
  const params = new URLSearchParams();
  params.set("well", state.selectedWell.id);
  params.set("curves", state.selectedCurves.join(","));
  if (state.hasLito) params.set("lito", "true");
  
  const newURL = `/?${params.toString()}#viewer`;
  window.history.replaceState({}, "", newURL);
  
  // Atualizar link compartilhável
  const fullURL = `${window.location.origin}${newURL}`;
  elements.generatedLink.value = fullURL;
  elements.linkPanel.classList.remove("hidden");
  
  log("URL atualizada", newURL);
}

// VERIFICAR PARÂMETROS DA URL (VIEWER)
async function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  
  const wellId = urlParams.get("well");
  const curvesParam = urlParams.get("curves");
  const hasLito = urlParams.get("lito") === "true";
  
  // Verificar se tem parâmetros de mapa
  const wellsParam = urlParams.get("wells");
  if (wellsParam) {
    // Tem parâmetros de mapa, processar na aba de mapas
    await processMapURLParams(wellsParam);
    return;
  }
  
  if (!wellId || !curvesParam) {
    log("Sem parâmetros na URL");
    return;
  }
  
  log("Parâmetros encontrados na URL", { wellId, curves: curvesParam, hasLito });
  
  // Aguardar wells carregarem
  if (state.wells.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Verificar se o poço existe
  const well = state.wells.find(w => w.id === wellId);
  if (!well) {
    log("Poço da URL não encontrado", wellId);
    return;
  }
  
  // Preencher campos
  elements.wellInput.value = wellId;
  elements.hasLitoInput.checked = hasLito;
  state.hasLito = hasLito;
  state.selectedWell = well;
  
  // Carregar curvas
  await loadWellCurves(wellId);
  
  // Selecionar curvas da URL
  const curves = curvesParam.split(",");
  curves.forEach(curve => {
    const chip = document.querySelector(`[data-curve="${curve}"]`);
    if (chip && state.selectedCurves.length < state.maxCurves) {
      chip.click();
    }
  });
  
  // Gerar perfil automaticamente
  if (state.selectedCurves.length > 0) {
    log("Gerando perfil automaticamente da URL");
    setTimeout(() => generateProfile(), 500);
  }
}

// ===============================================
// FUNÇÕES DE AÇÃO - VIEWER
// ===============================================

// Download da imagem
function downloadImage() {
  if (!state.currentImageUrl || !state.lastParams) return;
  
  const link = document.createElement("a");
  link.href = state.currentImageUrl;
  link.download = `perfil_${state.lastParams.well}_${Date.now()}.png`;
  link.click();
  
  log("Download iniciado", { well: state.lastParams.well });
}

// Tela cheia
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

// Toggle debug panel
function toggleDebug() {
  elements.debugPanel.classList.toggle("hidden");
}

// Limpar debug
function clearDebugPanel() {
  elements.debugContent.textContent = "";
  log("Debug limpo");
}

// Copiar link
async function copyLink() {
  const input = elements.generatedLink;
  const btn = document.getElementById("copyBtn");
  
  // Copiar texto
  await navigator.clipboard.writeText(input.value);
  
  // Feedback visual
  const originalHTML = btn.innerHTML;
  btn.innerHTML = "✓";
  btn.style.background = "var(--success)";
  
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.background = "";
  }, 2000);
  
  log("Link copiado", input.value);
}

// ATALHOS DE TECLADO
function handleKeyPress(e) {
  // Ctrl/Cmd + Enter para gerar
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !state.isLoading) {
    if (state.currentTab === "viewer") {
      generateProfile();
    } else {
      generateMap();
    }
  }
  
  // Ctrl/Cmd + D para debug
  if ((e.ctrlKey || e.metaKey) && e.key === "d") {
    e.preventDefault();
    toggleDebug();
  }
  
  // Ctrl/Cmd + S para download
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && state.currentImageUrl) {
    e.preventDefault();
    downloadImage();
  }
}

// ===============================================
// MAPA - EVENT LISTENERS
// ===============================================

function setupMapEventListeners() {
  // Adicionar poço
  mapElements.addWellBtn.addEventListener("click", addWellToMap);
  
  // Enter no input adiciona o poço
  mapElements.wellInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWellToMap();
    }
  });
  
  // Gerar mapa
  mapElements.generateMapBtn.addEventListener("click", generateMap);
  
  // Limpar seleção
  mapElements.clearMapBtn.addEventListener("click", clearMapSelection);
  
  // Abrir no Google Maps
  mapElements.openGoogleMapsBtn.addEventListener("click", openInGoogleMaps);
  
  // Copiar link do mapa
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
  
  // Verificar se já está na lista
  if (state.mapWells.find(w => w.id === wellId)) {
    log("Poço já está na lista", wellId);
    mapElements.wellInput.value = "";
    return;
  }
  
  // Verificar limite
  if (state.mapWells.length >= CONFIG.MAX_MAP_WELLS) {
    showMapError(`Máximo de ${CONFIG.MAX_MAP_WELLS} poços por mapa`);
    return;
  }
  
  // Verificar se o poço existe
  const well = state.wells.find(w => w.id === wellId);
  if (!well) {
    showMapError(`Poço "${wellId}" não encontrado`);
    return;
  }
  
  // Adicionar à lista
  state.mapWells.push(well);
  
  // Limpar input
  mapElements.wellInput.value = "";
  
  // Atualizar UI
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
  
  // Limpar marcadores do mapa
  state.mapMarkers.forEach(marker => marker.setMap(null));
  state.mapMarkers = [];
  
  // Resetar visualização - mostrar placeholder, esconder mapa
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "flex";
  if (mapDiv) mapDiv.style.display = "none";
  
  mapElements.mapLegend.classList.add("hidden");
  mapElements.mapLinkPanel.classList.add("hidden");
  mapElements.openGoogleMapsBtn.disabled = true;
  mapElements.mapTitle.textContent = "Mapa de Localização";
  
  log("Seleção de mapa limpa");
}

function updateMapWellsDisplay() {
  const count = state.mapWells.length;
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  // Atualizar contador
  mapElements.wellCount.textContent = `(${count})`;
  mapElements.mapStatusCount.textContent = count;
  
  // Atualizar botão gerar
  mapElements.generateMapBtn.disabled = count === 0;
  
  // Atualizar lista
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

/**
 * Carrega o Google Maps JavaScript API dinamicamente
 * Retorna uma Promise que resolve quando a API estiver pronta
 */
function loadGoogleMapsAPI() {
  return new Promise((resolve, reject) => {
    // Se já carregou, resolve imediatamente
    if (state.googleMapsLoaded && window.google && window.google.maps) {
      log("Google Maps API já carregada");
      resolve();
      return;
    }
    
    // Buscar API key do servidor primeiro
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
        
        // Definir callback global ANTES de criar o script
        window.initGoogleMapsCallback = function() {
          log("Google Maps API carregada com sucesso");
          state.googleMapsLoaded = true;
          resolve();
        };
        
        // Criar e adicionar script tag
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
    // 1. Carregar Google Maps API se ainda não carregou
    log("Verificando Google Maps API...");
    await loadGoogleMapsAPI();
    
    // 2. Buscar coordenadas dos poços
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
    
    // 3. Exibir mapa interativo
    displayMap(data);
    
    // 4. Atualizar URL do mapa
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
  
  // Esconder placeholder e mapa
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "none";
  if (mapDiv) mapDiv.style.display = "none";
  
  // Mostrar loading (criar se não existir)
  let loadingEl = document.getElementById("mapLoadingOverlay");
  if (!loadingEl) {
    loadingEl = document.createElement("div");
    loadingEl.id = "mapLoadingOverlay";
    loadingEl.className = "loading-overlay";
    loadingEl.style.cssText = "display: flex; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.95); align-items: center; justify-content: center; border-radius: 0.5rem;";
    loadingEl.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Carregando mapa...</p>
      </div>
    `;
    mapElements.mapContainer.style.position = "relative";
    mapElements.mapContainer.appendChild(loadingEl);
  } else {
    loadingEl.style.display = "flex";
  }
}

function hideMapLoading() {
  mapElements.generateMapBtn.disabled = state.mapWells.length === 0;
  mapElements.mapBtnText.classList.remove("hidden");
  mapElements.mapBtnLoader.classList.add("hidden");
  
  // Esconder loading
  const loadingEl = document.getElementById("mapLoadingOverlay");
  if (loadingEl) {
    loadingEl.style.display = "none";
  }
}

function displayMap(data) {
  const { wells } = data;
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  // Esconder placeholder, mostrar div do mapa
  const placeholder = document.getElementById("mapPlaceholder");
  const mapDiv = document.getElementById("googleMap");
  
  if (placeholder) placeholder.style.display = "none";
  if (mapDiv) mapDiv.style.display = "block";
  
  // Calcular centro do mapa (média das coordenadas)
  const avgLat = wells.reduce((sum, w) => sum + w.lat, 0) / wells.length;
  const avgLng = wells.reduce((sum, w) => sum + w.lng, 0) / wells.length;
  
  // Criar mapa
  const map = new google.maps.Map(mapDiv, {
    center: { lat: avgLat, lng: avgLng },
    zoom: 8,
    mapTypeId: "terrain"
  });
  
  // Salvar instância do mapa
  state.mapInstance = map;
  
  // Limpar marcadores antigos
  state.mapMarkers.forEach(marker => marker.setMap(null));
  state.mapMarkers = [];
  
  // Criar bounds para ajustar zoom automaticamente
  const bounds = new google.maps.LatLngBounds();
  
  // Adicionar marcadores
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
    
    // InfoWindow ao clicar no marcador
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
  
  // Ajustar zoom para mostrar todos os marcadores
  if (wells.length > 1) {
    map.fitBounds(bounds);
    
    // Limitar zoom máximo para não ficar muito próximo
    const listener = google.maps.event.addListener(map, "idle", () => {
      if (map.getZoom() > 14) {
        map.setZoom(14);
      }
      google.maps.event.removeListener(listener);
    });
  } else {
    // Se só tem 1 poço, zoom fixo
    map.setZoom(12);
  }
  
  // Salvar coordenadas para "Abrir Externo"
  state.mapWellsCoordinates = wells;
  
  // Exibir legenda
  mapElements.legendContent.innerHTML = wells.map((well, index) => `
    <div class="legend-item">
      <span class="legend-marker">${labels[index]}</span>
      <span>${well.name} (${well.state || "N/A"})</span>
    </div>
  `).join("");
  
  mapElements.mapLegend.classList.remove("hidden");
  
  // Habilitar botão de abrir externo
  mapElements.openGoogleMapsBtn.disabled = false;
  
  // Atualizar título
  mapElements.mapTitle.textContent = `Mapa: ${wells.length} poço(s)`;
  
  log("Mapa interativo exibido", { wellsCount: wells.length });
}

function updateMapURL() {
  const wellIds = state.mapWells.map(w => w.id).join(",");
  const newURL = `/?wells=${wellIds}#maps`;
  window.history.replaceState({}, "", newURL);
  
  // Atualizar link compartilhável
  const fullURL = `${window.location.origin}${newURL}`;
  mapElements.generatedMapLink.value = fullURL;
  mapElements.mapLinkPanel.classList.remove("hidden");
  
  log("URL do mapa atualizada", newURL);
}

async function processMapURLParams(wellsParam) {
  log("Processando parâmetros de mapa da URL", wellsParam);
  
  // Mudar para aba de mapas
  switchTab("maps");
  
  // Aguardar wells carregarem
  if (state.wells.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Adicionar poços
  const wellIds = wellsParam.split(",");
  wellIds.forEach(wellId => {
    const well = state.wells.find(w => w.id === wellId.trim());
    if (well && !state.mapWells.find(w => w.id === well.id)) {
      state.mapWells.push(well);
    }
  });
  
  // Atualizar UI
  updateMapWellsDisplay();
  
  // Gerar mapa automaticamente
  if (state.mapWells.length > 0) {
    log("Gerando mapa automaticamente da URL");
    setTimeout(() => generateMap(), 500);
  }
}

function openInGoogleMaps() {
  if (!state.mapWellsCoordinates || state.mapWellsCoordinates.length === 0) {
    log("Nenhuma coordenada disponível");
    return;
  }
  
  if (state.mapWellsCoordinates.length === 1) {
    // Um poço: abre direto no Google Maps
    const well = state.mapWellsCoordinates[0];
    window.open(`https://www.google.com/maps?q=${well.lat},${well.lng}`, "_blank");
  } else {
    // Múltiplos poços: abre no centro com zoom
    const avgLat = state.mapWellsCoordinates.reduce((sum, w) => sum + w.lat, 0) / state.mapWellsCoordinates.length;
    const avgLng = state.mapWellsCoordinates.reduce((sum, w) => sum + w.lng, 0) / state.mapWellsCoordinates.length;
    window.open(`https://www.google.com/maps/@${avgLat},${avgLng},10z`, "_blank");
  }
  
  log("Abrindo mapa externo");
}

async function copyMapLink() {
  const input = mapElements.generatedMapLink;
  const btn = mapElements.copyMapLinkBtn;
  
  // Copiar texto
  await navigator.clipboard.writeText(input.value);
  
  // Feedback visual
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
  log("Iniciando aplicação");
  
  // Carregar token
  loadToken();
  
  if (state.accessToken) {
    log("Token carregado com sucesso", { length: state.accessToken.length });
    updateStatus("Autenticado", "success");
  } else {
    log("Nenhum token disponível - modo limitado");
    updateStatus("Sem autenticação", "warning");
  }
  
  // Configurar navegação por abas
  setupTabNavigation();
  
  // Verificar aba inicial (do hash)
  const initialTab = getTabFromHash() || "viewer";
  switchTab(initialTab);
  
  // Verificar saúde da API
  await checkAPIHealth();
  
  // Carregar lista de poços
  await loadWells();
  
  // Configurar event listeners
  setupEventListeners();
  setupMapEventListeners();
  
  // Verificar se há parâmetros na URL
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
  removeWellFromMap
};

// Expor função de remover poço globalmente (para onclick no HTML)
window.removeWellFromMap = removeWellFromMap;
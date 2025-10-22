// CONFIGURAÇÃO E ESTADO GLOBAL
const CONFIG = {
  API_URL: "/api",
  DEBUG_MODE: true
};

const state = {
  // Lista de poços disponíveis
  wells: [],
  
  // Poço selecionado
  selectedWell: null,
  
  // Curvas
  availableCurves: [],
  selectedCurves: [],
  maxCurves: 3,
  
  // Configurações
  hasLito: true,
  
  // Estado da aplicação
  isLoading: false,
  currentImageUrl: null,
  lastParams: null,
  
  // 🔐 NOVO: Token de autenticação
  accessToken: null
};

// ELEMENTOS DO DOM
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

// ===============================================
// 🔐 GERENCIAMENTO DE TOKEN (NOVO)
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
    
    // Limpar hash da URL (segurança visual)
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    
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
    log("Bearer token incluído na requisição");
  }
  
  return headers;
}

// FUNÇÕES AUXILIARES

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

// Mostrar erro
function showError(message) {
  elements.errorContainer.classList.remove("hidden");
  elements.errorText.textContent = message;
  updateStatus("Erro", "error");
  log("ERRO", message);
}

// Limpar erro
function clearError() {
  elements.errorContainer.classList.add("hidden");
  elements.errorText.textContent = "";
}

// Atualizar URL sem recarregar a página
function updateURL() {
  if (!state.selectedWell || state.selectedCurves.length === 0) {
    // Limpar URL se não há seleção completa
    window.history.replaceState({}, "", "/");
    return;
  }
  
  const params = new URLSearchParams();
  params.set("well", state.selectedWell.id);
  params.set("curves", state.selectedCurves.join(","));
  if (state.hasLito) params.set("lito", "true");
  
  const newURL = `/?${params.toString()}`;
  window.history.replaceState({}, "", newURL);
  
  // Atualizar link compartilhável
  const fullURL = `${window.location.origin}${newURL}`;
  elements.generatedLink.value = fullURL;
  elements.linkPanel.classList.remove("hidden");
  
  log("URL atualizada", newURL);
}

// INICIALIZAÇÃO
document.addEventListener("DOMContentLoaded", async () => {
  log("Iniciando aplicação");
  
  // 🔐 NOVO: Carregar token
  loadToken();
  
  if (state.accessToken) {
    log("Token carregado com sucesso", { length: state.accessToken.length });
    updateStatus("Autenticado", "success");
  } else {
    log("Nenhum token disponível - modo limitado");
    updateStatus("Sem autenticação", "warning");
  }
  
  // Verificar saúde da API
  await checkAPIHealth();
  
  // Carregar lista de poços
  await loadWells();
  
  // Configurar event listeners
  setupEventListeners();
  
  // Verificar se há parâmetros na URL
  await checkURLParams();
  
  log("Aplicação inicializada");
});

// VERIFICAR SAÚDE DA API
async function checkAPIHealth() {
  try {
    const response = await fetch(`${CONFIG.API_URL}/health`, {
      headers: getFetchHeaders() // 🔐 NOVO: Incluir Bearer token
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

// CARREGAR LISTA DE POÇOS
async function loadWells() {
  try {
    log("Carregando lista de poços");
    
    const response = await fetch(`${CONFIG.API_URL}/wells`, {
      headers: getFetchHeaders() // 🔐 NOVO: Incluir Bearer token
    });
    
    // 🔐 NOVO: Tratar erro 401 (não autorizado)
    if (response.status === 401) {
      showError("Não autenticado. Token inválido ou ausente.");
      log("Erro 401: Token inválido");
      clearToken();
      return;
    }
    
    const wells = await response.json();
    
    state.wells = wells;
    log(`${wells.length} poços carregados`);
    
    // Preencher datalist
    elements.wellsList.innerHTML = wells.map(well => 
      `<option value="${well.id}">${well.name} - ${well.field} (${well.state})</option>`
    ).join("");
    
  } catch (error) {
    log("Erro ao carregar poços", error);
    showError("Erro ao carregar lista de poços");
  }
}

// CONFIGURAR EVENT LISTENERS
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
  elements.clearDebug.addEventListener("click", clearDebug);
  
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
      headers: getFetchHeaders() // 🔐 NOVO: Incluir Bearer token
    });
    
    // 🔐 NOVO: Tratar erro 401
    if (response.status === 401) {
      showError("Não autenticado. Token inválido ou ausente.");
      clearToken();
      return;
    }
    
    const data = await response.json();
    
    state.availableCurves = data.curves;
    state.selectedCurves = []; // Resetar seleção anterior
    
    log(`${data.curves.length} curvas disponíveis`, data.curves);
    
    // Exibir curvas
    displayCurves(data.curves);
    
  } catch (error) {
    log("Erro ao carregar curvas", error);
    showError("Erro ao carregar curvas do poço");
  }
}

// EXIBIR CURVAS COMO CHIPS
function displayCurves(curves) {
  elements.curvesContainer.classList.add("has-curves");
  
  elements.curvesContainer.innerHTML = `
    <div class="curves-selector">
      ${curves.map(curve => `
        <div class="curve-chip" data-curve="${curve}">
          ${curve}
        </div>
      `).join("")}
    </div>
    <div class="selection-counter" id="selectionCounter">
      0 de ${state.maxCurves} curvas selecionadas
    </div>
  `;
  
  // Adicionar listeners aos chips
  document.querySelectorAll(".curve-chip").forEach(chip => {
    chip.addEventListener("click", () => toggleCurve(chip));
  });
}

// TOGGLE SELEÇÃO DE CURVA
function toggleCurve(chip) {
  const curve = chip.dataset.curve;
  
  if (state.selectedCurves.includes(curve)) {
    // Desselecionar
    state.selectedCurves = state.selectedCurves.filter(c => c !== curve);
    chip.classList.remove("selected");
  } else if (state.selectedCurves.length < state.maxCurves) {
    // Selecionar
    state.selectedCurves.push(curve);
    chip.classList.add("selected");
  } else {
    // Máximo atingido - feedback visual
    showMaxReachedFeedback();
  }
  
  updateSelectionUI();
}

// ATUALIZAR UI DE SELEÇÃO
function updateSelectionUI() {
  const count = state.selectedCurves.length;
  const counter = document.getElementById("selectionCounter");
  
  // Atualizar texto do contador
  if (count === 0) {
    counter.textContent = `0 de ${state.maxCurves} curvas selecionadas`;
    counter.className = "selection-counter";
  } else if (count < state.maxCurves) {
    counter.textContent = `${count} de ${state.maxCurves} curvas selecionadas`;
    counter.className = "selection-counter warning";
  } else {
    counter.textContent = `✓ ${count} de ${state.maxCurves} curvas selecionadas (máximo)`;
    counter.className = "selection-counter max-reached";
  }
  
  // Desabilitar chips não selecionados se atingiu o máximo
  const allChips = document.querySelectorAll(".curve-chip");
  if (count === state.maxCurves) {
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

// GERAR PERFIL
async function generateProfile(e) {
  if (e) e.preventDefault();
  
  // Validar seleção
  if (!state.selectedWell || state.selectedCurves.length === 0) {
    showError("Selecione um poço e pelo menos uma curva");
    return;
  }
  
  // 🔐 NOVO: Validar token
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
      headers: getFetchHeaders(), // 🔐 NOVO: Incluir Bearer token
      body: JSON.stringify(params)
    });
    
    // 🔐 NOVO: Tratar erro 401
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

// VERIFICAR PARÂMETROS DA URL
async function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  
  const wellId = urlParams.get("well");
  const curvesParam = urlParams.get("curves");
  const hasLito = urlParams.get("lito") === "true";
  
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

// FUNÇÕES DE AÇÃO

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
function clearDebug() {
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
    generateProfile();
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

// EXPORTAR PARA DEBUGGING GLOBAL
window.CurvesAPI = {
  state,
  CONFIG,
  generateProfile,
  log,
  clearToken,
  loadToken
};
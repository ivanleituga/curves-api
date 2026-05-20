// ===============================================
// GEOPORTAL.JS - Aba Geo Portal
//
// REFATORADO v8.4:
//   Toda a lógica de filtros bacia/campo e sidebar hierárquica
//   foi extraída pra shared/wells-selector.js (compartilhada
//   com a aba Maps). Aqui ficou só o que é específico do Geo
//   Portal: feature flag, criar sessão SID, montar URL do iframe.
//
// FLUXO:
//   1. Usuário adiciona poços (individual ou via filtro bacia/campo)
//   2. Clica "Gerar Visualização ArcGIS"
//   3. Frontend chama POST /api/geoportal/sessions com { wells }
//   4. Backend salva sessão no banco e retorna { sid }
//   5. Frontend monta URL com SID e joga no iframe
//   6. Página de destino (app do Flávio) consulta
//      GET /api/geoportal/sessions/:sid pra recuperar os poços
//
// FEATURE FLAG (GEOPORTAL_REAL_URL no .env do backend):
//   - Se configurada: iframe aponta pra URL real do Flávio
//   - Se não: mostra mensagem amigável "em integração" no painel direito
//
// Depende de:
//   - app.js (state.geoWells, CONFIG, log, getFetchHeaders)
//   - shared/wells-selector.js (createWellsSelector)
// ===============================================

// ===============================================
// ESTADO LOCAL DA ABA
// ===============================================

const geoPortalState = {
  wells: [],         // Poços selecionados (objetos completos do state.geoWells)
  currentUrl: null,  // URL da última visualização gerada (do iframe)
  currentSid: null,  // SID da sessão atual (usado no link compartilhável)
  realUrl: null      // URL real do Flávio (vem do /api/geoportal-config).
  // Se null, mostra mensagem amigável em vez de gerar.
};

// Instância do selector (filtros + sidebar) - criada em setupGeoPortalEventListeners
let geoPortalSelector = null;

// ===============================================
// ELEMENTOS DO DOM
// ===============================================

const geoPortalElements = {
  // Seleção de poços
  wellInput: document.getElementById("geoPortalWellInput"),
  wellsDatalist: document.getElementById("geoportal-wells-datalist"),
  wellsList: document.getElementById("geoPortalWellsList"),
  wellCount: document.getElementById("geoPortalWellCount"),
  addWellBtn: document.getElementById("geoPortalAddWellBtn"),

  // Filtros bacia/campo
  baciaSelect: document.getElementById("geoPortalBaciaSelect"),
  campoSelect: document.getElementById("geoPortalCampoSelect"),
  addByFilterBtn: document.getElementById("geoPortalAddByFilterBtn"),
  filterCount: document.getElementById("geoPortalFilterCount"),

  // Ações principais
  generateBtn: document.getElementById("geoPortalGenerateBtn"),
  btnText: document.getElementById("geoPortalBtnText"),
  btnLoader: document.getElementById("geoPortalBtnLoader"),
  clearBtn: document.getElementById("geoPortalClearBtn"),

  // Status
  statusWells: document.getElementById("geoPortalStatusWells"),
  statusEndpoint: document.getElementById("geoPortalStatusEndpoint"),

  // Visualização (painel direito)
  container: document.getElementById("geoPortalContainer"),
  placeholder: document.getElementById("geoPortalPlaceholder"),
  frame: document.getElementById("geoPortalFrame"),
  title: document.getElementById("geoPortalTitle"),

  // Erro
  errorContainer: document.getElementById("geoPortalErrorContainer"),
  errorText: document.getElementById("geoPortalErrorText"),

  // Link compartilhável (espelho do mapLinkPanel da aba Mapas)
  linkPanel: document.getElementById("geoPortalLinkPanel"),
  generatedLink: document.getElementById("generatedGeoPortalLink"),
  copyLinkBtn: document.getElementById("copyGeoPortalLinkBtn")
};

// ===============================================
// ADICIONAR POÇO INDIVIDUAL
// (remoção delegada ao selector via callback)
// ===============================================

function addGeoPortalWell() {
  const wellId = geoPortalElements.wellInput.value.trim();
  if (!wellId) return;

  if (geoPortalState.wells.find(w => w.id === wellId)) {
    log("Poço já adicionado ao Geo Portal", wellId);
    geoPortalElements.wellInput.value = "";
    return;
  }

  const well = state.geoWells.find(w => w.id === wellId);
  if (!well) {
    showGeoPortalError(`Poço "${wellId}" não encontrado na base.`);
    return;
  }

  geoPortalState.wells.push(well);
  geoPortalElements.wellInput.value = "";

  geoPortalSelector.renderWellsList();
  onGeoPortalWellsChanged();
  clearGeoPortalError();
  log("Poço adicionado ao Geo Portal", well.id);
}

// ===============================================
// CALLBACKS DO SELECTOR
// ===============================================

/**
 * Chamado pelo selector depois de qualquer mudança na lista
 * de poços. Atualiza contadores e estado do botão "Gerar".
 */
function onGeoPortalWellsChanged() {
  const count = geoPortalState.wells.length;
  geoPortalElements.statusWells.textContent = count;
  geoPortalElements.generateBtn.disabled = count === 0;
}

// ===============================================
// GERAR VISUALIZAÇÃO
// (cria sessão SID no backend, joga URL no iframe)
// ===============================================

async function generateGeoPortalVisualization() {
  clearGeoPortalError();

  // Se a feature flag não está configurada (Flávio ainda não entregou),
  // mostra mensagem amigável e não chama o backend.
  if (!geoPortalState.realUrl) {
    showGeoPortalUnavailable();
    return;
  }

  showGeoPortalLoading();

  // Cada poço vai como objeto coeso { name, lat, lng }
  const wellsPayload = geoPortalState.wells.map(w => ({
    name: w.id,
    lat: w.lat,
    lng: w.lng
  }));

  log("Criando sessão Geo Portal", { wells: wellsPayload.length });

  try {
    const response = await fetch(`${CONFIG.API_URL}/geoportal/sessions`, {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify({ wells: wellsPayload })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    log("Sessão Geo Portal criada", data);

    if (!data.sid) {
      throw new Error("Resposta sem SID");
    }

    // Monta URL do iframe usando a URL real configurada no backend (.env).
    // NOTA: Geo Portal do Flávio usa "sessionid" como parâmetro da URL
    // (diferente do "sid" usado no resto da aplicação). Quando ele
    // padronizar pra "sid", trocar de volta aqui.
    const iframeUrl = `${geoPortalState.realUrl}?sessionid=${data.sid}`;

    geoPortalState.currentUrl = iframeUrl;
    geoPortalState.currentSid = data.sid;
    showGeoPortalIframe(iframeUrl);

    // Atualiza a URL do navegador e mostra painel de link compartilhável
    // (espelho do comportamento da aba Mapas)
    updateGeoPortalURLWithSession(data.sid);

  } catch (error) {
    console.error("Erro ao gerar visualização Geo Portal:", error);
    showGeoPortalError(error.message || "Erro ao gerar visualização");
  } finally {
    hideGeoPortalLoading();
  }
}

function showGeoPortalIframe(url) {
  geoPortalElements.placeholder.style.display = "none";
  geoPortalElements.frame.src = url;
  geoPortalElements.frame.style.display = "block";

  const wellWord = geoPortalState.wells.length === 1 ? "poço" : "poços";
  geoPortalElements.title.textContent =
    `Geo Portal: ${geoPortalState.wells.length} ${wellWord}`;
}

/**
 * Mostra mensagem amigável quando GEOPORTAL_REAL_URL não está
 * configurada no backend (Flávio ainda não entregou o endpoint dele).
 */
function showGeoPortalUnavailable() {
  geoPortalElements.placeholder.innerHTML = `
    <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <p style="color: #92400e; font-weight: 500; margin-top: 1rem;">
      Geo Portal em integração
    </p>
    <p style="color: #78350f; font-size: 0.875rem; margin-top: 0.5rem; max-width: 400px; text-align: center;">
      A visualização ArcGIS estará disponível em breve.
      A integração com a aplicação está em fase final de desenvolvimento.
    </p>
  `;
  geoPortalElements.placeholder.style.display = "flex";
  geoPortalElements.frame.style.display = "none";
  log("Geo Portal indisponível (GEOPORTAL_REAL_URL não configurada no backend)");
}

// ===============================================
// URL COMPARTILHÁVEL (links pra Custom GPT ou colegas)
// Espelho de updateMapURLWithSession da aba Mapas.
// ===============================================

function updateGeoPortalURLWithSession(sid) {
  // Atualiza a URL do navegador (sem recarregar a página)
  // Formato: /?sid=xxx#geoportal
  const visibleURL = `/?sid=${sid}#geoportal`;
  window.history.replaceState({}, "", visibleURL);

  // Monta URL compartilhável (com token no hash, igual aba Mapas)
  const tokenPart = getTokenHashPart();
  const shareableURL = `${window.location.origin}/?sid=${sid}#${tokenPart}geoportal`;
  geoPortalElements.generatedLink.value = shareableURL;
  geoPortalElements.linkPanel.classList.remove("hidden");

  log("URL do Geo Portal atualizada com SID", { sid });
}

async function copyGeoPortalLink() {
  const input = geoPortalElements.generatedLink;
  const btn = geoPortalElements.copyLinkBtn;

  await navigator.clipboard.writeText(input.value);

  const originalHTML = btn.innerHTML;
  btn.innerHTML = "✓";
  btn.style.background = "var(--success)";

  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.background = "";
  }, 2000);

  log("Link do Geo Portal copiado", input.value);
}

// ===============================================
// PROCESSAR SID DA URL (chamado pelo app.js quando ?sid=xxx#geoportal)
// Resolve o SID, popula a seleção e gera a visualização automaticamente.
// Espelho de processSessionURLParam da aba Mapas.
// ===============================================

async function processGeoPortalSessionURL(sid) {
  log("Processando sessão Geo Portal da URL", sid);

  switchTab("geoportal");

  try {
    const response = await fetch(`${CONFIG.API_URL}/geoportal/sessions/${sid}`, {
      headers: getFetchHeaders()
    });

    if (!response.ok) {
      if (response.status === 404) {
        showGeoPortalError("Link expirado ou inválido. A sessão não foi encontrada.");
      } else {
        showGeoPortalError("Erro ao carregar sessão do Geo Portal.");
      }
      return;
    }

    const data = await response.json();
    log(`Sessão Geo Portal encontrada: ${data.wellCount} poços`);

    // Aguardar geoWells carregar caso ainda não tenha
    if (state.geoWells.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Popular state.wells a partir dos poços da sessão.
    // A sessão guarda { name, lat, lng } mas o selector espera os objetos
    // completos do geoWells (com bacia, campo). Buscamos por name.
    data.wells.forEach(sessionWell => {
      const fullWell = state.geoWells.find(w => w.id === sessionWell.name);
      if (fullWell && !geoPortalState.wells.find(w => w.id === fullWell.id)) {
        geoPortalState.wells.push(fullWell);
      }
    });

    geoPortalSelector.renderWellsList();
    onGeoPortalWellsChanged();

    if (geoPortalState.wells.length > 0) {
      log("Gerando visualização Geo Portal automaticamente da sessão");
      setTimeout(() => generateGeoPortalVisualization(), 500);
    }

  } catch (error) {
    log("Erro ao processar sessão Geo Portal", error.message);
    showGeoPortalError("Erro ao carregar Geo Portal compartilhado.");
  }
}



function clearGeoPortalSelection() {
  geoPortalState.wells = [];
  geoPortalState.currentUrl = null;
  geoPortalState.currentSid = null;

  geoPortalElements.wellInput.value = "";

  // Esconder painel de link compartilhável
  geoPortalElements.linkPanel.classList.add("hidden");

  // Resetar iframe e placeholder (restaura conteúdo original)
  geoPortalElements.frame.src = "about:blank";
  geoPortalElements.frame.style.display = "none";
  geoPortalElements.placeholder.style.display = "flex";
  geoPortalElements.placeholder.innerHTML = `
    <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" stroke-width="1">
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
    <p>Selecione poços e clique em "Gerar Visualização ArcGIS"</p>
  `;
  geoPortalElements.title.textContent = "Visualização Geo Portal";

  // Selector atualiza sidebar e reseta filtros
  geoPortalSelector.renderWellsList();
  geoPortalSelector.resetFilters();
  onGeoPortalWellsChanged();

  clearGeoPortalError();
  log("Geo Portal: seleção limpa");
}

// ===============================================
// LOADING / ERRO
// ===============================================

function showGeoPortalLoading() {
  geoPortalElements.generateBtn.disabled = true;
  geoPortalElements.btnText.classList.add("hidden");
  geoPortalElements.btnLoader.classList.remove("hidden");
}

function hideGeoPortalLoading() {
  geoPortalElements.btnText.classList.remove("hidden");
  geoPortalElements.btnLoader.classList.add("hidden");
  onGeoPortalWellsChanged(); // reavalia o disabled
}

function showGeoPortalError(message) {
  geoPortalElements.errorContainer.classList.remove("hidden");
  geoPortalElements.errorText.textContent = message;
  log("ERRO GeoPortal", message);
}

function clearGeoPortalError() {
  geoPortalElements.errorContainer.classList.add("hidden");
  geoPortalElements.errorText.textContent = "";
}

// ===============================================
// POPULAR DATALIST (reaproveita state.geoWells - ~26.000 poços)
// ===============================================

function populateGeoPortalDatalist() {
  if (!state.geoWells || state.geoWells.length === 0) {
    return;
  }

  geoPortalElements.wellsDatalist.innerHTML = state.geoWells
    .map(well => `<option value="${well.id}">${well.name} (${well.bacia || "—"})</option>`)
    .join("");
}

// ===============================================
// CARREGAR CONFIG DO BACKEND (feature flag)
// ===============================================

async function loadGeoPortalConfig() {
  try {
    const response = await fetch(`${CONFIG.API_URL}/geoportal-config`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    geoPortalState.realUrl = data.realUrl || null;

    if (geoPortalState.realUrl) {
      log("Geo Portal: URL real configurada", geoPortalState.realUrl);
      geoPortalElements.statusEndpoint.textContent = "✅ Disponível";
      geoPortalElements.statusEndpoint.style.color = "var(--success)";
    } else {
      log("Geo Portal: URL real NÃO configurada (mostrará mensagem amigável)");
      geoPortalElements.statusEndpoint.textContent = "⚠️ Em integração";
      geoPortalElements.statusEndpoint.style.color = "var(--warning)";
    }
  } catch (error) {
    console.error("Erro ao carregar config do Geo Portal:", error);
    geoPortalState.realUrl = null;
    geoPortalElements.statusEndpoint.textContent = "❌ Erro ao verificar";
    geoPortalElements.statusEndpoint.style.color = "var(--danger)";
  }
}

// ===============================================
// SETUP DE EVENT LISTENERS
// ===============================================

function setupGeoPortalEventListeners() {
  // Cria a instância do selector com config específica desta aba
  geoPortalSelector = createWellsSelector({
    selectedWells: geoPortalState.wells,
    elements: {
      baciaSelect: geoPortalElements.baciaSelect,
      campoSelect: geoPortalElements.campoSelect,
      addByFilterBtn: geoPortalElements.addByFilterBtn,
      filterCount: geoPortalElements.filterCount,
      wellsList: geoPortalElements.wellsList,
      wellCount: geoPortalElements.wellCount
    },
    idPrefix: "geoportal",
    onWellRemoved: null, // Geo Portal não tem marcadores pra limpar
    onWellsChanged: onGeoPortalWellsChanged,
    onError: showGeoPortalError,
    clearError: clearGeoPortalError
  });

  // Adicionar poço individual
  geoPortalElements.addWellBtn.addEventListener("click", addGeoPortalWell);
  geoPortalElements.wellInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGeoPortalWell();
    }
  });

  // Filtros bacia/campo - handlers do selector
  geoPortalElements.baciaSelect.addEventListener("change", () => geoPortalSelector.onBaciaChange());
  geoPortalElements.campoSelect.addEventListener("change", () => geoPortalSelector.updateFilterCount());
  geoPortalElements.addByFilterBtn.addEventListener("click", () => geoPortalSelector.addWellsByFilter());

  // Ações principais
  geoPortalElements.generateBtn.addEventListener("click", generateGeoPortalVisualization);
  geoPortalElements.clearBtn.addEventListener("click", clearGeoPortalSelection);
  geoPortalElements.copyLinkBtn?.addEventListener("click", copyGeoPortalLink);

  // Renderização inicial + popular filtros/datalist
  geoPortalSelector.renderWellsList();
  geoPortalSelector.populateBasinFilter();
  populateGeoPortalDatalist();

  // Carregar config (assíncrono - não bloqueia o setup)
  loadGeoPortalConfig();

  log("Geo Portal: event listeners configurados");
}

// ===============================================
// EXPOSIÇÃO GLOBAL
// (onclick inline no HTML gerado dinamicamente pelo selector)
// ===============================================

window.removeWellFromGeoportal = (wellId) => geoPortalSelector.removeWell(wellId);
window.removeBaciaFromGeoportal = (bacia) => geoPortalSelector.removeBacia(bacia);
window.removeCampoFromGeoportal = (bacia, campo) => geoPortalSelector.removeCampo(bacia, campo);
window.toggleGeoportalGroup = (groupId) => geoPortalSelector.toggleGroup(groupId);
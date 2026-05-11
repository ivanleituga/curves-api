// ===============================================
// GEOPORTAL.JS - Aba Geo Portal
//
// Integração com a aplicação ArcGIS interna da K2
// Sistemas (mantida pelo Flávio).
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
//   O frontend descobre isso via GET /api/geoportal-config no setup.
//
// CONTRATO COM /api/geoportal/sessions:
//   POST: { wells: [{ name, lat, lng }, ...] }
//   Resposta: { sid: "abc123def456" }
//
// PENDÊNCIA (registrada na memória do projeto):
//   A lógica de filtros e sidebar hierárquica é praticamente
//   idêntica à de map-google.js. Quando for fazer a refatoração
//   geral do frontend, extrair pra um módulo compartilhado
//   (wells-selector.js).
//
// Depende de: app.js (state.geoWells, CONFIG, log, getFetchHeaders)
// ===============================================

// ===============================================
// ESTADO LOCAL DA ABA
// (encapsulado aqui em vez de poluir o state global)
// ===============================================

const geoPortalState = {
  wells: [],         // Poços selecionados (objetos completos do state.geoWells)
  currentUrl: null,  // URL da última visualização gerada
  realUrl: null      // URL real do Flávio (vem do /api/geoportal-config).
  // Se null, mostra mensagem amigável em vez de gerar.
};

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
  errorText: document.getElementById("geoPortalErrorText")
};

// ===============================================
// ADICIONAR / REMOVER POÇOS (individual)
// ===============================================

function addGeoPortalWell() {
  const wellId = geoPortalElements.wellInput.value.trim();
  if (!wellId) return;

  // Já está na lista?
  if (geoPortalState.wells.find(w => w.id === wellId)) {
    log("Poço já adicionado ao Geo Portal", wellId);
    geoPortalElements.wellInput.value = "";
    return;
  }

  // Buscar nos poços disponíveis (carregados do PostgreSQL)
  const well = state.geoWells.find(w => w.id === wellId);
  if (!well) {
    showGeoPortalError(`Poço "${wellId}" não encontrado na base.`);
    return;
  }

  geoPortalState.wells.push(well);
  geoPortalElements.wellInput.value = "";

  updateGeoPortalWellsDisplay();
  clearGeoPortalError();
  log("Poço adicionado ao Geo Portal", well.id);
}

function removeGeoPortalWell(wellId) {
  geoPortalState.wells = geoPortalState.wells.filter(w => w.id !== wellId);
  updateGeoPortalWellsDisplay();
  log("Poço removido do Geo Portal", wellId);
}

// ===============================================
// REMOVER POR GRUPO (bacia ou campo inteiros)
// ===============================================

function removeBaciaFromGeoPortal(bacia) {
  const antes = geoPortalState.wells.length;
  geoPortalState.wells = geoPortalState.wells.filter(
    w => (w.bacia || "Sem Bacia") !== bacia
  );
  updateGeoPortalWellsDisplay();
  log(`Bacia removida do Geo Portal: ${bacia}`, {
    removidos: antes - geoPortalState.wells.length,
    restantes: geoPortalState.wells.length
  });
}

function removeCampoFromGeoPortal(bacia, campo) {
  const antes = geoPortalState.wells.length;
  geoPortalState.wells = geoPortalState.wells.filter(w =>
    !((w.bacia || "Sem Bacia") === bacia && (w.campo || "Sem Campo") === campo)
  );
  updateGeoPortalWellsDisplay();
  log(`Campo removido do Geo Portal: ${campo} (${bacia})`, {
    removidos: antes - geoPortalState.wells.length,
    restantes: geoPortalState.wells.length
  });
}

// ===============================================
// SIDEBAR HIERÁRQUICA (Bacia → Campo → Poços)
// ===============================================

// Sanitiza string pra ser usada como ID HTML (sem espaços, acentos, etc)
function sanitizeGeoPortalId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, "_");
}

// Expande/recolhe um grupo na sidebar
function toggleGeoPortalGroup(groupId) {
  const items = document.getElementById(`geoportal-group-${groupId}`);
  const arrow = document.getElementById(`geoportal-arrow-${groupId}`);

  if (!items || !arrow) return;

  if (items.style.display === "none") {
    items.style.display = "block";
    arrow.classList.add("expanded");
  } else {
    items.style.display = "none";
    arrow.classList.remove("expanded");
  }
}

function updateGeoPortalWellsDisplay() {
  const count = geoPortalState.wells.length;

  geoPortalElements.wellCount.textContent = `(${count})`;
  geoPortalElements.statusWells.textContent = count;

  if (count === 0) {
    geoPortalElements.wellsList.innerHTML =
      "<div class=\"placeholder-text\">Nenhum poço selecionado</div>";
    updateGeoPortalGenerateButton();
    return;
  }

  // Agrupa em 3 níveis: Bacia → Campo → Poços
  const hierarchy = {};
  geoPortalState.wells.forEach(well => {
    const bacia = well.bacia || "Sem Bacia";
    const campo = well.campo || "Sem Campo";
    if (!hierarchy[bacia]) hierarchy[bacia] = {};
    if (!hierarchy[bacia][campo]) hierarchy[bacia][campo] = [];
    hierarchy[bacia][campo].push(well);
  });

  const sortedBacias = Object.keys(hierarchy).sort();

  geoPortalElements.wellsList.innerHTML = sortedBacias.map(bacia => {
    const campos = hierarchy[bacia];
    const baciaId = sanitizeGeoPortalId(bacia);
    const baciaWellCount = Object.values(campos).reduce((sum, wells) => sum + wells.length, 0);
    const sortedCampos = Object.keys(campos).sort();
    const baciaSafe = bacia.replace(/'/g, "\\'");

    return `
      <div class="well-group">
        <div class="well-group-header" onclick="toggleGeoPortalGroup('bacia-${baciaId}')">
          <svg class="well-group-arrow" id="geoportal-arrow-bacia-${baciaId}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="well-group-name">${bacia}</span>
          <span class="well-group-count">${baciaWellCount}</span>
          <button class="btn-remove-group" onclick="event.stopPropagation(); removeBaciaFromGeoPortal('${baciaSafe}')" title="Remover bacia">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="well-group-items" id="geoportal-group-bacia-${baciaId}" style="display: none;">
          ${sortedCampos.map(campo => {
    const campoId = sanitizeGeoPortalId(`${bacia}_${campo}`);
    const campoWells = campos[campo];
    const campoSafe = campo.replace(/'/g, "\\'");

    return `
              <div class="well-subgroup">
                <div class="well-subgroup-header" onclick="toggleGeoPortalGroup('campo-${campoId}')">
                  <svg class="well-group-arrow" id="geoportal-arrow-campo-${campoId}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <span class="well-subgroup-name">${campo}</span>
                  <span class="well-subgroup-count">${campoWells.length}</span>
                  <button class="btn-remove-group" onclick="event.stopPropagation(); removeCampoFromGeoPortal('${baciaSafe}', '${campoSafe}')" title="Remover campo">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <div class="well-subgroup-items" id="geoportal-group-campo-${campoId}" style="display: none;">
                  ${campoWells.map(well => `
                    <div class="map-well-item well-item-deep">
                      <span class="well-label">
                        <span class="well-marker-dot"></span>
                        <span>${well.id}</span>
                      </span>
                      <button class="btn-remove" onclick="removeGeoPortalWell('${well.id}')" title="Remover poço">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
  }).join("")}
        </div>
      </div>
    `;
  }).join("");

  updateGeoPortalGenerateButton();
}

// ===============================================
// FILTROS POR BACIA / CAMPO
// (population inicial é feita por populateGeoPortalBasinFilter,
//  chamada uma vez quando state.geoWells é carregado)
// ===============================================

function populateGeoPortalBasinFilter() {
  const bacias = [...new Set(
    state.geoWells
      .map(w => w.bacia)
      .filter(b => b && b.trim() !== "")
  )].sort();

  geoPortalElements.baciaSelect.innerHTML =
    "<option value=\"\">Selecione uma bacia...</option>" +
    bacias.map(b => `<option value="${b}">${b}</option>`).join("");
}

function onGeoPortalBaciaChange() {
  const selectedBacia = geoPortalElements.baciaSelect.value;

  // Sempre limpar e desabilitar o select de campos quando muda bacia
  geoPortalElements.campoSelect.innerHTML = "<option value=\"\">Todos os campos</option>";
  geoPortalElements.campoSelect.disabled = !selectedBacia;

  if (!selectedBacia) {
    updateGeoPortalFilterCount();
    return;
  }

  // Listar campos da bacia selecionada
  const campos = [...new Set(
    state.geoWells
      .filter(w => w.bacia === selectedBacia)
      .map(w => w.campo)
      .filter(c => c && c.trim() !== "")
  )].sort();

  geoPortalElements.campoSelect.innerHTML =
    "<option value=\"\">Todos os campos</option>" +
    campos.map(c => `<option value="${c}">${c}</option>`).join("");

  updateGeoPortalFilterCount();
}

function updateGeoPortalFilterCount() {
  const count = getGeoPortalFilteredWells().length;

  if (geoPortalElements.filterCount) {
    const pinIcon = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path><circle cx=\"12\" cy=\"10\" r=\"3\"></circle></svg>";

    if (count > 0) {
      geoPortalElements.filterCount.innerHTML = `${pinIcon} ${count} poço(s) encontrado(s)`;
      geoPortalElements.filterCount.classList.add("has-results");
    } else {
      geoPortalElements.filterCount.innerHTML = "Selecione uma bacia";
      geoPortalElements.filterCount.classList.remove("has-results");
    }
  }

  if (geoPortalElements.addByFilterBtn) {
    geoPortalElements.addByFilterBtn.disabled = count === 0;
  }
}

function getGeoPortalFilteredWells() {
  const selectedBacia = geoPortalElements.baciaSelect.value;
  const selectedCampo = geoPortalElements.campoSelect.value;

  if (!selectedBacia) return [];

  return state.geoWells.filter(w => {
    if (w.bacia !== selectedBacia) return false;
    if (selectedCampo && w.campo !== selectedCampo) return false;
    return true;
  });
}

function addGeoPortalWellsByFilter() {
  const filteredWells = getGeoPortalFilteredWells();

  if (filteredWells.length === 0) {
    showGeoPortalError("Nenhum poço corresponde ao filtro selecionado");
    return;
  }

  let added = 0;
  filteredWells.forEach(well => {
    if (!geoPortalState.wells.find(w => w.id === well.id)) {
      geoPortalState.wells.push(well);
      added++;
    }
  });

  updateGeoPortalWellsDisplay();
  clearGeoPortalError();

  const bacia = geoPortalElements.baciaSelect.value;
  const campo = geoPortalElements.campoSelect.value;
  log(`${added} poço(s) adicionado(s) via filtro (bacia=${bacia}${campo ? ", campo=" + campo : ""})`);
}

// ===============================================
// BOTÃO GERAR - HABILITA SÓ SE TEM POÇO
// ===============================================

function updateGeoPortalGenerateButton() {
  geoPortalElements.generateBtn.disabled = geoPortalState.wells.length === 0;
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

  // Monta payload conforme contrato com /api/geoportal/sessions
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
    // Quando o Flávio terminar a app dele e infra adicionar GEOPORTAL_REAL_URL
    // no .env, essa URL aponta automaticamente pra app dele.
    const iframeUrl = `${geoPortalState.realUrl}?sid=${data.sid}`;

    geoPortalState.currentUrl = iframeUrl;
    showGeoPortalIframe(iframeUrl);

  } catch (error) {
    console.error("Erro ao gerar visualização Geo Portal:", error);
    showGeoPortalError(error.message || "Erro ao gerar visualização");
  } finally {
    hideGeoPortalLoading();
  }
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

function showGeoPortalIframe(url) {
  geoPortalElements.placeholder.style.display = "none";
  geoPortalElements.frame.src = url;
  geoPortalElements.frame.style.display = "block";

  const wellWord = geoPortalState.wells.length === 1 ? "poço" : "poços";
  geoPortalElements.title.textContent =
    `Geo Portal: ${geoPortalState.wells.length} ${wellWord}`;
}

// ===============================================
// LIMPAR TUDO
// ===============================================

function clearGeoPortalSelection() {
  geoPortalState.wells = [];
  geoPortalState.currentUrl = null;

  // Resetar inputs
  geoPortalElements.wellInput.value = "";

  // Resetar filtros
  geoPortalElements.baciaSelect.value = "";
  geoPortalElements.campoSelect.innerHTML = "<option value=\"\">Todos os campos</option>";
  geoPortalElements.campoSelect.disabled = true;
  updateGeoPortalFilterCount();

  // Resetar iframe e placeholder (restaura o conteúdo original do placeholder,
  // caso tenha sido substituído pela mensagem de "indisponível")
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

  updateGeoPortalWellsDisplay();
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
  updateGeoPortalGenerateButton(); // reavalia o disabled
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
// CARREGAR CONFIG DO BACKEND
// (descobre se Geo Portal tem URL real configurada ou se mostra
//  mensagem amigável de "em integração")
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
    // Em caso de erro, assume que não tem URL real (comportamento seguro)
    geoPortalState.realUrl = null;
    geoPortalElements.statusEndpoint.textContent = "❌ Erro ao verificar";
    geoPortalElements.statusEndpoint.style.color = "var(--danger)";
  }
}

// ===============================================
// SETUP DE EVENT LISTENERS
// ===============================================

function setupGeoPortalEventListeners() {
  // Adicionar poço individual
  geoPortalElements.addWellBtn.addEventListener("click", addGeoPortalWell);
  geoPortalElements.wellInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGeoPortalWell();
    }
  });

  // Filtros bacia/campo
  geoPortalElements.baciaSelect.addEventListener("change", onGeoPortalBaciaChange);
  geoPortalElements.campoSelect.addEventListener("change", updateGeoPortalFilterCount);
  geoPortalElements.addByFilterBtn.addEventListener("click", addGeoPortalWellsByFilter);

  // Ações principais
  geoPortalElements.generateBtn.addEventListener("click", generateGeoPortalVisualization);
  geoPortalElements.clearBtn.addEventListener("click", clearGeoPortalSelection);

  // Popular datalist e filtro de bacias com os poços disponíveis
  populateGeoPortalDatalist();
  populateGeoPortalBasinFilter();

  // Carregar config (feature flag - assíncrono mas não bloqueia o setup)
  loadGeoPortalConfig();

  log("Geo Portal: event listeners configurados");
}

// ===============================================
// EXPOSIÇÃO GLOBAL
// (necessária porque os onclick são inline no HTML
//  gerado dinamicamente em updateGeoPortalWellsDisplay)
// ===============================================

window.removeGeoPortalWell = removeGeoPortalWell;
window.removeBaciaFromGeoPortal = removeBaciaFromGeoPortal;
window.removeCampoFromGeoPortal = removeCampoFromGeoPortal;
window.toggleGeoPortalGroup = toggleGeoPortalGroup;
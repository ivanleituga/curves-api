// ===============================================
// GEOPORTAL.JS - Aba Geo Portal
//
// Integração com a aplicação ArcGIS interna da K2
// Sistemas (mantida pelo Flávio).
//
// FLUXO:
//   1. Usuário adiciona 1+ poços (da lista state.geoWells)
//   2. Clica em "Gerar Visualização ArcGIS"
//   3. Frontend envia POST /api/geoportal/generate
//   4. Backend retorna { visualizationUrl, ... }
//   5. Frontend renderiza essa URL em <iframe>
//
// CONTRATO DO POST (acordado em reunião - a confirmar com Flávio):
//   Request:  {
//     wells: [{ name, lat, lng }, ...],
//     context: {...}
//   }
//   Response: { status, visualizationUrl, expiresAt }
//
// Em desenvolvimento: o endpoint é MOCK - retorna uma
// página HTML simulada servida pelo próprio backend.
//
// Depende de: app.js (state.geoWells, CONFIG, log, getFetchHeaders)
// ===============================================

// ===============================================
// ESTADO LOCAL DA ABA
// (mantemos encapsulado aqui em vez de poluir o state global)
// ===============================================

const geoPortalState = {
  wells: [],         // Poços selecionados (objetos completos do state.geoWells)
  currentUrl: null   // URL da última visualização gerada
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

  // Ações
  generateBtn: document.getElementById("geoPortalGenerateBtn"),
  btnText: document.getElementById("geoPortalBtnText"),
  btnLoader: document.getElementById("geoPortalBtnLoader"),
  clearBtn: document.getElementById("geoPortalClearBtn"),

  // Status
  statusWells: document.getElementById("geoPortalStatusWells"),

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
// SELEÇÃO DE POÇOS
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

function updateGeoPortalWellsDisplay() {
  const count = geoPortalState.wells.length;

  geoPortalElements.wellCount.textContent = `(${count})`;
  geoPortalElements.statusWells.textContent = count;

  if (count === 0) {
    geoPortalElements.wellsList.innerHTML =
      "<div class=\"placeholder-text\">Nenhum poço selecionado</div>";
  } else {
    // Renderiza cada poço como um item removível.
    // Escapamos apóstrofos no id para evitar quebrar o onclick inline.
    geoPortalElements.wellsList.innerHTML = geoPortalState.wells.map(w => {
      const safeId = w.id.replace(/'/g, "\\'");
      const baciaLabel = w.bacia
        ? `<small class="geoportal-well-bacia">${w.bacia}</small>`
        : "";
      return `
        <div class="map-well-item">
          <span class="well-label">
            <span>${w.id}</span>
            ${baciaLabel}
          </span>
          <button class="btn-remove" onclick="removeGeoPortalWell('${safeId}')" title="Remover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
    }).join("");
  }

  updateGeoPortalGenerateButton();
}

// ===============================================
// BOTÃO GERAR - HABILITA SÓ SE TEM POÇO
// ===============================================

function updateGeoPortalGenerateButton() {
  geoPortalElements.generateBtn.disabled = geoPortalState.wells.length === 0;
}

// ===============================================
// GERAR VISUALIZAÇÃO (POST → iframe)
// ===============================================

async function generateGeoPortalVisualization() {
  clearGeoPortalError();
  showGeoPortalLoading();

  // Monta o payload conforme o contrato acordado.
  // Cada poço vai como objeto { name, lat, lng } - estrutura coesa
  // que evita erros de desalinhamento entre listas paralelas.
  const payload = {
    wells: geoPortalState.wells.map(w => ({
      name: w.id,
      lat: w.lat,
      lng: w.lng
    })),
    context: {
      requestedBy: "visualizador-curvas",
      requestId: `req-${Date.now()}`
    }
  };

  log("Enviando requisição ao Geo Portal", payload);

  try {
    const response = await fetch(`${CONFIG.API_URL}/geoportal/generate`, {
      method: "POST",
      headers: getFetchHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    log("Resposta do Geo Portal", data);

    if (!data.visualizationUrl) {
      throw new Error("Resposta sem URL de visualização");
    }

    geoPortalState.currentUrl = data.visualizationUrl;
    showGeoPortalIframe(data.visualizationUrl);

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

// ===============================================
// LIMPAR TUDO
// ===============================================

function clearGeoPortalSelection() {
  geoPortalState.wells = [];
  geoPortalState.currentUrl = null;

  // Resetar input
  geoPortalElements.wellInput.value = "";

  // Resetar iframe
  geoPortalElements.frame.src = "about:blank";
  geoPortalElements.frame.style.display = "none";
  geoPortalElements.placeholder.style.display = "flex";
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
    // state.geoWells ainda não carregou - voltaremos quando carregar.
    // Como app.js já aguarda loadGeoWells() antes de chamar
    // setupGeoPortalEventListeners(), isso só cai aqui em caso de erro.
    return;
  }

  // Mesmo formato usado no datalist da aba Mapas (consistência)
  geoPortalElements.wellsDatalist.innerHTML = state.geoWells
    .map(well => `<option value="${well.id}">${well.name} (${well.bacia || "—"})</option>`)
    .join("");
}

// ===============================================
// SETUP DE EVENT LISTENERS
// ===============================================

function setupGeoPortalEventListeners() {
  // Adicionar poço (botão + Enter no input)
  geoPortalElements.addWellBtn.addEventListener("click", addGeoPortalWell);
  geoPortalElements.wellInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGeoPortalWell();
    }
  });

  // Ações principais
  geoPortalElements.generateBtn.addEventListener("click", generateGeoPortalVisualization);
  geoPortalElements.clearBtn.addEventListener("click", clearGeoPortalSelection);

  // Popular datalist com os poços disponíveis
  populateGeoPortalDatalist();

  log("Geo Portal: event listeners configurados");
}

// Exposição global necessária porque o onclick é inline no HTML
// gerado dinamicamente em updateGeoPortalWellsDisplay().
// Mesmo padrão que map-google.js usa pra removeWellFromMap.
window.removeGeoPortalWell = removeGeoPortalWell;
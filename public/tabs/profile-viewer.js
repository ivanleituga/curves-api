// ===============================================
// PROFILE-VIEWER.JS - Aba de Perfis Compostos
//
// Depende de: app.js (state, elements, CONFIG,
//   log, showError, clearError, clearToken,
//   updateStatus, getFetchHeaders, getTokenHashPart,
//   switchTab)
// ===============================================

// ===============================================
// CARREGAR CURVAS DO POÇO
// ===============================================

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

// ===============================================
// SELETOR DE CURVAS (chips clicáveis)
// ===============================================

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

// ===============================================
// LOADING / EXIBIÇÃO DE IMAGEM
// ===============================================

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

// ===============================================
// URL DO PERFIL
// ===============================================

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

// ===============================================
// AÇÕES DO VIEWER
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

// ===============================================
// EVENT LISTENERS - VIEWER
// ===============================================

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
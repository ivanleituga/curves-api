// ===============================================
// MAP-GOOGLE.JS - Aba Google Maps
//
// REFATORADO v8.4:
//   Toda a lógica de filtros bacia/campo e sidebar hierárquica
//   foi extraída pra shared/wells-selector.js (compartilhada
//   com a aba Geo Portal). Aqui ficou só o que é específico
//   do Google Maps: carregar API, renderizar mapa, marcadores,
//   clusters, sessões compartilháveis.
//
// Depende de:
//   - app.js (state, mapElements, elements, CONFIG, log,
//     showMapError, clearMapError, getFetchHeaders,
//     getTokenHashPart, switchTab)
//   - shared/wells-selector.js (createWellsSelector)
// ===============================================

// ===============================================
// INSTÂNCIA DO SELECTOR (filtros + sidebar)
//
// Criada quando setupMapEventListeners() é chamado.
// Encapsula toda a lógica compartilhada com a aba Geo Portal.
// ===============================================

let mapSelector = null;

// ===============================================
// CARREGAR GOOGLE MAPS API
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
// GERAR MAPA
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

// ===============================================
// LOADING DO MAPA
// ===============================================

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

// ===============================================
// EXIBIR MAPA COM MARCADORES
// ===============================================

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
      map: null, // Clusterer gerencia a exibição
      title: well.name,
      icon: pinIcon,
      label: {
        text: well.name,
        className: "well-pin-label"
      }
    };

    const marker = new google.maps.Marker(markerOptions);
    marker.wellId = well.name;

    // Conteúdo do InfoWindow
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
          <button onclick="viewWellProfile('${well.name}')"
            style="margin-top: 10px; width: 100%; padding: 7px; background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; border: none; border-radius: 4px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; font-family: 'Inter', -apple-system, sans-serif;">
            Ver Perfil
          </button>
        </div>
      </div>
    `;

    // Spiderfier gerencia cliques quando disponível
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

  // Evento de clique do spiderfier
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

  // Static Maps API tem limite de ~8192 chars na URL
  if (wells.length > 150) {
    mapElements.downloadMapBtn.disabled = true;
    mapElements.downloadMapBtn.title = `Download indisponível para ${wells.length} poços (limite: 150). Use print screen ou clique com botão direito no mapa.`;
  } else {
    mapElements.downloadMapBtn.disabled = false;
    mapElements.downloadMapBtn.title = "Baixar imagem do mapa";
  }

  mapElements.mapTitle.textContent = `Mapa: ${wells.length} poço(s)`;

  log("Mapa interativo exibido", { wellsCount: wells.length });
}

// ===============================================
// VER PERFIL A PARTIR DO MAPA
// ===============================================

function viewWellProfile(wellId) {
  switchTab("viewer");

  elements.wellInput.value = wellId;

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
// ADICIONAR POÇO INDIVIDUAL
// (a remoção delegada pro selector via callback - veja setupMapEventListeners)
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

  mapSelector.renderWellsList();
  onMapWellsChanged();
  clearMapError();

  log("Poço adicionado ao mapa", well);
}

// ===============================================
// CALLBACKS DO SELECTOR
// (passados como config quando criamos o mapSelector)
// ===============================================

/**
 * Remove o marcador correspondente quando o selector remove
 * o poço da lista. Chamado pra cada poço removido (individual
 * ou em grupo via bacia/campo).
 */
function removeMapMarker(wellId) {
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
}

/**
 * Chamado pelo selector depois de qualquer mudança na lista
 * de poços (add por filtro, remove por bacia/campo, etc.).
 * Atualiza contadores e estado do botão "Gerar Mapa".
 */
function onMapWellsChanged() {
  mapElements.mapStatusCount.textContent = state.mapWells.length;
  mapElements.generateMapBtn.disabled = state.mapWells.length === 0;
}

// ===============================================
// LIMPAR SELEÇÃO
// ===============================================

function clearMapSelection() {
  state.mapWells = [];
  state.mapWellsCoordinates = [];
  state.currentSessionId = null;

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

  // Selector atualiza sidebar e reseta filtros
  mapSelector.renderWellsList();
  mapSelector.resetFilters();
  onMapWellsChanged();

  log("Seleção de mapa limpa");
}

// ===============================================
// URL COM SESSÃO (links compartilháveis)
// ===============================================

async function updateMapURLWithSession() {
  try {
    const wellIds = state.mapWells.map(w => w.id);

    const filters = {};
    if (mapElements.baciaSelect.value) {
      filters.bacia = mapElements.baciaSelect.value;
    }
    if (mapElements.campoSelect.value) {
      filters.campo = mapElements.campoSelect.value;
    }

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

    const visibleURL = `/?sid=${data.sessionId}#maps`;
    window.history.replaceState({}, "", visibleURL);

    const tokenPart = getTokenHashPart();
    const shareableURL = `${window.location.origin}/?sid=${data.sessionId}#${tokenPart}maps`;
    mapElements.generatedMapLink.value = shareableURL;
    mapElements.mapLinkPanel.classList.remove("hidden");

    log("Sessão criada e URL atualizada", {
      sessionId: data.sessionId,
      wellCount: data.wellCount
    });

  } catch (error) {
    log("Erro ao criar sessão, usando formato antigo", error.message);
    updateMapURLLegacy();
  }
}

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

// ===============================================
// PROCESSAR URL (sessão ou formato legado)
// ===============================================

async function processSessionURLParam(sessionId) {
  log("Processando sessão da URL", sessionId);

  switchTab("maps");

  try {
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

    if (state.geoWells.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    data.wells.forEach(wellId => {
      const well = state.geoWells.find(w => w.id === wellId);
      if (well && !state.mapWells.find(w => w.id === well.id)) {
        state.mapWells.push(well);
      }
    });

    mapSelector.renderWellsList();
    onMapWellsChanged();

    if (state.mapWells.length > 0) {
      log("Gerando mapa automaticamente da sessão");
      setTimeout(() => generateMap(), 500);
    }

  } catch (error) {
    log("Erro ao processar sessão", error.message);
    showMapError("Erro ao carregar mapa compartilhado.");
  }
}

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

  mapSelector.renderWellsList();
  onMapWellsChanged();

  if (state.mapWells.length > 0) {
    log("Gerando mapa automaticamente da URL");
    setTimeout(() => generateMap(), 500);
  }
}

// ===============================================
// DOWNLOAD DO MAPA ESTÁTICO
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
// EVENT LISTENERS - GOOGLE MAPS
// ===============================================

function setupMapEventListeners() {
  // Cria a instância do selector com config específica desta aba.
  // O selector cuida de filtros, sidebar e remoções (individual e em grupo).
  mapSelector = createWellsSelector({
    selectedWells: state.mapWells,
    elements: {
      baciaSelect: mapElements.baciaSelect,
      campoSelect: mapElements.campoSelect,
      addByFilterBtn: mapElements.addByFilterBtn,
      filterCount: mapElements.filterCount,
      wellsList: mapElements.wellsList,
      wellCount: mapElements.wellCount
    },
    idPrefix: "map",
    onWellRemoved: removeMapMarker,
    onWellsChanged: onMapWellsChanged,
    onError: showMapError,
    clearError: clearMapError
  });

  // Botões e inputs
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

  // Filtros — handlers do selector
  mapElements.baciaSelect.addEventListener("change", () => mapSelector.onBaciaChange());
  mapElements.campoSelect.addEventListener("change", () => mapSelector.updateFilterCount());
  mapElements.addByFilterBtn.addEventListener("click", () => mapSelector.addWellsByFilter());

  // Renderização inicial (lista vazia + filtros populados)
  mapSelector.renderWellsList();
  mapSelector.populateBasinFilter();
}

// ===============================================
// EXPOSIÇÃO GLOBAL
// (onclick inline no HTML gerado dinamicamente pelo selector)
// ===============================================

// Funções "fromMap" delegam pro selector (que sabe lidar com lista,
// callback de marcador, etc.)
window.removeWellFromMap = (wellId) => mapSelector.removeWell(wellId);
window.removeBaciaFromMap = (bacia) => mapSelector.removeBacia(bacia);
window.removeCampoFromMap = (bacia, campo) => mapSelector.removeCampo(bacia, campo);
window.toggleMapGroup = (groupId) => mapSelector.toggleGroup(groupId);

// viewWellProfile permanece global (usado pelo InfoWindow do marcador)
window.viewWellProfile = viewWellProfile;
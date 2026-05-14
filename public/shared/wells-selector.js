// ===============================================
// WELLS-SELECTOR.JS - Lógica compartilhada de seleção de poços
//
// Extraído de map-google.js e geoportal.js, que tinham praticamente
// a mesma lógica de:
//   - filtros bacia/campo (selects encadeados, contador)
//   - sidebar hierárquica (Bacia → Campo → Poços com expansão)
//   - adicionar por filtro / remover por grupo
//
// PADRÃO USADO: factory.
// Cada aba chama `createWellsSelector(config)` passando seu próprio
// estado (lista de poços selecionados), elementos do DOM e prefixo de
// IDs. O factory retorna um objeto com as funções já configuradas.
// Sem variáveis globais novas, sem acoplamento entre as abas.
//
// Depende de: state.geoWells (global do app.js), log (global)
// ===============================================

/**
 * Cria um seletor de poços com filtros bacia/campo e sidebar hierárquica.
 *
 * @param {Object} config
 * @param {Array} config.selectedWells - referência ao array de poços selecionados (mutado)
 * @param {Object} config.elements - referências ao DOM da aba que está usando
 *   { baciaSelect, campoSelect, addByFilterBtn, filterCount, wellsList, wellCount }
 * @param {string} config.idPrefix - prefixo único pra IDs HTML gerados ("map" ou "geoportal")
 *   evita colisão de IDs entre abas que renderizam ao mesmo tempo
 * @param {Function} config.onWellRemoved - callback chamado quando 1 poço é removido
 *   recebe (wellId). Útil pra aba Maps remover marcador do Google Maps.
 * @param {Function} config.onWellsChanged - callback chamado depois de qualquer mudança
 *   na lista (add por filtro, remoção por bacia/campo, etc.). Útil pra atualizar
 *   status panel, botões disabled, etc.
 * @param {Function} config.onError - callback pra mostrar erro na UI da aba
 * @param {Function} config.clearError - callback pra limpar erro da UI da aba
 *
 * @returns {Object} API com funções:
 *   - populateBasinFilter() - popula o select de Bacia (chamar depois de loadGeoWells)
 *   - onBaciaChange() - handler do select de Bacia
 *   - updateFilterCount() - handler do select de Campo
 *   - addWellsByFilter() - adiciona poços que casam com o filtro atual
 *   - renderWellsList() - re-renderiza a sidebar hierárquica
 *   - removeWell(wellId) - remove um poço específico
 *   - removeBacia(bacia) - remove todos os poços de uma bacia
 *   - removeCampo(bacia, campo) - remove todos de um campo
 *   - toggleGroup(groupId) - expande/recolhe um grupo na sidebar
 *   - resetFilters() - reseta os selects e contador (sem mexer na lista)
 */
function createWellsSelector(config) {
  const {
    selectedWells,
    elements,
    idPrefix,
    onWellRemoved,
    onWellsChanged,
    onError,
    clearError
  } = config;

  // ===============================================
  // HELPERS PRIVADOS
  // ===============================================

  function sanitizeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, "_");
  }

  function getFilteredWells() {
    const selectedBacia = elements.baciaSelect.value;
    const selectedCampo = elements.campoSelect.value;

    if (!selectedBacia) return [];

    return state.geoWells.filter(w => {
      if (w.bacia !== selectedBacia) return false;
      if (selectedCampo && w.campo !== selectedCampo) return false;
      return true;
    });
  }

  // ===============================================
  // FILTROS POR BACIA / CAMPO
  // ===============================================

  function populateBasinFilter() {
    const bacias = [...new Set(
      state.geoWells
        .map(w => w.bacia)
        .filter(b => b && b.trim() !== "")
    )].sort();

    elements.baciaSelect.innerHTML =
      "<option value=\"\">Selecione uma bacia...</option>" +
      bacias.map(b => `<option value="${b}">${b}</option>`).join("");
  }

  function onBaciaChange() {
    const selectedBacia = elements.baciaSelect.value;

    elements.campoSelect.innerHTML = "<option value=\"\">Todos os campos</option>";
    elements.campoSelect.disabled = !selectedBacia;

    if (!selectedBacia) {
      updateFilterCount();
      return;
    }

    const campos = [...new Set(
      state.geoWells
        .filter(w => w.bacia === selectedBacia)
        .map(w => w.campo)
        .filter(c => c && c.trim() !== "")
    )].sort();

    elements.campoSelect.innerHTML =
      "<option value=\"\">Todos os campos</option>" +
      campos.map(c => `<option value="${c}">${c}</option>`).join("");

    updateFilterCount();
  }

  function updateFilterCount() {
    const count = getFilteredWells().length;

    if (elements.filterCount) {
      const pinIcon = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z\"></path><circle cx=\"12\" cy=\"10\" r=\"3\"></circle></svg>";

      if (count > 0) {
        elements.filterCount.innerHTML = `${pinIcon} ${count} poço(s) encontrado(s)`;
        elements.filterCount.classList.add("has-results");
      } else {
        elements.filterCount.innerHTML = "Selecione uma bacia";
        elements.filterCount.classList.remove("has-results");
      }
    }

    if (elements.addByFilterBtn) {
      elements.addByFilterBtn.disabled = count === 0;
    }
  }

  function addWellsByFilter() {
    const filteredWells = getFilteredWells();

    if (filteredWells.length === 0) {
      onError("Nenhum poço corresponde ao filtro selecionado");
      return;
    }

    let added = 0;
    filteredWells.forEach(well => {
      if (!selectedWells.find(w => w.id === well.id)) {
        selectedWells.push(well);
        added++;
      }
    });

    renderWellsList();
    clearError();
    onWellsChanged();

    const bacia = elements.baciaSelect.value;
    const campo = elements.campoSelect.value;
    log(`${added} poço(s) adicionado(s) via filtro (bacia=${bacia}${campo ? ", campo=" + campo : ""})`);
  }

  function resetFilters() {
    elements.baciaSelect.value = "";
    elements.campoSelect.innerHTML = "<option value=\"\">Todos os campos</option>";
    elements.campoSelect.disabled = true;
    updateFilterCount();
  }

  // ===============================================
  // REMOÇÃO (poço individual, bacia inteira, campo inteiro)
  // ===============================================

  function removeWell(wellId) {
    // Tira do array de selecionados
    const idx = selectedWells.findIndex(w => w.id === wellId);
    if (idx >= 0) selectedWells.splice(idx, 1);

    // Avisa a aba (que pode precisar limpar marcador, por exemplo)
    if (onWellRemoved) onWellRemoved(wellId);

    renderWellsList();
    onWellsChanged();
    log(`[${idPrefix}] Poço removido`, wellId);
  }

  function removeBacia(bacia) {
    const toRemove = selectedWells.filter(w => (w.bacia || "Sem Bacia") === bacia);
    toRemove.forEach(w => {
      if (onWellRemoved) onWellRemoved(w.id);
    });

    // Filtra de uma vez (mais eficiente que remover um por um)
    const restantes = selectedWells.filter(w => (w.bacia || "Sem Bacia") !== bacia);
    selectedWells.length = 0;
    selectedWells.push(...restantes);

    renderWellsList();
    onWellsChanged();
    log(`[${idPrefix}] Bacia removida: ${bacia}`, { removidos: toRemove.length, restantes: selectedWells.length });
  }

  function removeCampo(bacia, campo) {
    const toRemove = selectedWells.filter(w =>
      (w.bacia || "Sem Bacia") === bacia && (w.campo || "Sem Campo") === campo
    );
    toRemove.forEach(w => {
      if (onWellRemoved) onWellRemoved(w.id);
    });

    const restantes = selectedWells.filter(w =>
      !((w.bacia || "Sem Bacia") === bacia && (w.campo || "Sem Campo") === campo)
    );
    selectedWells.length = 0;
    selectedWells.push(...restantes);

    renderWellsList();
    onWellsChanged();
    log(`[${idPrefix}] Campo removido: ${campo} (${bacia})`, { removidos: toRemove.length, restantes: selectedWells.length });
  }

  // ===============================================
  // SIDEBAR HIERÁRQUICA (Bacia → Campo → Poços)
  // ===============================================

  function toggleGroup(groupId) {
    const items = document.getElementById(`${idPrefix}-group-${groupId}`);
    const arrow = document.getElementById(`${idPrefix}-arrow-${groupId}`);

    if (!items || !arrow) return;

    if (items.style.display === "none") {
      items.style.display = "block";
      arrow.classList.add("expanded");
    } else {
      items.style.display = "none";
      arrow.classList.remove("expanded");
    }
  }

  function renderWellsList() {
    const count = selectedWells.length;

    elements.wellCount.textContent = `(${count})`;

    if (count === 0) {
      elements.wellsList.innerHTML =
        "<div class=\"placeholder-text\">Nenhum poço selecionado</div>";
      return;
    }

    // Agrupa em 3 níveis: Bacia → Campo → Poços
    const hierarchy = {};
    selectedWells.forEach(well => {
      const bacia = well.bacia || "Sem Bacia";
      const campo = well.campo || "Sem Campo";
      if (!hierarchy[bacia]) hierarchy[bacia] = {};
      if (!hierarchy[bacia][campo]) hierarchy[bacia][campo] = [];
      hierarchy[bacia][campo].push(well);
    });

    const sortedBacias = Object.keys(hierarchy).sort();

    // Nomes das funções globais que serão usadas nos onclick inline.
    // O setup das abas registra essas funções globais (ex: window.removeWellFromMap)
    // que internamente chamam o método correto do selector.
    const fnRemoveWell = `removeWellFrom${capitalize(idPrefix)}`;
    const fnRemoveBacia = `removeBaciaFrom${capitalize(idPrefix)}`;
    const fnRemoveCampo = `removeCampoFrom${capitalize(idPrefix)}`;
    const fnToggle = `toggle${capitalize(idPrefix)}Group`;

    elements.wellsList.innerHTML = sortedBacias.map(bacia => {
      const campos = hierarchy[bacia];
      const baciaId = sanitizeId(bacia);
      const baciaWellCount = Object.values(campos).reduce((sum, wells) => sum + wells.length, 0);
      const sortedCampos = Object.keys(campos).sort();
      const baciaSafe = bacia.replace(/'/g, "\\'");

      return `
        <div class="well-group">
          <div class="well-group-header" onclick="${fnToggle}('bacia-${baciaId}')">
            <svg class="well-group-arrow" id="${idPrefix}-arrow-bacia-${baciaId}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span class="well-group-name">${bacia}</span>
            <span class="well-group-count">${baciaWellCount}</span>
            <button class="btn-remove-group" onclick="event.stopPropagation(); ${fnRemoveBacia}('${baciaSafe}')" title="Remover bacia">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="well-group-items" id="${idPrefix}-group-bacia-${baciaId}" style="display: none;">
            ${sortedCampos.map(campo => {
    const campoId = sanitizeId(`${bacia}_${campo}`);
    const campoWells = campos[campo];
    const campoSafe = campo.replace(/'/g, "\\'");

    return `
                <div class="well-subgroup">
                  <div class="well-subgroup-header" onclick="${fnToggle}('campo-${campoId}')">
                    <svg class="well-group-arrow" id="${idPrefix}-arrow-campo-${campoId}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <span class="well-subgroup-name">${campo}</span>
                    <span class="well-subgroup-count">${campoWells.length}</span>
                    <button class="btn-remove-group" onclick="event.stopPropagation(); ${fnRemoveCampo}('${baciaSafe}', '${campoSafe}')" title="Remover campo">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <div class="well-subgroup-items" id="${idPrefix}-group-campo-${campoId}" style="display: none;">
                    ${campoWells.map(well => `
                      <div class="map-well-item well-item-deep">
                        <span class="well-label">
                          <span class="well-marker-dot"></span>
                          <span>${well.id}</span>
                        </span>
                        <button class="btn-remove" onclick="${fnRemoveWell}('${well.id}')" title="Remover poço">
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
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ===============================================
  // API PÚBLICA (retornada pelo factory)
  // ===============================================
  return {
    populateBasinFilter,
    onBaciaChange,
    updateFilterCount,
    addWellsByFilter,
    renderWellsList,
    removeWell,
    removeBacia,
    removeCampo,
    toggleGroup,
    resetFilters
  };
}
// ===============================================
// MAP-ARCGIS.JS - Aba ArcGIS
//
// Depende de: app.js (state, arcgisElements,
//   CONFIG, log, getFetchHeaders)
//
// NOTA: O ArcGIS MapView não renderiza corretamente
// em divs reutilizados. A solução é criar um div
// .arcgis-map-instance novo a cada geração e remover
// o anterior. Um setTimeout de 100ms garante reflow
// do DOM antes de criar o MapView.
// ===============================================

// ===============================================
// ERROS DO ARCGIS
// ===============================================

function showArcGISError(message) {
  arcgisElements.errorContainer.classList.remove("hidden");
  arcgisElements.errorText.textContent = message;
  log("ERRO ARCGIS", message);
}

function clearArcGISError() {
  arcgisElements.errorContainer.classList.add("hidden");
  arcgisElements.errorText.textContent = "";
}

// ===============================================
// PAINEL LATERAL - INFO DOS POÇOS SELECIONADOS
// ===============================================

function updateArcGISWellInfo() {
  const count = state.mapWells.length;

  arcgisElements.wellCount.textContent = count;
  arcgisElements.generateBtn.disabled = count === 0;

  if (count === 0) {
    arcgisElements.wellInfo.innerHTML = "<p class=\"placeholder-text\">Selecione poços na aba \"Mapa de Poços\" e volte aqui para visualizar no ArcGIS.</p>";
  } else {
    // Resumo por bacia
    const bacias = {};
    state.mapWells.forEach(w => {
      const bacia = w.bacia || "Sem Bacia";
      if (!bacias[bacia]) bacias[bacia] = 0;
      bacias[bacia]++;
    });

    const resumo = Object.entries(bacias).sort((a, b) => a[0].localeCompare(b[0])).map(([bacia, qty]) =>
      `<div class="status-item"><span class="status-label">${bacia}</span><span class="status-value">${qty}</span></div>`
    ).join("");

    arcgisElements.wellInfo.innerHTML = `
      <div style="font-size: 0.8125rem; font-weight: 600; color: var(--gray-700); margin-bottom: 0.5rem;">${count} poço(s) selecionado(s)</div>
      ${resumo}
    `;
  }
}

// ===============================================
// GERAR MAPA ARCGIS
// ===============================================

async function generateArcGISMap() {
  if (state.mapWells.length === 0) {
    showArcGISError("Selecione poços na aba \"Mapa de Poços\" primeiro");
    return;
  }

  clearArcGISError();

  // Mostrar loading
  arcgisElements.generateBtn.disabled = true;
  arcgisElements.btnText.classList.add("hidden");
  arcgisElements.btnLoader.classList.remove("hidden");

  try {
    // Buscar API key do servidor
    const configResponse = await fetch(`${CONFIG.API_URL}/arcgis-config`);
    const config = await configResponse.json();

    if (!config.apiKey) {
      throw new Error("ArcGIS API Key não configurada no servidor");
    }

    log("ArcGIS API Key obtida, carregando mapa...");

    // Buscar coordenadas dos poços selecionados
    const wellNames = state.mapWells.map(w => w.id);
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
    log("Coordenadas recebidas para ArcGIS", { count: data.count });

    // Mostrar container e criar div novo para o mapa
    // (ArcGIS MapView não renderiza corretamente em divs reutilizados)
    arcgisElements.placeholder.style.display = "none";
    arcgisElements.mapContainer.style.cssText = "flex:1; position:relative; min-height:500px; border-radius:0.5rem; overflow:hidden;";

    // Remover div de mapa anterior se existir
    const oldMap = arcgisElements.mapContainer.querySelector(".arcgis-map-instance");
    if (oldMap) oldMap.remove();

    // Criar div novo
    const freshMapDiv = document.createElement("div");
    freshMapDiv.className = "arcgis-map-instance";
    freshMapDiv.style.cssText = "position:absolute; top:0; left:0; right:0; bottom:0; z-index:5;";
    arcgisElements.mapContainer.appendChild(freshMapDiv);

    // Aguardar reflow do DOM antes de criar o MapView
    setTimeout(() => {
      window.require([
        "esri/config",
        "esri/Map",
        "esri/views/MapView",
        "esri/Graphic",
        "esri/layers/GraphicsLayer",
        "esri/layers/FeatureLayer",
        "esri/geometry/Point",
        "esri/symbols/SimpleMarkerSymbol",
        "esri/PopupTemplate"
      ], function(esriConfig, Map, MapView, Graphic, GraphicsLayer, FeatureLayer, Point, SimpleMarkerSymbol, PopupTemplate) {

        // Configurar API Key
        esriConfig.apiKey = config.apiKey;

        // Preparar dados dos poços com info completa
        const wells = data.wells.map(w => {
          const fullWell = state.mapWells.find(mw => mw.id === w.name);
          return {
            name: w.name,
            lat: w.lat,
            lng: w.lng,
            state: w.state || "N/A",
            bacia: fullWell ? fullWell.bacia : "",
            campo: fullWell ? fullWell.campo : ""
          };
        });

        // Calcular centro
        const avgLat = wells.reduce((sum, w) => sum + w.lat, 0) / wells.length;
        const avgLng = wells.reduce((sum, w) => sum + w.lng, 0) / wells.length;

        // Destruir mapa anterior se existir
        if (state.arcgisMapView) {
          state.arcgisMapView.destroy();
          state.arcgisMapView = null;
        }

        // Criar mapa
        const map = new Map({
          basemap: "arcgis/topographic"
        });

        // Criar view
        const view = new MapView({
          container: freshMapDiv,
          map: map,
          center: [avgLng, avgLat],
          zoom: 6
        });

        state.arcgisMapView = view;

        // Criar graphics dos poços como source para FeatureLayer
        const graphics = wells.map((well, i) => ({
          geometry: {
            type: "point",
            longitude: well.lng,
            latitude: well.lat
          },
          attributes: {
            ObjectID: i,
            name: well.name,
            bacia: well.bacia,
            campo: well.campo,
            estado: well.state,
            lat: well.lat,
            lng: well.lng
          }
        }));

        // Popup template para clique nos poços
        const popupTemplate = new PopupTemplate({
          title: "{name}",
          content: [
            {
              type: "fields",
              fieldInfos: [
                { fieldName: "bacia", label: "Bacia" },
                { fieldName: "campo", label: "Campo" },
                { fieldName: "estado", label: "Estado" },
                { fieldName: "lat", label: "Latitude", format: { digitSeparator: false, places: 6 } },
                { fieldName: "lng", label: "Longitude", format: { digitSeparator: false, places: 6 } }
              ]
            }
          ]
        });

        // Criar FeatureLayer com clustering nativo
        const wellLayer = new FeatureLayer({
          title: "Poços",
          source: graphics,
          objectIdField: "ObjectID",
          fields: [
            { name: "ObjectID", type: "oid" },
            { name: "name", type: "string" },
            { name: "bacia", type: "string" },
            { name: "campo", type: "string" },
            { name: "estado", type: "string" },
            { name: "lat", type: "double" },
            { name: "lng", type: "double" }
          ],
          renderer: {
            type: "simple",
            symbol: {
              type: "simple-marker",
              color: [239, 68, 68],
              size: 8,
              outline: { color: [255, 255, 255], width: 1.5 }
            }
          },
          popupTemplate: popupTemplate,
          // Clustering nativo do ArcGIS
          featureReduction: {
            type: "cluster",
            clusterRadius: "80px",
            clusterMinSize: "24px",
            clusterMaxSize: "60px",
            labelingInfo: [{
              deconflictionStrategy: "none",
              labelExpressionInfo: {
                expression: "$feature.cluster_count"
              },
              symbol: {
                type: "text",
                color: "white",
                font: { size: 12, weight: "bold" }
              },
              labelPlacement: "center-center"
            }]
          },
          // Labels com nome do poço (visíveis no zoom alto)
          labelingInfo: [{
            labelExpressionInfo: { expression: "$feature.name" },
            symbol: {
              type: "text",
              color: "white",
              haloColor: [30, 58, 138, 200],
              haloSize: 1.5,
              font: { size: 9, weight: "bold" }
            },
            minScale: 150000
          }]
        });

        map.add(wellLayer);
        state.arcgisLayer = wellLayer;

        // Zoom para encaixar todos os poços
        view.when(() => {
          if (wells.length > 1) {
            const extent = {
              xmin: Math.min(...wells.map(w => w.lng)),
              ymin: Math.min(...wells.map(w => w.lat)),
              xmax: Math.max(...wells.map(w => w.lng)),
              ymax: Math.max(...wells.map(w => w.lat)),
              spatialReference: { wkid: 4326 }
            };
            view.goTo({ target: extent, padding: { top: 40, bottom: 40, left: 40, right: 40 } });
          }
        });

        arcgisElements.title.textContent = `ArcGIS: ${wells.length} poço(s)`;
        arcgisElements.apiStatus.textContent = "Conectada";
        arcgisElements.apiStatus.style.color = "var(--success)";

        log("Mapa ArcGIS gerado", { wellsCount: wells.length });
      });
    }, 100); // Aguardar reflow do DOM

  } catch (error) {
    console.error("Erro ao gerar mapa ArcGIS:", error);
    showArcGISError(error.message || "Erro ao gerar mapa ArcGIS");
  } finally {
    arcgisElements.generateBtn.disabled = state.mapWells.length === 0;
    arcgisElements.btnText.classList.remove("hidden");
    arcgisElements.btnLoader.classList.add("hidden");
  }
}

// ===============================================
// LIMPAR MAPA ARCGIS
// ===============================================

function clearArcGISMap() {
  if (state.arcgisMapView) {
    state.arcgisMapView.destroy();
    state.arcgisMapView = null;
    state.arcgisLayer = null;
  }

  // Remover div de mapa criado dinamicamente
  const oldMap = arcgisElements.mapContainer.querySelector(".arcgis-map-instance");
  if (oldMap) oldMap.remove();

  arcgisElements.placeholder.style.display = "flex";
  arcgisElements.mapContainer.style.cssText = "";
  arcgisElements.title.textContent = "Mapa ArcGIS";

  clearArcGISError();
  updateArcGISWellInfo();

  log("Mapa ArcGIS limpo");
}

// ===============================================
// EVENT LISTENERS - ARCGIS
// ===============================================

function setupArcGISEventListeners() {
  arcgisElements.generateBtn.addEventListener("click", generateArcGISMap);
  arcgisElements.clearBtn.addEventListener("click", clearArcGISMap);
}
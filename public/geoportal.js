// ===============================================
// GEOPORTAL.JS - Aba Geo Portal
//
// Objetivo: integração com a aplicação ArcGIS
// interna da K2 Sistemas (mantida por outro
// desenvolvedor da empresa).
//
// Fluxo previsto:
//   1. Usuário seleciona 1+ poços (reaproveita state.geoWells)
//   2. Usuário marca camadas de informação (litologia, produção, ...)
//   3. Clica em "Gerar Visualização ArcGIS"
//   4. Frontend envia POST para /api/geoportal/generate
//   5. Backend repassa para o endpoint real do Geo Portal
//   6. Resposta contém uma URL
//   7. Frontend renderiza essa URL num <iframe> à direita
//
// Contrato do POST (a confirmar com o colega do Geo Portal):
//   Request:  { wells: [...], layers: [...], context: {...} }
//   Response: { status, visualizationUrl, expiresAt }
//
// Status atual: esqueleto (aba criada, sem lógica ainda).
//
// Depende de: app.js (state, log, switchTab)
// ===============================================

// ===============================================
// ELEMENTOS DO DOM - GEO PORTAL
// ===============================================

// (nenhum ainda - serão adicionados nos próximos commits
//  conforme a UI de seleção/checkboxes/iframe for criada)

// ===============================================
// SETUP DE EVENT LISTENERS
// ===============================================

function setupGeoPortalEventListeners() {
  // Placeholder: ainda não há nada interativo na aba.
  // Esta função é chamada por app.js no DOMContentLoaded
  // e será preenchida nos próximos commits.
  log("Geo Portal: aba registrada (esqueleto, sem lógica ainda)");
}
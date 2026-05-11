// ===============================================
// ROUTES/CONFIG.JS - Endpoints de configuração
//
// Endpoints que expõem configs do .env pro frontend.
//
// GET /api/maps-config        → { apiKey } - Google Maps
// GET /api/arcgis-config      → { apiKey } - ArcGIS
// GET /api/geoportal-config   → { realUrl } - feature flag do Geo Portal
//                                Se GEOPORTAL_REAL_URL estiver definida no .env,
//                                o frontend usa essa URL no iframe. Caso contrário,
//                                mostra mensagem amigável de "em integração".
// ===============================================

const express = require("express");
const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const ARCGIS_API_KEY = process.env.ARCGIS_API_KEY || "";
const GEOPORTAL_REAL_URL = process.env.GEOPORTAL_REAL_URL || null;

router.get("/maps-config", (req, res) => {
  res.json({ apiKey: GOOGLE_MAPS_API_KEY || "" });
});

router.get("/arcgis-config", (req, res) => {
  res.json({ apiKey: ARCGIS_API_KEY || "" });
});

router.get("/geoportal-config", (req, res) => {
  // Se realUrl for null, o frontend mostra mensagem amigável.
  // Quando o Flávio entregar o endpoint dele, basta adicionar
  // GEOPORTAL_REAL_URL no .env e reiniciar o servidor.
  res.json({ realUrl: GEOPORTAL_REAL_URL });
});

module.exports = router;
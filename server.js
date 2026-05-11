// ===============================================
// SERVER.JS - Entry point
//
// Responsabilidades:
//   1. Carregar variáveis de ambiente (.env)
//   2. Configurar middlewares globais (CORS, JSON, static, bearer token)
//   3. Registrar as rotas (que vivem em routes/)
//   4. Agendar rotina de limpeza de sessões antigas
//   5. Subir o servidor HTTP
//
// O código de cada feature está em routes/<nome>.js.
// Conexão com o banco e helpers em db.js.
// ===============================================

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { pool } = require("./db");

// Carregar routers
const wellsRouter = require("./routes/wells");
const profileRouter = require("./routes/profile");
const mapRouter = require("./routes/map");
const geoportalRouter = require("./routes/geoportal");
const configRouter = require("./routes/config");
const healthRouter = require("./routes/health");

const app = express();
const PORT = process.env.PORT || 3001;

// ===============================================
// MIDDLEWARES GLOBAIS
// ===============================================

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.set("trust proxy", true);

/**
 * Extrai Bearer token do header Authorization e disponibiliza
 * em req.bearerToken para os handlers usarem. Não bloqueia
 * requests sem token (cada rota decide o que fazer).
 */
app.use((req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    req.bearerToken = authHeader.substring(7);
    console.log(`🔐 Bearer token detectado: ${req.bearerToken.substring(0, 20)}...`);
  } else {
    req.bearerToken = null;
    console.log("⚠️  Requisição sem Bearer token");
  }
  next();
});

// ===============================================
// REGISTRO DE ROTAS
// ===============================================

app.use("/api", wellsRouter);                    // /api/wells, /api/wells-geo, /api/wells/:id/curves
app.use("/api/generate-profile", profileRouter); // /api/generate-profile
app.use("/api", mapRouter);                      // /api/wells-coordinates, /api/static-map, /api/map-sessions/*
app.use("/api/geoportal", geoportalRouter);      // /api/geoportal/sessions/*, /api/geoportal/mock-view
app.use("/api", configRouter);                   // /api/maps-config, /api/arcgis-config
app.use("/api/health", healthRouter);            // /api/health

// ===============================================
// LIMPEZA AUTOMÁTICA DE SESSÕES ANTIGAS
// Remove sessões com mais de 30 dias a cada 24 horas
// (de map_sessions e geoportal_sessions)
// ===============================================

const SESSION_MAX_AGE_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function cleanupOldSessions() {
  // Lista de tabelas a limpar - se um dia tiver outra, é só adicionar aqui
  const tabelas = ["map_sessions", "geoportal_sessions"];

  for (const tabela of tabelas) {
    try {
      const result = await pool.query(
        `DELETE FROM ${tabela} WHERE created_at < NOW() - INTERVAL '${SESSION_MAX_AGE_DAYS} days' RETURNING id`
      );

      const count = result.rowCount;
      if (count > 0) {
        console.log(`🧹 Limpeza ${tabela}: ${count} sessão(ões) com mais de ${SESSION_MAX_AGE_DAYS} dias removida(s)`);
      } else {
        console.log(`🧹 Limpeza ${tabela}: nenhuma sessão antiga`);
      }
    } catch (error) {
      console.error(`❌ Erro na limpeza de ${tabela}:`, error.message);
    }
  }
}

// ===============================================
// INICIAR SERVIDOR
// ===============================================

const API_BASE_URL = process.env.API_BASE_URL || "http://swk2adm1-001.k2sistemas.com.br:9095";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const ARCGIS_API_KEY = process.env.ARCGIS_API_KEY || "";
const GEOPORTAL_REAL_URL = process.env.GEOPORTAL_REAL_URL || null;

app.listen(PORT, () => {
  const geoPortalStatus = GEOPORTAL_REAL_URL
    ? `✅ Real: ${GEOPORTAL_REAL_URL}`
    : "⚠️  Não configurado (frontend mostrará mensagem amigável)";

  console.log(`
    🚀 Curves API Server v8.4 (refatorado + feature flag Geo Portal)
    ==========================================
    Servidor: http://localhost:${PORT}
    
    📡 Fontes de dados:
    - API K2 (Perfis): ${API_BASE_URL}
    - PostgreSQL (Mapas): ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}
    - Google Maps: ${GOOGLE_MAPS_API_KEY ? "✅ Configurado" : "⚠️  Não configurado"}
    - ArcGIS: ${ARCGIS_API_KEY ? "✅ Configurado" : "⚠️  Não configurado"}
    - Geo Portal: ${geoPortalStatus}
    
    📍 Endpoints:
    - GET  /api/wells                       → Poços com DLIS (API K2)
    - GET  /api/wells-geo                   → Poços com coordenadas + bacia/campo (PostgreSQL)
    - GET  /api/wells/:id/curves            → Curvas de um poço
    - POST /api/generate-profile            → Gerar perfil composto
    - GET  /api/maps-config                 → Configuração Google Maps
    - GET  /api/arcgis-config               → Configuração ArcGIS
    - GET  /api/geoportal-config            → Feature flag do Geo Portal (realUrl)
    - POST /api/wells-coordinates           → Coordenadas para mapa
    - POST /api/static-map                  → URL do mapa estático
    - POST /api/map-sessions                → Criar sessão de mapa (Google Maps)
    - GET  /api/map-sessions/:id            → Buscar sessão de mapa
    - POST /api/geoportal/sessions          → Criar sessão Geo Portal (retorna SID)
    - GET  /api/geoportal/sessions/:sid     → Resolver SID Geo Portal (consumido pelo Flávio)
    - GET  /api/geoportal/mock-view         → Página mock do Geo Portal (debug manual)
    - GET  /api/health                      → Status dos serviços
    
    🧹 Limpeza de sessões: a cada 24h (retenção: ${SESSION_MAX_AGE_DAYS} dias)
    ==========================================
  `);

  cleanupOldSessions();
  setInterval(cleanupOldSessions, CLEANUP_INTERVAL_MS);
});
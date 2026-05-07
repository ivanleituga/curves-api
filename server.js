const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// URL da API externa (K2 - para perfis DLIS)
const API_BASE_URL = process.env.API_BASE_URL || "http://swk2adm1-001.k2sistemas.com.br:9095";

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

// ArcGIS API Key
const ARCGIS_API_KEY = process.env.ARCGIS_API_KEY || "";

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.set("trust proxy", true);

// ===============================================
// 🔐 MIDDLEWARE DE VALIDAÇÃO DE TOKEN
// ===============================================

/**
 * Extrai e valida Bearer token do header Authorization
 * Não bloqueia requisições sem token, apenas registra no req
 */
function extractBearerToken(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    req.bearerToken = authHeader.substring(7); // Remove "Bearer "
    console.log(`🔐 Bearer token detectado: ${req.bearerToken.substring(0, 20)}...`);
  } else {
    req.bearerToken = null;
    console.log("⚠️  Requisição sem Bearer token");
  }

  next();
}

// Aplicar middleware a todas as rotas
app.use(extractBearerToken);

// ===============================================
// FUNÇÕES AUXILIARES
// ===============================================

/**
 * Converte coordenada de graus:minutos:segundos para decimal
 * Formato do banco: "-18:22:40,186" → -18.3778
 */
function convertGMSToDecimal(gmsString) {
  if (!gmsString) return null;

  // Normalizar: trocar vírgula por ponto
  gmsString = gmsString.replace(",", ".");

  // Verificar sinal negativo
  const negative = gmsString.startsWith("-");
  gmsString = gmsString.replace("-", "");

  // Separar partes (graus:minutos:segundos)
  const parts = gmsString.split(":");
  if (parts.length !== 3) return null;

  try {
    const degrees = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);

    // Converter para decimal
    const decimal = degrees + (minutes / 60) + (seconds / 3600);

    return negative ? -decimal : decimal;
  } catch (error) {
    console.error("Erro ao converter coordenada:", gmsString, error);
    return null;
  }
}

/**
 * Gera um ID curto e aleatório para sessões de mapa
 * Retorna 12 caracteres hexadecimais (ex: "a1b2c3d4e5f6")
 */
function generateSessionId() {
  return crypto.randomBytes(6).toString("hex");
}

/**
 * Gera URL do Google Static Maps com múltiplos marcadores
 * Para > 26 poços, agrupa marcadores sem labels individuais
 * para não estourar o limite de 8192 caracteres da URL
 */
function generateStaticMapUrl(wells) {
  const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";

  // Parâmetros base
  const params = new URLSearchParams();
  params.set("size", "640x480");
  params.set("scale", "2");
  params.set("maptype", "terrain");
  params.set("key", GOOGLE_MAPS_API_KEY);

  // Se poucos poços, definir zoom fixo para não ficar muito próximo
  if (wells.length <= 2) {
    const avgLat = wells.reduce((sum, w) => sum + w.lat, 0) / wells.length;
    const avgLng = wells.reduce((sum, w) => sum + w.lng, 0) / wells.length;
    params.set("center", `${avgLat},${avgLng}`);
    params.set("zoom", "10");
  }

  let url = `${baseUrl}?${params.toString()}`;

  if (wells.length <= 26) {
    // Poucos poços: marcadores com labels A-Z
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    wells.forEach((well, index) => {
      const label = labels[index] || "";
      url += `&markers=color:red|label:${label}|${well.lat},${well.lng}`;
    });
  } else {
    // Muitos poços: agrupar marcadores sem label individual
    // Isso economiza URL porque todos ficam num único parâmetro &markers=
    // Formato: &markers=color:red|size:small|lat1,lng1|lat2,lng2|...

    // Dividir em grupos para respeitar limite de URL
    const MAX_PER_GROUP = 100;
    for (let i = 0; i < wells.length; i += MAX_PER_GROUP) {
      const group = wells.slice(i, i + MAX_PER_GROUP);
      const coords = group.map(w => `${w.lat},${w.lng}`).join("|");
      url += `&markers=color:red|size:small|${coords}`;
    }
  }

  return url;
}

/**
 * Escape simples de HTML para evitar injection nas strings
 * interpoladas na página mock. Como só aceitamos query strings
 * vindas de dentro do sistema, é mais uma boa prática que uma
 * necessidade crítica, mas vale a precaução.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===============================================
// 1. LISTAR POÇOS COM DLIS (API K2 - para Perfis)
// ===============================================
app.get("/api/wells", async (req, res) => {
  try {
    console.log("📋 Buscando poços da API externa (DLIS)...");

    // Incluir Bearer token se disponível
    const headers = {};
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }

    const response = await fetch(`${API_BASE_URL}/wells`, { headers });

    // Tratar erro 401 da API externa
    if (response.status === 401) {
      console.log("   ❌ API externa retornou 401 - Token inválido");
      return res.status(401).json({
        error: "Token inválido ou expirado",
        message: "Autenticação falhou na API externa"
      });
    }

    if (!response.ok) {
      throw new Error(`API externa retornou: ${response.status}`);
    }

    const data = await response.json();

    // Transformar para o formato esperado pelo frontend
    const wells = data.wells.map(wellId => ({
      id: wellId,
      name: wellId,
      field: "N/A",
      state: wellId.split("-").pop()
    }));

    console.log(`   ✅ ${wells.length} poços DLIS retornados`);
    res.json(wells);

  } catch (error) {
    console.error("❌ Erro ao buscar poços:", error);
    res.status(500).json({ error: "Erro ao buscar poços" });
  }
});

// ===============================================
// 2. LISTAR POÇOS COM COORDENADAS (PostgreSQL - para Mapas)
//    Agora inclui Bacia e Campo para filtros
// ===============================================
app.get("/api/wells-geo", async (req, res) => {
  try {
    console.log("🗺️  Buscando poços com coordenadas do PostgreSQL...");

    const sql = `
      SELECT "Poço", "Latitude da Base", "Longitude da Base", "Bacia", "Campo"
      FROM well_generalinfo_view
      WHERE "Latitude da Base" IS NOT NULL 
        AND "Longitude da Base" IS NOT NULL
      ORDER BY "Poço"
    `;

    const result = await pool.query(sql);

    // Converter coordenadas GMS → Decimal
    const wells = result.rows
      .map(row => {
        const lat = convertGMSToDecimal(row["Latitude da Base"]);
        const lng = convertGMSToDecimal(row["Longitude da Base"]);

        if (lat && lng) {
          return {
            id: row["Poço"],
            name: row["Poço"],
            state: row["Poço"].split("-").pop(),
            bacia: row["Bacia"] || "",
            campo: row["Campo"] || "",
            lat,
            lng
          };
        }
        return null;
      })
      .filter(w => w !== null);

    console.log(`   ✅ ${wells.length} poços com coordenadas válidas`);
    res.json(wells);

  } catch (error) {
    console.error("❌ Erro ao buscar poços do PostgreSQL:", error);
    res.status(500).json({ error: "Erro ao buscar poços com coordenadas" });
  }
});

// ===============================================
// 3. BUSCAR CURVAS DE UM POÇO (API K2)
// ===============================================
app.get("/api/wells/:wellId/curves", async (req, res) => {
  try {
    const { wellId } = req.params;
    console.log(`🔍 Buscando curvas do poço: ${wellId}`);

    // Incluir Bearer token se disponível
    const headers = {};
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }

    const response = await fetch(`${API_BASE_URL}/curves?well=${wellId}`, { headers });

    // Tratar erro 401 da API externa
    if (response.status === 401) {
      console.log("   ❌ API externa retornou 401 - Token inválido");
      return res.status(401).json({
        error: "Token inválido ou expirado",
        message: "Autenticação falhou na API externa"
      });
    }

    if (!response.ok) {
      throw new Error(`API externa retornou: ${response.status}`);
    }

    const data = await response.json();

    console.log(`   ✅ ${data.count} curvas encontradas`);

    res.json({
      wellId: data.well,
      wellName: data.well,
      curves: data.curves,
      totalCurves: data.count
    });

  } catch (error) {
    console.error("❌ Erro ao buscar curvas:", error);
    res.status(500).json({ error: "Erro ao buscar curvas" });
  }
});

// ===============================================
// 4. GERAR PERFIL (API K2)
// ===============================================
app.post("/api/generate-profile", async (req, res) => {
  try {
    const { well, curves, hasLito } = req.body;

    // Validações
    if (!well || !curves || !Array.isArray(curves)) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
        required: { well: "string", curves: "array", hasLito: "boolean" }
      });
    }

    if (curves.length < 1 || curves.length > 3) {
      return res.status(400).json({
        error: "Selecione entre 1 e 3 curvas",
        selected: curves.length
      });
    }

    console.log("📊 Gerando perfil:", { well, curves, hasLito });

    // Incluir Bearer token se disponível
    const headers = {
      "Content-Type": "application/json"
    };

    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }

    // Chamar API externa
    const response = await fetch(`${API_BASE_URL}/render_b64`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        well,
        curves,
        hasLito
      })
    });

    // Tratar erro 401 da API externa
    if (response.status === 401) {
      console.log("   ❌ API externa retornou 401 - Token inválido");
      return res.status(401).json({
        error: "Token inválido ou expirado",
        message: "Autenticação falhou na API externa"
      });
    }

    if (!response.ok) {
      throw new Error(`API retornou erro: ${response.status}`);
    }

    const data = await response.json();

    // Converter base64 para buffer e enviar como imagem
    const imageBuffer = Buffer.from(data.data, "base64");

    console.log(`   ✅ Perfil gerado: ${imageBuffer.length} bytes`);

    res.set("Content-Type", data.content_type || "image/png");
    res.send(imageBuffer);

  } catch (error) {
    console.error("❌ Erro ao gerar perfil:", error);
    res.status(500).json({ error: "Erro ao gerar perfil" });
  }
});

// ===============================================
// 5. CONFIG DO GOOGLE MAPS
// ===============================================
app.get("/api/maps-config", (req, res) => {
  res.json({
    apiKey: GOOGLE_MAPS_API_KEY || ""
  });
});

// ===============================================
// 5b. CONFIG DO ARCGIS
// ===============================================
app.get("/api/arcgis-config", (req, res) => {
  res.json({
    apiKey: ARCGIS_API_KEY || ""
  });
});

// ===============================================
// 6. BUSCAR COORDENADAS DE POÇOS (PostgreSQL - para mapa)
// ===============================================
app.post("/api/wells-coordinates", async (req, res) => {
  try {
    const { wellNames } = req.body;

    // Validações
    if (!wellNames || !Array.isArray(wellNames) || wellNames.length === 0) {
      return res.status(400).json({
        error: "Lista de poços é obrigatória",
        required: { wellNames: "array de strings" }
      });
    }

    console.log(`🗺️  Buscando coordenadas para ${wellNames.length} poço(s)`);

    const placeholders = wellNames.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `
      SELECT "Poço", "Latitude da Base", "Longitude da Base"
      FROM well_generalinfo_view
      WHERE "Poço" IN (${placeholders})
    `;

    const result = await pool.query(sql, wellNames);

    // Converter coordenadas GMS → Decimal
    const wells = result.rows
      .map(row => {
        const lat = convertGMSToDecimal(row["Latitude da Base"]);
        const lng = convertGMSToDecimal(row["Longitude da Base"]);

        if (lat && lng) {
          return {
            name: row["Poço"],
            lat,
            lng,
            state: row["Poço"].split("-").pop()
          };
        }
        return null;
      })
      .filter(w => w !== null);

    if (wells.length === 0) {
      return res.status(404).json({
        error: "Nenhum poço com coordenadas válidas encontrado"
      });
    }

    console.log(`   ✅ Coordenadas obtidas para ${wells.length} poço(s)`);

    res.json({
      wells,
      count: wells.length
    });

  } catch (error) {
    console.error("❌ Erro ao buscar coordenadas:", error);
    res.status(500).json({ error: "Erro ao buscar coordenadas dos poços" });
  }
});

// ===============================================
// 7. GERAR MAPA ESTÁTICO (PARA DOWNLOAD)
// ===============================================
app.post("/api/static-map", (req, res) => {
  try {
    const { wells } = req.body;

    // Validações
    if (!wells || !Array.isArray(wells) || wells.length === 0) {
      return res.status(400).json({
        error: "Lista de poços com coordenadas é obrigatória",
        required: { wells: "array com {name, lat, lng}" }
      });
    }

    // Verificar se temos API Key
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        error: "Google Maps API Key não configurada no servidor"
      });
    }

    console.log(`🖼️  Gerando URL do mapa estático para ${wells.length} poço(s)`);

    // Gerar URL do Static Maps
    const mapUrl = generateStaticMapUrl(wells);

    console.log("   ✅ URL gerada");

    res.json({
      mapUrl: mapUrl,
      count: wells.length
    });

  } catch (error) {
    console.error("❌ Erro ao gerar mapa estático:", error);
    res.status(500).json({ error: "Erro ao gerar mapa estático" });
  }
});

// ===============================================
// 8. CRIAR SESSÃO DE MAPA (salvar seleção no banco)
//    Recebe lista de poços, retorna ID curto
// ===============================================
app.post("/api/map-sessions", async (req, res) => {
  try {
    const { wells, filters } = req.body;

    // Validações
    if (!wells || !Array.isArray(wells) || wells.length === 0) {
      return res.status(400).json({
        error: "Lista de poços é obrigatória",
        required: { wells: "array de strings com nomes dos poços" }
      });
    }

    // Gerar ID curto e aleatório
    const sessionId = generateSessionId();

    console.log(`💾 Criando sessão de mapa: ${sessionId} (${wells.length} poços)`);

    // Inserir no banco
    const sql = `
      INSERT INTO map_sessions (id, wells, filters, well_count)
      VALUES ($1, $2, $3, $4)
      RETURNING id, well_count, created_at
    `;

    const result = await pool.query(sql, [
      sessionId,
      JSON.stringify(wells),        // Array de nomes dos poços
      filters ? JSON.stringify(filters) : null,  // Filtros usados (opcional)
      wells.length
    ]);

    const session = result.rows[0];

    console.log(`   ✅ Sessão criada: ${session.id}`);

    res.json({
      sessionId: session.id,
      wellCount: session.well_count,
      createdAt: session.created_at
    });

  } catch (error) {
    console.error("❌ Erro ao criar sessão de mapa:", error);
    res.status(500).json({ error: "Erro ao salvar seleção de poços" });
  }
});

// ===============================================
// 9. BUSCAR SESSÃO DE MAPA (recuperar seleção pelo ID)
//    Recebe ID curto, retorna lista de poços
// ===============================================
app.get("/api/map-sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🔍 Buscando sessão de mapa: ${id}`);

    const sql = `
      SELECT id, wells, filters, well_count, created_at
      FROM map_sessions
      WHERE id = $1
    `;

    const result = await pool.query(sql, [id]);

    if (result.rows.length === 0) {
      console.log(`   ❌ Sessão não encontrada: ${id}`);
      return res.status(404).json({
        error: "Sessão não encontrada",
        message: "Este link pode ter expirado ou ser inválido"
      });
    }

    const session = result.rows[0];

    console.log(`   ✅ Sessão encontrada: ${session.well_count} poços`);

    res.json({
      sessionId: session.id,
      wells: session.wells,           // Array JSON de nomes dos poços
      filters: session.filters,       // Filtros usados (pode ser null)
      wellCount: session.well_count,
      createdAt: session.created_at
    });

  } catch (error) {
    console.error("❌ Erro ao buscar sessão de mapa:", error);
    res.status(500).json({ error: "Erro ao recuperar seleção de poços" });
  }
});

// ===============================================
// 10. GEO PORTAL - CRIAR SESSÃO (com SID)
// ===============================================
// Recebe lista de poços com coordenadas, salva no banco e
// retorna um SID curto. O frontend usa esse SID na URL do
// iframe que aponta pra app do Flávio. A app dele depois
// chama GET /api/geoportal/sessions/:sid pra recuperar os
// dados (vide endpoint abaixo).
//
// Contrato:
//   Request:  { wells: [{ name, lat, lng }, ...] }
//   Response: { sid: "abc123def456" }
// ===============================================
app.post("/api/geoportal/sessions", async (req, res) => {
  try {
    const { wells } = req.body;

    // Validações
    if (!wells || !Array.isArray(wells) || wells.length === 0) {
      return res.status(400).json({
        error: "Lista de poços é obrigatória",
        required: { wells: "array de objetos { name, lat, lng }" }
      });
    }

    // Cada item tem que ter name + lat + lng (mesmo critério do mock antigo)
    const invalido = wells.find(w =>
      !w || typeof w.name !== "string" ||
      typeof w.lat !== "number" || typeof w.lng !== "number"
    );
    if (invalido) {
      return res.status(400).json({
        error: "Cada poço deve conter { name: string, lat: number, lng: number }",
        exemploInvalido: invalido
      });
    }

    // Gerar SID e persistir
    const sid = generateSessionId();

    console.log(`💾 Geo Portal: criando sessão ${sid} (${wells.length} poços)`);

    const sql = `
      INSERT INTO geoportal_sessions (id, wells, well_count)
      VALUES ($1, $2, $3)
      RETURNING id, well_count, created_at
    `;

    const result = await pool.query(sql, [
      sid,
      JSON.stringify(wells),
      wells.length
    ]);

    const session = result.rows[0];

    console.log(`   ✅ Sessão criada: ${session.id}`);

    res.json({
      sid: session.id,
      wellCount: session.well_count,
      createdAt: session.created_at
    });

  } catch (error) {
    console.error("❌ Erro ao criar sessão Geo Portal:", error);
    res.status(500).json({ error: "Erro ao salvar sessão Geo Portal" });
  }
});

// ===============================================
// 11. GEO PORTAL - LER SESSÃO (resolver SID)
// ===============================================
// Endpoint que a app do Flávio (ou qualquer cliente autorizado)
// chama pra recuperar a lista de poços de uma sessão.
//
// Esse é o endpoint que precisa estar exposto pra ele consumir.
// Hoje aceita qualquer chamador; quando tiver auth real, vai
// validar token de serviço.
//
// Contrato:
//   Request:  GET /api/geoportal/sessions/:sid
//   Response: { sid, wells: [{name, lat, lng}], wellCount, createdAt }
//   404 se sid não existir/expirou
// ===============================================
app.get("/api/geoportal/sessions/:sid", async (req, res) => {
  try {
    const { sid } = req.params;

    console.log(`🔍 Geo Portal: buscando sessão ${sid}`);

    const sql = `
      SELECT id, wells, well_count, created_at
      FROM geoportal_sessions
      WHERE id = $1
    `;

    const result = await pool.query(sql, [sid]);

    if (result.rows.length === 0) {
      console.log(`   ❌ Sessão não encontrada: ${sid}`);
      return res.status(404).json({
        error: "Sessão não encontrada",
        message: "Esta visualização pode ter expirado ou ser inválida"
      });
    }

    const session = result.rows[0];

    console.log(`   ✅ Sessão encontrada: ${session.well_count} poços`);

    res.json({
      sid: session.id,
      wells: session.wells,        // já vem como array JS (JSONB)
      wellCount: session.well_count,
      createdAt: session.created_at
    });

  } catch (error) {
    console.error("❌ Erro ao buscar sessão Geo Portal:", error);
    res.status(500).json({ error: "Erro ao recuperar sessão Geo Portal" });
  }
});

// ===============================================
// 12. GEO PORTAL - PÁGINA MOCK (renderizada no iframe)
// ===============================================
// Simula a app do Flávio enquanto ela não está pronta.
//
// Recebe ?sid=... na URL, chama o endpoint de leitura de
// sessão pra resolver o SID, e renderiza a tabela de poços.
// Quando o endpoint real do Flávio estiver pronto, basta o
// frontend trocar a URL do iframe (de /api/geoportal/mock-view
// pra http://swk2adm1-001.../Embutido) e tudo continua igual.
// ===============================================
app.get("/api/geoportal/mock-view", async (req, res) => {
  const sid = req.query.sid || "";

  // Tentar resolver o SID consultando direto o banco
  // (poderíamos chamar o endpoint via fetch, mas seria gambiarra
  // - é o mesmo servidor, vai direto na fonte)
  let wells = [];
  let createdAt = null;
  let erro = null;

  if (sid) {
    try {
      const result = await pool.query(
        "SELECT wells, created_at FROM geoportal_sessions WHERE id = $1",
        [sid]
      );

      if (result.rows.length > 0) {
        wells = result.rows[0].wells;
        createdAt = result.rows[0].created_at;
      } else {
        erro = "Sessão não encontrada (pode ter expirado)";
      }
    } catch (e) {
      console.error("Erro ao resolver SID no mock:", e.message);
      erro = "Erro ao consultar sessão";
    }
  } else {
    erro = "Parâmetro 'sid' não fornecido";
  }

  // Renderizar tabela com nome + coordenadas
  const tabelaPocos = wells.length > 0
    ? `
      <table>
        <thead>
          <tr>
            <th>Poço</th>
            <th>Latitude</th>
            <th>Longitude</th>
          </tr>
        </thead>
        <tbody>
          ${wells.map(w => `
            <tr>
              <td><strong>${escapeHtml(w.name)}</strong></td>
              <td>${Number(w.lat).toFixed(6)}</td>
              <td>${Number(w.lng).toFixed(6)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : `<p style="color:#9ca3af"><em>${erro || "Nenhum poço recebido"}</em></p>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Mock Geo Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f9fafb;
      color: #111827;
      padding: 1.5rem;
      min-height: 100vh;
    }
    .mock-banner {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 0.875rem 1rem;
      margin-bottom: 1.5rem;
      border-radius: 0.25rem;
    }
    .mock-banner strong { color: #92400e; }
    .mock-banner p { font-size: 0.875rem; color: #78350f; margin-top: 0.25rem; }
    h1 {
      font-size: 1.25rem;
      color: #1e3a8a;
      margin-bottom: 1rem;
    }
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    .card h2 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
      margin-bottom: 0.75rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    th, td {
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #f3f4f6;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    td { color: #1f2937; font-family: ui-monospace, "SF Mono", Monaco, monospace; }
    td:first-child { font-family: inherit; }
    tr:last-child td { border-bottom: none; }
    .map-placeholder {
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      border: 2px dashed #93c5fd;
      border-radius: 0.5rem;
      padding: 3rem 2rem;
      text-align: center;
      color: #1e40af;
    }
    .map-placeholder svg { margin-bottom: 0.75rem; opacity: 0.7; }
    .map-placeholder p { font-weight: 500; margin-bottom: 0.25rem; }
    .map-placeholder small { opacity: 0.7; font-size: 0.8125rem; }
    .meta {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: #9ca3af;
      text-align: center;
      font-family: ui-monospace, monospace;
    }
  </style>
</head>
<body>
  <div class="mock-banner">
    <strong>🧪 MODO MOCK</strong>
    <p>Esta é uma visualização simulada. O endpoint real do Geo Portal (Flávio) ainda está em desenvolvimento.</p>
  </div>

  <h1>Visualização Geo Portal (Simulada)</h1>

  <div class="card">
    <h2>Poços recebidos (${wells.length})</h2>
    ${tabelaPocos}
  </div>

  <div class="map-placeholder">
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
    <p>Aqui será renderizado o mapa ArcGIS real</p>
    <small>com os ${wells.length} poço(s) acima nas coordenadas indicadas</small>
  </div>

  <p class="meta">
    SID: ${escapeHtml(sid)} · ${createdAt ? "Criado em " + new Date(createdAt).toLocaleString("pt-BR") : "Sessão não localizada"}
  </p>
</body>
</html>`;

  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ===============================================
// 13. HEALTH CHECK
// ===============================================
app.get("/api/health", async (req, res) => {
  try {
    // Incluir Bearer token no health check se disponível
    const headers = {};
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
    }

    // Verificar API K2
    let k2Status = "offline";
    try {
      const response = await fetch(`${API_BASE_URL}/wells`, { headers });
      k2Status = response.ok ? "online" : "offline";
    } catch {
      k2Status = "offline";
    }

    // Verificar PostgreSQL
    let dbStatus = "offline";
    try {
      await pool.query("SELECT 1");
      dbStatus = "online";
    } catch {
      dbStatus = "offline";
    }

    const allHealthy = k2Status === "online" && dbStatus === "online";

    res.json({
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date(),
      version: "8.3",
      services: {
        k2API: {
          url: API_BASE_URL,
          status: k2Status
        },
        postgresql: {
          host: process.env.DB_HOST,
          database: process.env.DB_NAME,
          status: dbStatus
        },
        googleMaps: {
          configured: !!GOOGLE_MAPS_API_KEY
        },
        geoPortal: {
          mode: "mock",
          note: "Endpoint real ainda não integrado"
        }
      },
      authentication: {
        tokenPresent: !!req.bearerToken,
        tokenLength: req.bearerToken ? req.bearerToken.length : 0
      }
    });
  } catch (error) {
    res.json({
      status: "error",
      timestamp: new Date(),
      error: error.message
    });
  }
});

// ===============================================
// LIMPEZA AUTOMÁTICA DE SESSÕES ANTIGAS
// Remove sessões com mais de 30 dias a cada 24 horas
// (de map_sessions e geoportal_sessions)
// ===============================================

const SESSION_MAX_AGE_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

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
app.listen(PORT, () => {
  console.log(`
    🚀 Curves API Server v8.3
    ==========================================
    Servidor: http://localhost:${PORT}
    
    📡 Fontes de dados:
    - API K2 (Perfis): ${API_BASE_URL}
    - PostgreSQL (Mapas): ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}
    - Google Maps: ${GOOGLE_MAPS_API_KEY ? "✅ Configurado" : "⚠️  Não configurado"}
    - ArcGIS: ${ARCGIS_API_KEY ? "✅ Configurado" : "⚠️  Não configurado"}
    - Geo Portal: 🧪 MOCK (endpoint real em desenvolvimento)
    
    📍 Endpoints:
    - GET  /api/wells                       → Poços com DLIS (API K2)
    - GET  /api/wells-geo                   → Poços com coordenadas + bacia/campo (PostgreSQL)
    - GET  /api/wells/:id/curves            → Curvas de um poço
    - POST /api/generate-profile            → Gerar perfil composto
    - GET  /api/maps-config                 → Configuração Google Maps
    - GET  /api/arcgis-config               → Configuração ArcGIS
    - POST /api/wells-coordinates           → Coordenadas para mapa
    - POST /api/static-map                  → URL do mapa estático
    - POST /api/map-sessions                → Criar sessão de mapa (Google Maps)
    - GET  /api/map-sessions/:id            → Buscar sessão de mapa
    - POST /api/geoportal/sessions          → Criar sessão Geo Portal (retorna SID)
    - GET  /api/geoportal/sessions/:sid     → Resolver SID Geo Portal (consumido pelo Flávio)
    - GET  /api/geoportal/mock-view         → Página mock do Geo Portal (recebe ?sid=...)
    - GET  /api/health                      → Status dos serviços
    
    🧹 Limpeza de sessões: a cada 24h (retenção: ${SESSION_MAX_AGE_DAYS} dias)
    ==========================================
  `);

  // Rodar limpeza no startup e agendar a cada 24 horas
  cleanupOldSessions();
  setInterval(cleanupOldSessions, CLEANUP_INTERVAL_MS);
});
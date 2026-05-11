// ===============================================
// ROUTES/GEOPORTAL.JS - Endpoints da aba Geo Portal
//
// POST /api/geoportal/sessions       → cria sessão SID com lista de poços
// GET  /api/geoportal/sessions/:sid  → resolve SID (consumido pela app do Flávio)
// GET  /api/geoportal/mock-view      → página mock (debug manual + iframe enquanto
//                                        endpoint real do Flávio não existe)
// ===============================================

const express = require("express");
const { pool, generateSessionId } = require("../db");

const router = express.Router();

/**
 * Escape simples de HTML pra evitar injection na página mock.
 * Como só rendemos query strings vindas do nosso próprio banco,
 * é mais boa prática que necessidade crítica.
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
// CRIAR SESSÃO GEO PORTAL (SID)
// ===============================================
router.post("/sessions", async (req, res) => {
  try {
    const { wells } = req.body;

    if (!wells || !Array.isArray(wells) || wells.length === 0) {
      return res.status(400).json({
        error: "Lista de poços é obrigatória",
        required: { wells: "array de objetos { name, lat, lng }" }
      });
    }

    // Cada item tem que ter name + lat + lng
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
// RESOLVER SID GEO PORTAL
// (endpoint que a app do Flávio vai consumir)
// ===============================================
router.get("/sessions/:sid", async (req, res) => {
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
      wells: session.wells,
      wellCount: session.well_count,
      createdAt: session.created_at
    });

  } catch (error) {
    console.error("❌ Erro ao buscar sessão Geo Portal:", error);
    res.status(500).json({ error: "Erro ao recuperar sessão Geo Portal" });
  }
});

// ===============================================
// PÁGINA MOCK (renderizada no iframe ou acessada diretamente para debug)
//
// Recebe ?sid=... e mostra uma tabela com os poços + coordenadas.
// Usado:
//   1. Enquanto o endpoint real do Flávio não existe (frontend pode apontar
//      o iframe pra cá via feature flag)
//   2. Debug manual: abrir a URL direto no navegador pra inspecionar uma sessão
// ===============================================
router.get("/mock-view", async (req, res) => {
  const sid = req.query.sid || "";

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
    h1 { font-size: 1.25rem; color: #1e3a8a; margin-bottom: 1rem; }
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
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #f3f4f6; }
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

module.exports = router;
// ===============================================
// ROUTES/MAP.JS - Endpoints da aba Google Maps
//
// POST /api/wells-coordinates    → coordenadas de um conjunto de poços
// POST /api/static-map           → URL do mapa estático (Google Static Maps API)
// POST /api/map-sessions         → cria sessão (salvar seleção de poços)
// GET  /api/map-sessions/:id     → recupera sessão salva
// ===============================================

const express = require("express");
const { pool, convertGMSToDecimal, generateSessionId } = require("../db");

const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

/**
 * Gera URL do Google Static Maps com múltiplos marcadores.
 * Para > 26 poços, agrupa marcadores sem labels individuais
 * para não estourar o limite de 8192 caracteres da URL.
 */
function generateStaticMapUrl(wells) {
  const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";

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
    // Muitos poços: agrupar em parâmetros &markers= compactos
    const MAX_PER_GROUP = 100;
    for (let i = 0; i < wells.length; i += MAX_PER_GROUP) {
      const group = wells.slice(i, i + MAX_PER_GROUP);
      const coords = group.map(w => `${w.lat},${w.lng}`).join("|");
      url += `&markers=color:red|size:small|${coords}`;
    }
  }

  return url;
}

// ===============================================
// BUSCAR COORDENADAS DE POÇOS (Postgres)
// ===============================================
router.post("/wells-coordinates", async (req, res) => {
  try {
    const { wellNames } = req.body;

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
    res.json({ wells, count: wells.length });

  } catch (error) {
    console.error("❌ Erro ao buscar coordenadas:", error);
    res.status(500).json({ error: "Erro ao buscar coordenadas dos poços" });
  }
});

// ===============================================
// GERAR MAPA ESTÁTICO (URL pra download)
// ===============================================
router.post("/static-map", (req, res) => {
  try {
    const { wells } = req.body;

    if (!wells || !Array.isArray(wells) || wells.length === 0) {
      return res.status(400).json({
        error: "Lista de poços com coordenadas é obrigatória",
        required: { wells: "array com {name, lat, lng}" }
      });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        error: "Google Maps API Key não configurada no servidor"
      });
    }

    console.log(`🖼️  Gerando URL do mapa estático para ${wells.length} poço(s)`);
    const mapUrl = generateStaticMapUrl(wells);
    console.log("   ✅ URL gerada");

    res.json({ mapUrl, count: wells.length });

  } catch (error) {
    console.error("❌ Erro ao gerar mapa estático:", error);
    res.status(500).json({ error: "Erro ao gerar mapa estático" });
  }
});

// ===============================================
// CRIAR SESSÃO DE MAPA (salva seleção, retorna SID)
// ===============================================
router.post("/map-sessions", async (req, res) => {
  try {
    const { wells, filters } = req.body;

    if (!wells || !Array.isArray(wells) || wells.length === 0) {
      return res.status(400).json({
        error: "Lista de poços é obrigatória",
        required: { wells: "array de strings com nomes dos poços" }
      });
    }

    const sessionId = generateSessionId();
    console.log(`💾 Criando sessão de mapa: ${sessionId} (${wells.length} poços)`);

    const sql = `
      INSERT INTO map_sessions (id, wells, filters, well_count)
      VALUES ($1, $2, $3, $4)
      RETURNING id, well_count, created_at
    `;

    const result = await pool.query(sql, [
      sessionId,
      JSON.stringify(wells),
      filters ? JSON.stringify(filters) : null,
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
// BUSCAR SESSÃO DE MAPA (recuperar pelo SID)
// ===============================================
router.get("/map-sessions/:id", async (req, res) => {
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
      wells: session.wells,
      filters: session.filters,
      wellCount: session.well_count,
      createdAt: session.created_at
    });

  } catch (error) {
    console.error("❌ Erro ao buscar sessão de mapa:", error);
    res.status(500).json({ error: "Erro ao recuperar seleção de poços" });
  }
});

module.exports = router;
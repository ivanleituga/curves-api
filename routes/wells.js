// ===============================================
// ROUTES/WELLS.JS - Endpoints de poços
//
// GET /api/wells                  → poços com DLIS (proxy pra API K2)
// GET /api/wells-geo              → poços com coordenadas (Postgres)
// GET /api/wells/:wellId/curves   → curvas de um poço (proxy pra API K2)
// ===============================================

const express = require("express");
const { pool, convertGMSToDecimal } = require("../db");

const router = express.Router();

const API_BASE_URL = process.env.API_BASE_URL || "http://swk2adm1-001.k2sistemas.com.br:9095";

// ===============================================
// LISTAR POÇOS COM DLIS (proxy pra API K2)
// ===============================================
router.get("/wells", async (req, res) => {
  try {
    console.log("📋 Buscando poços da API externa (DLIS)...");

    const headers = {};
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }

    const response = await fetch(`${API_BASE_URL}/wells`, { headers });

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
// LISTAR POÇOS COM COORDENADAS (Postgres)
// Inclui Bacia e Campo para os filtros do frontend
// ===============================================
router.get("/wells-geo", async (req, res) => {
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
// BUSCAR CURVAS DE UM POÇO (proxy pra API K2)
// ===============================================
router.get("/wells/:wellId/curves", async (req, res) => {
  try {
    const { wellId } = req.params;
    console.log(`🔍 Buscando curvas do poço: ${wellId}`);

    const headers = {};
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }

    const response = await fetch(`${API_BASE_URL}/curves?well=${wellId}`, { headers });

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

module.exports = router;
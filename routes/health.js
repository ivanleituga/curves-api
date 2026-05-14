// ===============================================
// ROUTES/HEALTH.JS - Health check
//
// GET /api/health → status dos serviços (API K2, Postgres, configs)
// ===============================================

const express = require("express");
const { pool } = require("../db");

const router = express.Router();

const API_BASE_URL = process.env.API_BASE_URL || "http://swk2adm1-001.k2sistemas.com.br:9095";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

router.get("/", async (req, res) => {
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
      version: "8.4",
      services: {
        k2API: { url: API_BASE_URL, status: k2Status },
        postgresql: {
          host: process.env.DB_HOST,
          database: process.env.DB_NAME,
          status: dbStatus
        },
        googleMaps: { configured: !!GOOGLE_MAPS_API_KEY },
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

module.exports = router;
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// URL da API externa
const API_BASE_URL = "http://swk2adm1-001.k2sistemas.com.br:9095";

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// PROXY PARA API EXTERNA

// 1. LISTAR TODOS OS POÇOS
app.get("/api/wells", async (req, res) => {
  try {
    console.log("📋 Buscando poços da API externa...");
    
    const response = await fetch(`${API_BASE_URL}/wells`);
    const data = await response.json();
    
    // Transformar para o formato esperado pelo frontend
    const wells = data.wells.map(wellId => ({
      id: wellId,
      name: wellId, // A API não retorna nome descritivo
      field: "N/A",
      state: wellId.split("-").pop() // Extrai estado do ID
    }));
    
    res.json(wells);
  } catch (error) {
    console.error("❌ Erro ao buscar poços:", error);
    res.status(500).json({ error: "Erro ao buscar poços" });
  }
});

// 2. BUSCAR CURVAS DE UM POÇO
app.get("/api/wells/:wellId/curves", async (req, res) => {
  try {
    const { wellId } = req.params;
    console.log(`🔍 Buscando curvas do poço: ${wellId}`);
    
    const response = await fetch(`${API_BASE_URL}/curves?well=${wellId}`);
    const data = await response.json();
    
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

// 3. GERAR PERFIL
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
    
    // Chamar API externa
    const response = await fetch(`${API_BASE_URL}/render_b64`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        well,
        curves,
        hasLito
      })
    });
    
    if (!response.ok) {
      throw new Error(`API retornou erro: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Converter base64 para buffer e enviar como imagem
    const imageBuffer = Buffer.from(data.data, "base64");
    
    res.set("Content-Type", data.content_type || "image/png");
    res.send(imageBuffer);
    
  } catch (error) {
    console.error("❌ Erro ao gerar perfil:", error);
    res.status(500).json({ error: "Erro ao gerar perfil" });
  }
});

// 4. HEALTH CHECK
app.get("/api/health", async (req, res) => {
  try {
    // Verificar se a API externa está respondendo
    const response = await fetch(`${API_BASE_URL}/wells`);
    const apiHealthy = response.ok;
    
    res.json({ 
      status: apiHealthy ? "ok" : "degraded",
      timestamp: new Date(),
      endpoints: [
        "GET /api/wells",
        "GET /api/wells/:wellId/curves",
        "POST /api/generate-profile"
      ],
      externalAPI: {
        url: API_BASE_URL,
        status: apiHealthy ? "online" : "offline"
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

// INICIAR SERVIDOR
app.listen(PORT, () => {
  console.log(`
    🚀 Curves API Server v3.0 (Produção)
    ================================
    Servidor local: http://localhost:${PORT}
    API Externa: ${API_BASE_URL}
    
    📍 Endpoints disponíveis:
    - GET  /api/wells              → Lista todos os poços
    - GET  /api/wells/:id/curves   → Curvas de um poço
    - POST /api/generate-profile   → Gerar perfil
    - GET  /api/health            → Status da API
    ================================
  `);
});
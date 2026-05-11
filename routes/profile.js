// ===============================================
// ROUTES/PROFILE.JS - Geração de perfis compostos
//
// POST /api/generate-profile
//   Recebe { well, curves, hasLito }
//   Chama API K2 que retorna imagem em base64
//   Devolve a imagem PNG direto pro frontend
// ===============================================

const express = require("express");
const router = express.Router();

const API_BASE_URL = process.env.API_BASE_URL || "http://swk2adm1-001.k2sistemas.com.br:9095";

router.post("/", async (req, res) => {
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

    const headers = { "Content-Type": "application/json" };
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }

    const response = await fetch(`${API_BASE_URL}/render_b64`, {
      method: "POST",
      headers,
      body: JSON.stringify({ well, curves, hasLito })
    });

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

module.exports = router;
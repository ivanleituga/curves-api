const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// URL da API externa
const API_BASE_URL = process.env.API_BASE_URL || "http://swk2adm1-001.k2sistemas.com.br:9095";

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

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
 * Exemplo: "-22:41:58,383" → -22.6995
 */
function convertGMSToDecimal(gmsString) {
  if (!gmsString) return null;
  
  // Normalizar: trocar vírgula por ponto
  gmsString = gmsString.replace(",", ".");
  
  // Verificar sinal negativo
  const negative = gmsString.startsWith("-");
  gmsString = gmsString.replace("-", "");
  
  // Separar partes
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
 * Gera URL do Google Static Maps com múltiplos marcadores
 */
function generateStaticMapUrl(wells) {
  const baseUrl = "https://maps.googleapis.com/maps/api/staticmap";
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  // Parâmetros base
  const params = new URLSearchParams();
  params.set("size", "640x480");
  params.set("scale", "2"); // Alta resolução
  params.set("maptype", "terrain");
  params.set("key", GOOGLE_MAPS_API_KEY);
  
  // Se poucos poços, definir zoom fixo para não ficar muito próximo
  if (wells.length <= 2) {
    const avgLat = wells.reduce((sum, w) => sum + w.lat, 0) / wells.length;
    const avgLng = wells.reduce((sum, w) => sum + w.lng, 0) / wells.length;
    params.set("center", `${avgLat},${avgLng}`);
    params.set("zoom", "10");
  }
  
  // Construir URL base
  let url = `${baseUrl}?${params.toString()}`;
  
  // Adicionar marcadores
  wells.forEach((well, index) => {
    const label = labels[index] || "";
    url += `&markers=color:red|label:${label}|${well.lat},${well.lng}`;
  });
  
  return url;
}

// ===============================================
// PROXY PARA API EXTERNA
// ===============================================

// 1. LISTAR TODOS OS POÇOS
app.get("/api/wells", async (req, res) => {
  try {
    console.log("📋 Buscando poços da API externa...");
    
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
      name: wellId, // A API não retorna nome descritivo
      field: "N/A",
      state: wellId.split("-").pop() // Extrai estado do ID
    }));
    
    console.log(`   ✅ ${wells.length} poços retornados`);
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
// 4. CONFIG DO GOOGLE MAPS
// ===============================================
app.get("/api/maps-config", (req, res) => {
  res.json({
    apiKey: GOOGLE_MAPS_API_KEY || ""
  });
});

// ===============================================
// 5. BUSCAR COORDENADAS DE POÇOS (MAPA INTERATIVO)
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
    
    if (wellNames.length > 25) {
      return res.status(400).json({
        error: "Máximo de 25 poços por mapa",
        received: wellNames.length
      });
    }
    
    console.log(`🗺️  Buscando coordenadas para ${wellNames.length} poço(s)`);
    
    // Incluir Bearer token se disponível
    const headers = {
      "Content-Type": "application/json"
    };
    
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
      console.log("   🔑 Bearer token incluído na requisição");
    }
    
    // Buscar coordenadas da API externa (endpoint de coordenadas)
    const response = await fetch(`${API_BASE_URL}/wells/coordinates`, {
      method: "POST",
      headers,
      body: JSON.stringify({ wells: wellNames })
    });
    
    let wellsWithCoordinates = [];
    
    if (response.ok) {
      // API externa retornou as coordenadas
      const data = await response.json();
      wellsWithCoordinates = data.wells || [];
    } else {
      // Fallback: retornar coordenadas mock para teste
      // TODO: Integrar com o banco de dados real
      console.log("   ⚠️  Endpoint /wells/coordinates não disponível na API externa");
      console.log("   ⚠️  Usando coordenadas de exemplo (integrar com banco)");
      
      wellsWithCoordinates = wellNames.map((name, index) => ({
        name: name,
        lat: -22.0 - (index * 0.5),  // Coordenadas de exemplo
        lng: -40.0 - (index * 0.5),
        state: name.split("-").pop()
      }));
    }
    
    // Filtrar apenas poços com coordenadas válidas
    const validWells = wellsWithCoordinates.filter(w => w.lat && w.lng);
    
    if (validWells.length === 0) {
      return res.status(404).json({
        error: "Nenhum poço com coordenadas válidas encontrado"
      });
    }
    
    console.log(`   ✅ Coordenadas obtidas para ${validWells.length} poço(s)`);
    
    // Retornar apenas as coordenadas (o mapa interativo será criado no frontend)
    res.json({
      wells: validWells,
      count: validWells.length
    });
    
  } catch (error) {
    console.error("❌ Erro ao buscar coordenadas:", error);
    res.status(500).json({ error: "Erro ao buscar coordenadas dos poços" });
  }
});

// ===============================================
// 6. GERAR MAPA ESTÁTICO (PARA DOWNLOAD)
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
// 7. HEALTH CHECK
// ===============================================
app.get("/api/health", async (req, res) => {
  try {
    // Incluir Bearer token no health check se disponível
    const headers = {};
    if (req.bearerToken) {
      headers["Authorization"] = `Bearer ${req.bearerToken}`;
    }
    
    // Verificar se a API externa está respondendo
    const response = await fetch(`${API_BASE_URL}/wells`, { headers });
    const apiHealthy = response.ok;
    
    res.json({ 
      status: apiHealthy ? "ok" : "degraded",
      timestamp: new Date(),
      version: "4.1",
      endpoints: [
        "GET  /api/wells",
        "GET  /api/wells/:wellId/curves",
        "POST /api/generate-profile",
        "GET  /api/maps-config",
        "POST /api/wells-coordinates",
        "POST /api/static-map",
        "GET  /api/health"
      ],
      externalAPI: {
        url: API_BASE_URL,
        status: apiHealthy ? "online" : "offline"
      },
      googleMaps: {
        configured: !!GOOGLE_MAPS_API_KEY
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
// INICIAR SERVIDOR
// ===============================================
app.listen(PORT, () => {
  console.log(`
    🚀 Curves API Server
    ================================
    Servidor local: http://localhost:${PORT}
    API Externa: ${API_BASE_URL}
    Google Maps: ${GOOGLE_MAPS_API_KEY ? "✅ Configurado" : "⚠️  Não configurado"}
    
    📍 Endpoints disponíveis:
    - GET  /api/wells              → Lista todos os poços
    - GET  /api/wells/:id/curves   → Curvas de um poço
    - POST /api/generate-profile   → Gerar perfil composto
    - GET  /api/maps-config        → Configuração do Google Maps
    - POST /api/wells-coordinates  → Buscar coordenadas (mapa interativo)
    - POST /api/static-map         → Gerar URL do mapa estático
    - GET  /api/health             → Status da API
    ================================
  `);
});
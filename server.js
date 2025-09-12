const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// MOCK DATABASE - Simula API real
const mockDatabase = {
  wells: [
    // Poço 1 - Muitas curvas disponíveis
    {
      id: "1-SL-1-RN",
      name: "Poço Salitre 1",
      field: "Campo Salitre",
      state: "RN",
      curves: ["GR", "RHOB", "NPHI", "DT", "ILD", "SP", "CALI", "BS"],
      depth: 3500
    },
    {
      id: "1-SL-2-RN",
      name: "Poço Salitre 2",
      field: "Campo Salitre", 
      state: "RN",
      curves: ["GR", "RHOB", "DT", "MSFL"],
      depth: 2800
    },
    
    // Poço 2 - Poucas curvas
    {
      id: "2-RJ-3-BA",
      name: "Poço Rio Jequitinhonha 3",
      field: "Campo Jequitinhonha",
      state: "BA",
      curves: ["GR", "RHOB", "NPHI"],
      depth: 4200
    },
    
    // Poço 3 - Curvas diferentes
    {
      id: "4-MG-2-ES",
      name: "Poço Mucuri 2",
      field: "Campo Mucuri",
      state: "ES",
      curves: ["GR", "NPHI", "ILD", "SP", "CALI", "PEF", "PHIT"],
      depth: 3100
    },
    
    // Mais poços para simular volume real
    {
      id: "3-BRA-1-RJS",
      name: "Poço Brava 1",
      field: "Campo Brava",
      state: "RJ",
      curves: ["GR", "RHOB", "NPHI", "DT", "SP"],
      depth: 5500
    },
    {
      id: "7-AB-45-SP",
      name: "Poço Abelha 45",
      field: "Campo Abelha",
      state: "SP",
      curves: ["GR", "ILD", "MSFL", "CALI", "BS", "DRHO"],
      depth: 2200
    },
    {
      id: "9-MR-8-RN",
      name: "Poço Marlin 8",
      field: "Campo Marlin",
      state: "RN",
      curves: ["GR", "RHOB", "NPHI", "DT", "ILD", "ILM", "SFL"],
      depth: 4800
    },
    {
      id: "1-RJS-628A",
      name: "Poço RJS 628A",
      field: "Bacia de Santos",
      state: "RJ",
      curves: ["GR", "RHOB", "DT"],
      depth: 6200
    }
  ]
};

// ROTAS DA API

// 1. LISTAR TODOS OS POÇOS
app.get("/api/wells", (req, res) => {
  console.log("📋 Listando todos os poços");
  
  // Simula delay de rede
  setTimeout(() => {
    res.json(mockDatabase.wells.map(well => ({
      id: well.id,
      name: well.name,
      field: well.field,
      state: well.state
    })));
  }, 300);
});

// 2. BUSCAR CURVAS DE UM POÇO ESPECÍFICO
app.get("/api/wells/:wellId/curves", (req, res) => {
  const { wellId } = req.params;
  console.log(`🔍 Buscando curvas do poço: ${wellId}`);
  
  const well = mockDatabase.wells.find(w => w.id === wellId);
  
  if (!well) {
    return res.status(404).json({ 
      error: "Poço não encontrado",
      wellId 
    });
  }
  
  // Simula delay de rede
  setTimeout(() => {
    res.json({
      wellId: well.id,
      wellName: well.name,
      curves: well.curves,
      totalCurves: well.curves.length
    });
  }, 200);
});

// 3. GERAR PERFIL (Mock com SVG)
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
    
    // Validar quantidade de curvas (1-3)
    if (curves.length < 1 || curves.length > 3) {
      return res.status(400).json({
        error: "Selecione entre 1 e 3 curvas",
        selected: curves.length
      });
    }
    
    console.log("📊 Gerando perfil:", { well, curves, hasLito });
    
    // Buscar dados do poço
    const wellData = mockDatabase.wells.find(w => w.id === well);
    if (!wellData) {
      return res.status(404).json({ error: "Poço não encontrado" });
    }
    
    // Verificar se as curvas existem para este poço
    const invalidCurves = curves.filter(c => !wellData.curves.includes(c));
    if (invalidCurves.length > 0) {
      return res.status(400).json({
        error: "Curvas inválidas para este poço",
        invalidCurves,
        availableCurves: wellData.curves
      });
    }
    
    // Simular delay de processamento
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Gerar SVG mock
    const svg = generateEnhancedSVG(wellData, curves, hasLito);
    
    // Retornar como imagem SVG
    res.set("Content-Type", "image/svg+xml");
    res.send(svg);
    
  } catch (error) {
    console.error("❌ Erro ao gerar perfil:", error);
    res.status(500).json({ error: "Erro ao gerar perfil" });
  }
});

// 4. HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date(),
    endpoints: [
      "GET /api/wells",
      "GET /api/wells/:wellId/curves",
      "POST /api/generate-profile"
    ],
    totalWells: mockDatabase.wells.length
  });
});

// FUNÇÃO PARA GERAR SVG MELHORADO
function generateEnhancedSVG(wellData, curves, hasLito) {
  const width = 900;
  const height = 700;
  const chartStartX = hasLito ? 150 : 100;
  const chartStartY = 150;
  const chartWidth = 750;
  const chartHeight = 450;
  
  // Cores específicas para cada tipo de curva
  const curveColors = {
    "GR": "#2563eb",      // Azul
    "RHOB": "#dc2626",    // Vermelho  
    "NPHI": "#16a34a",    // Verde
    "DT": "#9333ea",      // Roxo
    "ILD": "#ea580c",     // Laranja
    "SP": "#0891b2",      // Ciano
    "CALI": "#c026d3",    // Magenta
    "BS": "#65a30d",      // Lima
    "MSFL": "#e11d48",    // Rosa
    "PEF": "#0d9488",     // Teal
    "PHIT": "#7c3aed",    // Violeta
    "DRHO": "#ca8a04",    // Âmbar
    "ILM": "#dc2626",     // Vermelho escuro
    "SFL": "#1e40af"      // Azul escuro
  };
  
  // Gerar dados mock para cada curva
  const generateCurveData = (curveName, index) => {
    const points = [];
    const steps = 30;
    
    for (let i = 0; i <= steps; i++) {
      const y = chartStartY + (chartHeight / steps) * i;
      const baseX = chartStartX + 100;
      
      // Diferentes padrões para cada tipo de curva
      let variance = 0;
      switch(curveName) {
      case "GR":
        variance = Math.sin(i / 5) * 50 + Math.random() * 20;
        break;
      case "RHOB":
        variance = Math.cos(i / 4) * 40 + Math.sin(i / 2) * 20;
        break;
      case "NPHI":
        variance = Math.sin(i / 3 + index) * 60 + Math.random() * 10;
        break;
      default:
        variance = Math.sin(i / 4 + index * 2) * 45 + Math.random() * 15;
      }
      
      const x = baseX + variance + (index * 120);
      points.push(`${x},${y}`);
    }
    
    return points.join(" ");
  };
  
  // Gerar paths das curvas selecionadas
  const curvePaths = curves.map((curveName, index) => {
    const color = curveColors[curveName] || "#6b7280";
    const points = generateCurveData(curveName, index);
    
    return `
      <polyline 
        points="${points}"
        fill="none" 
        stroke="${color}" 
        stroke-width="2.5"
        opacity="0.9"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    `;
  }).join("");
  
  // Gerar legenda das curvas
  const legendItems = curves.map((curveName, index) => {
    const color = curveColors[curveName] || "#6b7280";
    const y = 180 + (index * 30);
    
    return `
      <rect x="110" y="${y - 10}" width="140" height="25" fill="white" opacity="0.9" rx="3"/>
      <line x1="120" y1="${y}" x2="145" y2="${y}" stroke="${color}" stroke-width="3"/>
      <text x="155" y="${y + 4}" font-size="13" fill="#1f2937" font-weight="500">${curveName}</text>
    `;
  }).join("");
  
  // Seção de litologia
  const lithologySection = hasLito ? `
    <!-- Coluna de Litologia -->
    <rect x="50" y="${chartStartY}" width="80" height="${chartHeight}" 
          fill="#fafafa" stroke="#d1d5db" stroke-width="1"/>
    <text x="90" y="${chartStartY - 10}" font-size="12" fill="#374151" text-anchor="middle" font-weight="600">
      LITOLOGIA
    </text>
    
    <!-- Padrões de litologia -->
    <rect x="50" y="${chartStartY}" width="80" height="75" fill="#F4E4C1" opacity="0.8"/>
    <text x="90" y="${chartStartY + 40}" font-size="10" fill="#92400e" text-anchor="middle">Arenito</text>
    
    <rect x="50" y="${chartStartY + 75}" width="80" height="90" fill="#E8D5B7" opacity="0.8"/>
    <text x="90" y="${chartStartY + 120}" font-size="10" fill="#92400e" text-anchor="middle">Siltito</text>
    
    <rect x="50" y="${chartStartY + 165}" width="80" height="85" fill="#9CA3AF" opacity="0.8"/>
    <text x="90" y="${chartStartY + 207}" font-size="10" fill="#1f2937" text-anchor="middle">Folhelho</text>
    
    <rect x="50" y="${chartStartY + 250}" width="80" height="100" fill="#F5DEB3" opacity="0.8"/>
    <text x="90" y="${chartStartY + 300}" font-size="10" fill="#92400e" text-anchor="middle">Calcário</text>
    
    <rect x="50" y="${chartStartY + 350}" width="80" height="100" fill="#D2691E" opacity="0.8"/>
    <text x="90" y="${chartStartY + 400}" font-size="10" fill="#7c2d12" text-anchor="middle">Dolomita</text>
    
    <!-- Marcadores de profundidade -->
    <text x="40" y="${chartStartY}" font-size="10" fill="#6b7280" text-anchor="end">0m</text>
    <text x="40" y="${chartStartY + chartHeight/2}" font-size="10" fill="#6b7280" text-anchor="end">${wellData.depth/2}m</text>
    <text x="40" y="${chartStartY + chartHeight}" font-size="10" fill="#6b7280" text-anchor="end">${wellData.depth}m</text>
  ` : `
    <!-- Marcadores de profundidade sem litologia -->
    <text x="${chartStartX - 10}" y="${chartStartY}" font-size="10" fill="#6b7280" text-anchor="end">0m</text>
    <text x="${chartStartX - 10}" y="${chartStartY + chartHeight/2}" font-size="10" fill="#6b7280" text-anchor="end">${wellData.depth/2}m</text>
    <text x="${chartStartX - 10}" y="${chartStartY + chartHeight}" font-size="10" fill="#6b7280" text-anchor="end">${wellData.depth}m</text>
  `;
  
  // SVG completo
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <!-- Definições -->
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>
        </pattern>
        <linearGradient id="headerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#fafafa"/>
      
      <!-- Header -->
      <rect width="${width}" height="60" fill="url(#headerGradient)"/>
      <text x="${width/2}" y="38" font-size="26" text-anchor="middle" fill="white" font-weight="700">
        ${wellData.id} - ${wellData.name}
      </text>
      
      <!-- Barra de informações -->
      <rect x="0" y="60" width="${width}" height="35" fill="#f9fafb"/>
      <text x="30" y="82" font-size="13" fill="#4b5563">
        <tspan font-weight="600">Campo:</tspan> ${wellData.field} | 
        <tspan font-weight="600">Estado:</tspan> ${wellData.state} | 
        <tspan font-weight="600">Profundidade:</tspan> ${wellData.depth}m | 
        <tspan font-weight="600">Curvas:</tspan> ${curves.join(", ")}
      </text>
      
      ${lithologySection}
      
      <!-- Área principal do gráfico -->
      <rect x="${chartStartX}" y="${chartStartY}" width="${chartWidth}" height="${chartHeight}" 
            fill="white" stroke="#374151" stroke-width="1.5" rx="2"/>
      <rect x="${chartStartX}" y="${chartStartY}" width="${chartWidth}" height="${chartHeight}" 
            fill="url(#grid)" opacity="0.5"/>
      
      <!-- Grid lines horizontais -->
      ${Array.from({length: 5}, (_, i) => {
    const y = chartStartY + (chartHeight / 4) * i;
    return `<line x1="${chartStartX}" y1="${y}" x2="${chartStartX + chartWidth}" y2="${y}" 
                      stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="5,5"/>`;
  }).join("")}
      
      <!-- Eixos -->
      <line x1="${chartStartX}" y1="${chartStartY}" 
            x2="${chartStartX}" y2="${chartStartY + chartHeight}" 
            stroke="#1f2937" stroke-width="2"/>
      <line x1="${chartStartX}" y1="${chartStartY + chartHeight}" 
            x2="${chartStartX + chartWidth}" y2="${chartStartY + chartHeight}" 
            stroke="#1f2937" stroke-width="2"/>
      
      <!-- Curvas do perfil -->
      ${curvePaths}
      
      <!-- Caixa de legenda -->
      <rect x="100" y="160" width="160" height="${40 + curves.length * 30}" 
            fill="white" stroke="#d1d5db" stroke-width="1" rx="4" opacity="0.95"/>
      <text x="180" y="180" font-size="14" font-weight="700" fill="#1f2937" text-anchor="middle">
        Curvas Ativas
      </text>
      ${legendItems}
      
      <!-- Rodapé -->
      <rect x="0" y="${height - 30}" width="${width}" height="30" fill="#f3f4f6"/>
      <text x="${width/2}" y="${height - 10}" font-size="11" text-anchor="middle" fill="#6b7280">
        Gerado em: ${new Date().toLocaleString("pt-BR")} | Mock API v2.0 | Litologia: ${hasLito ? "Incluída" : "Não incluída"}
      </text>
    </svg>
  `;
  
  return svg;
}

// INICIAR SERVIDOR
app.listen(PORT, () => {
  console.log(`
    🚀 Curves API Server v2.0     
    ================================
    Rodando em: http://localhost:${PORT}
    Modo: ${process.env.NODE_ENV || "development"}
    
    📍 Endpoints disponíveis:
    - GET  /api/wells              → Lista todos os poços
    - GET  /api/wells/:id/curves   → Curvas de um poço
    - POST /api/generate-profile   → Gerar perfil
    - GET  /api/health            → Status da API
    
    📊 Mock Database:
    - Total de poços: ${mockDatabase.wells.length}
    - Poços disponíveis: ${mockDatabase.wells.map(w => w.id).join(", ")}
    ================================
  `);
});
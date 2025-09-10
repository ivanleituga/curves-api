const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Função para gerar SVG mock dinâmico
function generateMockSVG(well, curves, hasLito) {
  const width = 900;
  const height = 700;
  const chartStartX = 100;
  const chartStartY = 150;
  const chartWidth = 750;
  const chartHeight = 450;
  
  // Cores para cada curva
  const curveColors = {
    'GR': '#3498db',      // Azul
    'RHOB': '#e74c3c',    // Vermelho  
    'NPHI': '#27ae60'     // Verde
  };
  
  // Gerar dados fake para cada curva
  const generateCurveData = (curveName, index) => {
    const points = [];
    const steps = 20;
    
    for (let i = 0; i <= steps; i++) {
      const y = chartStartY + (chartHeight / steps) * i;
      // Variação baseada no nome da curva e índice para tornar único
      const variance = Math.sin(i / 3 + index) * 100;
      const x = chartStartX + 100 + variance + (index * 50) + Math.random() * 30;
      points.push(`${x},${y}`);
    }
    
    return points.join(' ');
  };
  
  // Gerar paths das curvas
  const curvePaths = curves.map((curveName, index) => {
    const color = curveColors[curveName] || '#95a5a6';
    const points = generateCurveData(curveName, index);
    
    return `
      <polyline 
        points="${points}"
        fill="none" 
        stroke="${color}" 
        stroke-width="2"
        opacity="0.8"
      />
    `;
  }).join('');
  
  // Gerar legenda
  const legendItems = curves.map((curveName, index) => {
    const color = curveColors[curveName] || '#95a5a6';
    const y = 180 + (index * 25);
    
    return `
      <line x1="110" y1="${y}" x2="130" y2="${y}" stroke="${color}" stroke-width="3"/>
      <text x="135" y="${y + 4}" font-size="12" fill="#333">${curveName}</text>
    `;
  }).join('');
  
  // Seção de litologia (se hasLito = true)
  const lithologySection = hasLito ? `
    <!-- Seção de Litologia -->
    <rect x="${chartStartX - 50}" y="${chartStartY}" width="40" height="${chartHeight}" 
          fill="#f8f9fa" stroke="#dee2e6" stroke-width="1"/>
    <text x="${chartStartX - 30}" y="${chartStartY - 10}" font-size="10" fill="#666" text-anchor="middle">
      LITO
    </text>
    
    <!-- Padrões de litologia simulados -->
    <rect x="${chartStartX - 50}" y="${chartStartY}" width="40" height="60" fill="#F4E4C1"/>
    <rect x="${chartStartX - 50}" y="${chartStartY + 60}" width="40" height="80" fill="#E8D5B7"/>
    <rect x="${chartStartX - 50}" y="${chartStartY + 140}" width="40" height="70" fill="#D2B48C"/>
    <rect x="${chartStartX - 50}" y="${chartStartY + 210}" width="40" height="90" fill="#F5DEB3"/>
    <rect x="${chartStartX - 50}" y="${chartStartY + 300}" width="40" height="75" fill="#DEB887"/>
    <rect x="${chartStartX - 50}" y="${chartStartY + 375}" width="40" height="75" fill="#D2691E"/>
    
    <!-- Labels de profundidade -->
    <text x="${chartStartX - 60}" y="${chartStartY + 30}" font-size="9" fill="#666" text-anchor="end">0m</text>
    <text x="${chartStartX - 60}" y="${chartStartY + 225}" font-size="9" fill="#666" text-anchor="end">500m</text>
    <text x="${chartStartX - 60}" y="${chartStartY + 425}" font-size="9" fill="#666" text-anchor="end">1000m</text>
  ` : '';
  
  // SVG completo
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Definições -->
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" stroke-width="0.5"/>
        </pattern>
        <linearGradient id="headerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#fafafa"/>
      
      <!-- Header com gradiente -->
      <rect width="${width}" height="60" fill="url(#headerGradient)"/>
      <text x="${width/2}" y="38" font-size="24" text-anchor="middle" fill="white" font-weight="600">
        ${well}
      </text>
      
      <!-- Info Bar -->
      <rect x="0" y="60" width="${width}" height="30" fill="#f8f9fa"/>
      <text x="20" y="80" font-size="12" fill="#495057">
        Curvas: ${curves.join(', ')} | Profundidade: 0-1000m | Litologia: ${hasLito ? 'Incluída' : 'Não incluída'}
      </text>
      
      ${lithologySection}
      
      <!-- Área do gráfico principal -->
      <rect x="${chartStartX}" y="${chartStartY}" width="${chartWidth}" height="${chartHeight}" 
            fill="white" stroke="#333" stroke-width="1"/>
      <rect x="${chartStartX}" y="${chartStartY}" width="${chartWidth}" height="${chartHeight}" 
            fill="url(#grid)" opacity="0.3"/>
      
      <!-- Eixos -->
      <!-- Eixo Y (Profundidade) -->
      <line x1="${chartStartX}" y1="${chartStartY}" 
            x2="${chartStartX}" y2="${chartStartY + chartHeight}" 
            stroke="#333" stroke-width="2"/>
      
      <!-- Labels do eixo Y -->
      ${hasLito ? '' : `
        <text x="${chartStartX - 10}" y="${chartStartY}" font-size="10" fill="#666" text-anchor="end">0m</text>
        <text x="${chartStartX - 10}" y="${chartStartY + chartHeight/2}" font-size="10" fill="#666" text-anchor="end">500m</text>
        <text x="${chartStartX - 10}" y="${chartStartY + chartHeight}" font-size="10" fill="#666" text-anchor="end">1000m</text>
      `}
      
      <!-- Eixo X -->
      <line x1="${chartStartX}" y1="${chartStartY + chartHeight}" 
            x2="${chartStartX + chartWidth}" y2="${chartStartY + chartHeight}" 
            stroke="#333" stroke-width="2"/>
      
      <!-- Curvas -->
      ${curvePaths}
      
      <!-- Legenda -->
      <rect x="100" y="160" width="150" height="${30 + curves.length * 25}" 
            fill="white" stroke="#dee2e6" opacity="0.95"/>
      <text x="110" y="175" font-size="13" font-weight="600" fill="#333">Curvas:</text>
      ${legendItems}
      
      <!-- Timestamp -->
      <text x="${width/2}" y="${height - 10}" font-size="10" text-anchor="middle" fill="#999">
        Gerado em: ${new Date().toLocaleString('pt-BR')} | Mock API v1.0
      </text>
    </svg>
  `;
  
  return svg;
}

// Endpoint principal da API mock
app.post('/api/generate-profile', async (req, res) => {
  try {
    const { well, curves, hasLito } = req.body;
    
    // Validações
    if (!well || !curves || !Array.isArray(curves)) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        required: { well: 'string', curves: 'array', hasLito: 'boolean' }
      });
    }
    
    console.log('📊 Gerando perfil:', { well, curves, hasLito });
    
    // Simular delay de processamento
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Gerar SVG
    const svg = generateMockSVG(well, curves, hasLito);
    
    // Retornar como imagem SVG
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
    
  } catch (error) {
    console.error('❌ Erro ao gerar perfil:', error);
    res.status(500).json({ error: 'Erro ao gerar perfil' });
  }
});

// Endpoint de teste
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    endpoints: ['/api/generate-profile', '/api/health']
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
    🚀 Curves API Server      
    Rodando em: http://localhost:${PORT}
    Modo: ${process.env.NODE_ENV || 'development'}
  `);
});
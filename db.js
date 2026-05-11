// ===============================================
// DB.JS - Conexão Postgres e helpers
//
// Centraliza:
//   - Pool de conexões com o Postgres
//   - Conversão de coordenadas GMS → decimal
//   - Geração de IDs de sessão (compartilhada por map-sessions e geoportal)
//
// Importado por server.js e pelos arquivos de routes/.
// ===============================================

const { Pool } = require("pg");
const crypto = require("crypto");

// Configuração do PostgreSQL via .env
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false
});

/**
 * Converte coordenada de graus:minutos:segundos para decimal.
 * Formato do banco: "-18:22:40,186" → -18.3778
 *
 * Retorna null se a string for inválida ou estiver malformada.
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
    const decimal = degrees + (minutes / 60) + (seconds / 3600);
    return negative ? -decimal : decimal;
  } catch (error) {
    console.error("Erro ao converter coordenada:", gmsString, error);
    return null;
  }
}

/**
 * Gera um ID curto e aleatório para sessões (map_sessions e geoportal_sessions).
 * Retorna 12 caracteres hexadecimais (ex: "a1b2c3d4e5f6").
 */
function generateSessionId() {
  return crypto.randomBytes(6).toString("hex");
}

module.exports = {
  pool,
  convertGMSToDecimal,
  generateSessionId
};
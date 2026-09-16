import mysql from 'mysql2/promise';

// Mesma config do bot_padaria_v3 (services/databaseService.js): dateStrings true, pra
// PRIMEIRA_VENDA/ULTIMA_VENDA virem "YYYY-MM-DD HH:MM:SS" em vez de Date (evita a maquina local
// reinterpretar o horario do MySQL num fuso diferente do configurado).
export function criarPoolCreare(config) {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    charset: 'utf8mb4',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
}

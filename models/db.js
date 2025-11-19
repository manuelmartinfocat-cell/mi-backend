const { Pool } = require("pg");

const pool = new Pool({
  user: 'postgres',       // tu usuario de postgres
  host: 'localhost',
  database: 'finanzas_hack', // crea esta BD en PostgreSQL
  password: 'admin',      // tu password
  port: 5432
});

module.exports = pool;
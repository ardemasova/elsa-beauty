const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  max: process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  // An idle client hit an error (e.g. DB restart). Log it; the pool replaces the client.
  console.error("PostgreSQL pool error:", err.message);
});

/**
 * Runs `fn(client)` inside a single transaction on ONE dedicated connection.
 * Never use `db.query("BEGIN")` on the pool: each pool query may run on a
 * different connection, so BEGIN/COMMIT would not wrap anything.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  withTransaction,
};

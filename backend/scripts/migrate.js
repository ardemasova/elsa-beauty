#!/usr/bin/env node
// Usage: npm run migrate
// Applies all pending database migrations (shared schema + every branch).
const { pool } = require("../db");
const { migrateAll } = require("../migrations/runner");

pool.on("connect", (client) => {
  client.on("notice", (n) => console.log(`  [${n.severity}] ${n.message}`));
});

migrateAll()
  .then(() => {
    console.log("✅ Migrations complete");
    return pool.end();
  })
  .catch(async (err) => {
    console.error("❌", err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });

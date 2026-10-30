#!/usr/bin/env node
/**
 * Onboard a new customer (salon): creates the account, its owner login and the
 * first branch. Run on the server:
 *
 *   npm run create-account -- --name "Salon Lola" --email owner@salonlola.es --plan standard --branch "Lola Centro"
 *
 * A strong temporary password is generated and printed once.
 */
const crypto = require("crypto");
const { pool } = require("../db");
const { createAccount } = require("../services/provisioning");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

(async () => {
  const name = arg("name");
  const email = arg("email");
  const plan = arg("plan") || "standard";
  const branch = arg("branch") || name;
  if (!name || !email) {
    console.error('Usage: npm run create-account -- --name "Salon" --email owner@example.com [--plan standard|pro|enterprise] [--branch "Branch name"]');
    process.exit(1);
  }
  const password = crypto.randomBytes(12).toString("base64url");
  try {
    const { account, tenant } = await createAccount({
      accountName: name,
      planCode: plan,
      ownerEmail: email,
      ownerPassword: password,
      branchName: branch,
    });
    console.log("✅ Account created");
    console.log(`   account:  ${account.name} (${account.id}), plan ${plan}`);
    console.log(`   branch:   ${tenant.name} (${tenant.schema_name})`);
    console.log(`   login:    ${email}`);
    console.log(`   password: ${password}   <- give it to the owner, ask them to change it`);
  } catch (err) {
    console.error("❌", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

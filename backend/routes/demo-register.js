/**
 * POST /api/demo-register  { email, name, phone? }
 *
 * Every demo sign-up gets its OWN account and branch, filled with a copy of the
 * demo data (DEMO_TEMPLATE_SCHEMA, default "salon_demo"). Previously all demo
 * users were admins of one shared branch and could see each other and change
 * (or delete) everything.
 */
const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { createAccount } = require("../services/provisioning");
const { sendDemoAccessEmail } = require("../services/emailService");

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

router.post("/", async (req, res, next) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const phone = req.body?.phone ? String(req.body.phone).trim().slice(0, 30) : null;

  if (!email || !name) return res.status(400).json({ success: false, message: "Email and name are required" });
  if (!isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email format" });
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ success: false, message: "Name must be 2-100 characters" });
  }

  const password = crypto.randomBytes(12).toString("base64url"); // 16 chars, cryptographically random

  let created;
  try {
    created = await createAccount({
      accountName: `Demo: ${name}`,
      planCode: process.env.DEMO_PLAN_CODE || "pro",
      ownerEmail: email,
      ownerPassword: password,
      ownerName: name,
      ownerPhone: phone,
      branchName: "Demo salon",
      isDemo: true,
      cloneFrom: process.env.DEMO_TEMPLATE_SCHEMA || "salon_demo",
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ success: false, message: "This email is already registered" });
    }
    return next(err);
  }

  try {
    await sendDemoAccessEmail({ email, name }, password);
  } catch (err) {
    // Without the email the person cannot log in: undo, so they can simply retry.
    console.error("Demo email failed:", err.message);
    await db.query(`DELETE FROM public.tenants WHERE id = $1`, [created.tenant.id]).catch(() => {});
    await db.query(`DROP SCHEMA IF EXISTS "${created.tenant.schema_name}" CASCADE`).catch(() => {});
    await db.query(`DELETE FROM public.accounts WHERE id = $1`, [created.account.id]).catch(() => {});
    return res.status(502).json({ success: false, message: "Could not send the access email. Please try again later." });
  }

  res.status(201).json({
    success: true,
    message: "Registration successful! Check your email for login credentials.",
  });
});

module.exports = router;

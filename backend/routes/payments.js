const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

const isPositiveNumber = (v) => !isNaN(v) && parseFloat(v) > 0;

// GET all payments (supports expense_id now)
router.get("/", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const type = req.query.type || "all";

  try {
    const schema = await resolveTenantSchema(req);

    let query = `
      SELECT 
        p.id,
        p.partner_id,
        p.appointment_id,
        p.item_id,
        p.expense_id,                       -- << expense_id
        p.qty,
        p.amount,
        p.vat_percent,
        p.method,
        p.type,
        p.paid_at,
        a.start_time as appointment_start_time,
        m.name as master_name,
        c.name as partner_name,
        c.type as partner_type,
        i.name as item_name,
        i.unit as item_unit,
        e.name as expense_name              -- << expense name
      FROM ${schema}.payments p
      LEFT JOIN ${schema}.appointments a ON p.appointment_id = a.id
      LEFT JOIN ${schema}.masters m ON a.master_id = m.id
      LEFT JOIN ${schema}.clients c ON p.partner_id = c.id
      LEFT JOIN ${schema}.items i ON p.item_id = i.id
      LEFT JOIN ${schema}.expenses e ON p.expense_id = e.id
    `;

    const params = [];

    if (type !== "all") {
      query += ` WHERE p.type = $1`;
      params.push(type);
    }
    // master restriction
    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      const masterId = masterResult.rows[0].id;
      const whereClause = params.length > 0 ? " AND " : " WHERE ";
      query += `${whereClause}a.master_id = $${params.length + 1}`;
      params.push(masterId);
    }
    query += ` ORDER BY p.paid_at DESC`;
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("FETCH PAYMENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET single payment by id (supports expense)
router.get("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  try {
    const schema = await resolveTenantSchema(req);

    const { rows } = await db.query(
      `
      SELECT 
        p.id,
        p.partner_id,
        p.appointment_id,
        p.item_id,
        p.expense_id,                        -- << expense_id
        p.qty,
        p.amount,
        p.vat_percent,
        p.method,
        p.type,
        p.paid_at,
        a.start_time as appointment_start_time,
        m.name as master_name,
        c.name as partner_name,
        c.type as partner_type,
        i.name as item_name,
        i.unit as item_unit,
        e.name as expense_name               -- << expense name
      FROM ${schema}.payments p
      LEFT JOIN ${schema}.appointments a ON p.appointment_id = a.id
      LEFT JOIN ${schema}.masters m ON a.master_id = m.id
      LEFT JOIN ${schema}.clients c ON p.partner_id = c.id
      LEFT JOIN ${schema}.items i ON p.item_id = i.id
      LEFT JOIN ${schema}.expenses e ON p.expense_id = e.id
      WHERE p.id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Master restriction (only own appointments)
    if (role === "master" && rows[0].appointment_id) {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      const appointmentCheck = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [
        rows[0].appointment_id,
      ]);
      if (appointmentCheck.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
      if (appointmentCheck.rows[0].master_id !== masterResult.rows[0].id) return res.status(403).json({ message: "Forbidden" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH PAYMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST create payment: now supports expense_id
router.post("/", authenticateToken, async (req, res) => {
  const { partner_id, appointment_id, item_id, expense_id, qty, amount, vat_percent, method, type = "incoming" } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!partner_id || amount == null || !method) {
    return res.status(400).json({ message: "partner_id, amount, method required" });
  }
  if (!["Card", "Cash"].includes(method)) {
    return res.status(400).json({ message: 'method must be "Card" or "Cash"' });
  }
  if (!["incoming", "outgoing"].includes(type)) {
    return res.status(400).json({ message: 'type must be "incoming" or "outgoing"' });
  }
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ message: "amount must be a positive number" });
  }
  let vat = null;
  if (vat_percent !== undefined && vat_percent !== null && vat_percent !== "") {
    vat = Number(vat_percent);
    if (Number.isNaN(vat) || vat < 0 || vat > 100)
      return res.status(400).json({ message: "vat_percent must be between 0 and 100" });
  }

  // Exactly one of appointment_id, item_id, expense_id is required
  const hasAppointment = Boolean(appointment_id);
  const hasItem = Boolean(item_id);
  const hasExpense = Boolean(expense_id);
  const typesSelected = [hasAppointment, hasItem, hasExpense].filter(Boolean).length;
  if (typesSelected !== 1) {
    return res.status(400).json({
      message: "Select exactly one: appointment_id, item_id, or expense_id",
    });
  }
  // qty: appointment = 1, item/expense >= 1
  const finalQty = hasAppointment ? 1 : Number(qty ?? 1);
  if (!Number.isFinite(finalQty) || finalQty < 1) {
    return res.status(400).json({ message: "qty must be >= 1" });
  }

  try {
    const schema = await resolveTenantSchema(req);

    // Partner exists
    const partnerResult = await db.query(`SELECT id, type FROM ${schema}.clients WHERE id = $1`, [partner_id]);
    if (partnerResult.rows.length === 0) return res.status(404).json({ message: "Partner not found" });

    // Partner type matches payment type
    const partnerType = partnerResult.rows[0].type;
    const expectedPaymentType = partnerType === "customer" ? "incoming" : "outgoing";
    if (type !== expectedPaymentType) {
      return res.status(400).json({
        message: `${partnerType === "customer" ? "Customer" : "Vendor"} payments must be ${expectedPaymentType}`,
      });
    }

    // Appointment check (if any)
    if (hasAppointment) {
      const appointmentResult = await db.query(`SELECT id, master_id FROM ${schema}.appointments WHERE id = $1`, [
        appointment_id,
      ]);
      if (appointmentResult.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
      if (role === "master") {
        const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
        if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
        if (appointmentResult.rows[0].master_id !== masterResult.rows[0].id)
          return res.status(403).json({ message: "Can only create payments for your appointments" });
      }
    }

    // Item check (if any)
    if (hasItem) {
      const itemResult = await db.query(`SELECT id FROM ${schema}.items WHERE id = $1`, [item_id]);
      if (itemResult.rows.length === 0) return res.status(404).json({ message: "Item not found" });
    }

    // Expense check (if any)
    if (hasExpense) {
      const expenseResult = await db.query(`SELECT id FROM ${schema}.expenses WHERE id = $1`, [expense_id]);
      if (expenseResult.rows.length === 0) return res.status(404).json({ message: "Expense not found" });
    }

    // Create payment
    const { rows } = await db.query(
      `
      INSERT INTO ${schema}.payments (partner_id, appointment_id, item_id, expense_id, qty, amount, vat_percent, method, type, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING 
        id, partner_id, appointment_id, item_id, expense_id, qty, amount, vat_percent, method, type, paid_at
      `,
      [
        partner_id,
        hasAppointment ? appointment_id : null,
        hasItem ? item_id : null,
        hasExpense ? expense_id : null,
        finalQty,
        parseFloat(amount),
        vat,
        method,
        type,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("CREATE PAYMENT ERROR:", err);
    if (err.code === "23505") {
      return res.status(409).json({ message: "Payment for this combination already exists" });
    }
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

// PUT update payment
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { partner_id, appointment_id, item_id, expense_id, qty, amount, vat_percent, method, type } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!partner_id || amount == null || !method || !type) {
    return res.status(400).json({ message: "partner_id, amount, method, type required" });
  }
  if (!["Card", "Cash"].includes(method)) {
    return res.status(400).json({ message: 'method must be "Card" or "Cash"' });
  }
  if (!["incoming", "outgoing"].includes(type)) {
    return res.status(400).json({ message: 'type must be "incoming" or "outgoing"' });
  }
  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ message: "amount must be a positive number" });
  }
  let vat = null;
  if (vat_percent !== undefined && vat_percent !== null && vat_percent !== "") {
    vat = Number(vat_percent);
    if (Number.isNaN(vat) || vat < 0 || vat > 100) {
      return res.status(400).json({ message: "vat_percent must be between 0 and 100" });
    }
  }
  // Exactly one of appointment_id, item_id, expense_id is required
  const hasAppointment = Boolean(appointment_id);
  const hasItem = Boolean(item_id);
  const hasExpense = Boolean(expense_id);
  const typesSelected = [hasAppointment, hasItem, hasExpense].filter(Boolean).length;
  if (typesSelected !== 1) {
    return res.status(400).json({
      message: "Select exactly one: appointment_id, item_id, or expense_id",
    });
  }
  const finalQty = hasAppointment ? 1 : Number(qty ?? 1);
  if (!Number.isFinite(finalQty) || finalQty < 1) {
    return res.status(400).json({ message: "qty must be >= 1" });
  }

  try {
    const schema = await resolveTenantSchema(req);

    // Check payment exists + master ownership
    const checkPayment = await db.query(
      `
      SELECT p.id, a.master_id 
      FROM ${schema}.payments p
      LEFT JOIN ${schema}.appointments a ON p.appointment_id = a.id
      WHERE p.id = $1
      `,
      [id]
    );
    if (checkPayment.rows.length === 0) return res.status(404).json({ message: "Payment not found" });
    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      if (checkPayment.rows[0].master_id && checkPayment.rows[0].master_id !== masterResult.rows[0].id)
        return res.status(403).json({ message: "Can only edit your own payments" });
    }
    // Partner exists
    const partnerResult = await db.query(`SELECT id, type FROM ${schema}.clients WHERE id = $1`, [partner_id]);
    if (partnerResult.rows.length === 0) return res.status(404).json({ message: "Partner not found" });

    // Appointment check
    if (hasAppointment) {
      const appointmentResult = await db.query(`SELECT id FROM ${schema}.appointments WHERE id = $1`, [appointment_id]);
      if (appointmentResult.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
    }
    // Item check
    if (hasItem) {
      const itemResult = await db.query(`SELECT id FROM ${schema}.items WHERE id = $1`, [item_id]);
      if (itemResult.rows.length === 0) return res.status(404).json({ message: "Item not found" });
    }
    // Expense check
    if (hasExpense) {
      const expenseResult = await db.query(`SELECT id FROM ${schema}.expenses WHERE id = $1`, [expense_id]);
      if (expenseResult.rows.length === 0) return res.status(404).json({ message: "Expense not found" });
    }

    const { rows } = await db.query(
      `
      UPDATE ${schema}.payments
      SET partner_id = $1,
          appointment_id = $2,
          item_id = $3,
          expense_id = $4,
          qty = $5,
          amount = $6,
          vat_percent = $7,
          method = $8,
          type = $9
      WHERE id = $10
      RETURNING 
        id, partner_id, appointment_id, item_id, expense_id, qty, amount, vat_percent, method, type, paid_at
      `,
      [
        partner_id,
        hasAppointment ? appointment_id : null,
        hasItem ? item_id : null,
        hasExpense ? expense_id : null,
        finalQty,
        parseFloat(amount),
        vat,
        method,
        type,
        id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("UPDATE PAYMENT ERROR:", err);
    if (err.code === "23505") {
      return res.status(409).json({ message: "Payment for this combination already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE payment (no change needed)
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  try {
    const schema = await resolveTenantSchema(req);
    const checkPayment = await db.query(
      `
      SELECT p.id, a.master_id 
      FROM ${schema}.payments p
      LEFT JOIN ${schema}.appointments a ON p.appointment_id = a.id
      WHERE p.id = $1
      `,
      [id]
    );
    if (checkPayment.rows.length === 0) return res.status(404).json({ message: "Payment not found" });
    if (role === "master") {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      if (checkPayment.rows[0].master_id && checkPayment.rows[0].master_id !== masterResult.rows[0].id)
        return res.status(403).json({ message: "Can only delete your own payments" });
    }
    await db.query(`DELETE FROM ${schema}.payments WHERE id = $1`, [id]);
    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    console.error("DELETE PAYMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET invoice data for payment (supports expense)
router.get("/:id/invoice", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  try {
    const schema = await resolveTenantSchema(req);
    // Payment + partner + item/expense (if any)
    const paymentResult = await db.query(
      `
      SELECT 
        p.id,
        p.partner_id,
        p.appointment_id,
        p.item_id,
        p.expense_id,                        -- << expense_id
        p.qty,
        p.amount,
        p.vat_percent,
        p.method,
        p.type,
        p.paid_at,
        c.name as partner_name,
        c.email as partner_email,
        c.phone as partner_phone,
        c.address as partner_address,
        c.type as partner_type,
        i.name as item_name,
        i.unit as item_unit,
        e.name as expense_name               -- << expense name
      FROM ${schema}.payments p
      LEFT JOIN ${schema}.clients c ON p.partner_id = c.id
      LEFT JOIN ${schema}.items i ON p.item_id = i.id
      LEFT JOIN ${schema}.expenses e ON p.expense_id = e.id
      WHERE p.id = $1
      `,
      [id]
    );
    if (paymentResult.rows.length === 0) return res.status(404).json({ message: "Payment not found" });
    const payment = paymentResult.rows[0];

    if (role === "master" && payment.appointment_id) {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      const appointmentCheck = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [
        payment.appointment_id,
      ]);
      if (appointmentCheck.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
      if (appointmentCheck.rows[0].master_id !== masterResult.rows[0].id) return res.status(403).json({ message: "Forbidden" });
    }

    // Appointment data (if any)
    let appointment = null;
    if (payment.appointment_id) {
      const appointmentResult = await db.query(
        `
        SELECT 
          a.id,
          a.start_time,
          a.service_id,
          m.name as master_name,
          s.name as service_name
        FROM ${schema}.appointments a
        LEFT JOIN ${schema}.masters m ON a.master_id = m.id
        LEFT JOIN ${schema}.services s ON a.service_id = s.id
        WHERE a.id = $1
        `,
        [payment.appointment_id]
      );
      if (appointmentResult.rows.length > 0) appointment = appointmentResult.rows[0];
    }

    let expense = null;
    if (payment.expense_id) {
      expense = {
        id: payment.expense_id,
        name: payment.expense_name || "Expense",
      };
    }

    // Company settings
    const settingsResult = await db.query(
      `
      SELECT 
        name,
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_code,
        email,
        phone,
        website
      FROM ${schema}.settings
      LIMIT 1
      `
    );
    let company = {
      name: "ELSA Beauty",
      address: "",
      vat_number: "",
      bank_name: "",
      bank_account: "",
      bank_code: "",
      email: "",
      phone: "",
      website: "",
    };
    if (settingsResult.rows.length > 0) company = settingsResult.rows[0];

    // Response
    res.json({
      payment: {
        id: payment.id,
        amount: parseFloat(payment.amount),
        vat_percent: payment.vat_percent !== null && payment.vat_percent !== undefined ? Number(payment.vat_percent) : null,
        qty: payment.qty ? Number(payment.qty) : 1,
        method: payment.method,
        type: payment.type,
        paid_at: payment.paid_at,
        appointment_id: payment.appointment_id,
        item_id: payment.item_id,
        expense_id: payment.expense_id,
      },
      partner: {
        name: payment.partner_name,
        email: payment.partner_email,
        phone: payment.partner_phone,
        address: payment.partner_address,
        type: payment.partner_type,
      },
      appointment,
      item: payment.item_id
        ? {
            id: payment.item_id,
            name: payment.item_name || "Item",
            unit: payment.item_unit || "",
          }
        : null,
      expense,
      company,
    });
  } catch (err) {
    console.error("GET INVOICE ERROR:", err);
    res.status(500).json({ message: "Server error", details: err.message });
  }
});

module.exports = router;
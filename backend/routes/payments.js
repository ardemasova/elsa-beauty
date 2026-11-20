const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");
const { requireFeature } = require('../middleware/featureGuard');

const router = express.Router();

const isPositiveNumber = (v) => !isNaN(v) && parseFloat(v) > 0;

// GET all payments (supports expense_id now)
router.get("/", authenticateToken, requireFeature('payments'), async (req, res) => {
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
        p.document_type,
        p.document_number,
        p.refund_of,
        p.reason,
        (SELECT o.document_number FROM ${schema}.payments o WHERE o.id = p.refund_of) AS refund_of_number,
        COALESCE((SELECT -sum(r.amount) FROM ${schema}.payments r WHERE r.refund_of = p.id), 0) AS refunded,
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
      // a user can have more than one master profile in a branch
      const masterIds = masterResult.rows.map((m) => m.id);
      const whereClause = params.length > 0 ? " AND " : " WHERE ";
      query += `${whereClause}a.master_id = ANY($${params.length + 1}::uuid[])`;
      params.push(masterIds);
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
router.get("/:id", authenticateToken, requireFeature('payments'), async (req, res) => {
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
        p.document_type,
        p.document_number,
        p.refund_of,
        p.reason,
        (SELECT o.document_number FROM ${schema}.payments o WHERE o.id = p.refund_of) AS refund_of_number,
        COALESCE((SELECT -sum(r.amount) FROM ${schema}.payments r WHERE r.refund_of = p.id), 0) AS refunded,
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

    // Master restriction: only payments of their own appointments
    if (role === "master" && !rows[0].appointment_id) return res.status(403).json({ message: "Forbidden" });
    if (role === "master" && rows[0].appointment_id) {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      const appointmentCheck = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [
        rows[0].appointment_id,
      ]);
      if (appointmentCheck.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
      if (!masterResult.rows.some((m) => m.id === appointmentCheck.rows[0].master_id)) return res.status(403).json({ message: "Forbidden" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("FETCH PAYMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST create payment: now supports expense_id
router.post("/", authenticateToken, requireFeature('payments'), async (req, res) => {
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
  if (role === "master" && !hasAppointment) {
    return res.status(403).json({ message: "Masters can only register payments for their appointments" });
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
      const appointmentResult = await db.query(`SELECT id, master_id, client_id FROM ${schema}.appointments WHERE id = $1`, [
        appointment_id,
      ]);
      if (appointmentResult.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
      if (role === "master") {
        const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
        if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
        if (!masterResult.rows.some((m) => m.id === appointmentResult.rows[0].master_id))
          return res.status(403).json({ message: "Can only create payments for your appointments" });
        // A master only records what the appointment's client paid.
        if (type !== "incoming" || appointmentResult.rows[0].client_id !== partner_id)
          return res.status(403).json({ message: "Masters can only record the client's payment for their appointment" });
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
    const insertPayment = (q) => q.query(
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

    let rows;
    if (role === "master") {
      // A master may not record more than is still due for the appointment.
      // Lock the appointment so parallel requests cannot both pass the check.
      rows = await db.withTransaction(async (client) => {
        await client.query(`SELECT 1 FROM ${schema}.appointments WHERE id = $1 FOR UPDATE`, [appointment_id]);
        const due = await client.query(
          `SELECT a.price - COALESCE((SELECT sum(amount) FROM ${schema}.payments
                                       WHERE appointment_id = a.id AND type = 'incoming'), 0) AS due
             FROM ${schema}.appointments a WHERE a.id = $1`,
          [appointment_id]
        );
        const remaining = Number(due.rows[0]?.due ?? 0);
        if (parseFloat(amount) - remaining > 0.005) {
          const e = new Error(`Amount exceeds what is due for this appointment (${remaining.toFixed(2)}). Ask an admin for anything extra.`);
          e.status = 400;
          throw e;
        }
        return (await insertPayment(client)).rows;
      });
    } else {
      rows = (await insertPayment(db)).rows;
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error("CREATE PAYMENT ERROR:", err);
    if (err.code === "23505") {
      return res.status(409).json({ message: "Payment for this combination already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// PUT update payment
router.put("/:id", authenticateToken, requireFeature('payments'), async (req, res) => {
  // Changing recorded money is reserved for admins.
  if (req.user.role !== "admin") return res.status(403).json({ message: "Only an admin can edit payments" });
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

    // Numbered documents follow invoicing rules: a credit note is never edited,
    // and an invoice that has been (partly) refunded keeps its amounts.
    const cur = await db.query(
      `SELECT document_type, document_number, type, partner_id, amount, vat_percent,
              appointment_id, item_id, expense_id,
              (SELECT count(*)::int FROM ${schema}.payments r WHERE r.refund_of = p.id) AS credit_notes
         FROM ${schema}.payments p WHERE p.id = $1`,
      [id]
    );
    const c = cur.rows[0];
    if (c?.document_type === "credit_note") {
      return res.status(409).json({ message: "A credit note cannot be edited. Issue a new credit note instead." });
    }
    if (c?.document_number && type !== c.type) {
      return res.status(409).json({ message: "The direction of a numbered invoice cannot be changed" });
    }
    if (c?.credit_notes > 0) {
      const same = (x, y) => String(x ?? "") === String(y ?? "");
      const changed =
        Math.abs(Number(amount) - Number(c.amount)) > 0.001 ||
        !same(vat === null ? null : Number(vat), c.vat_percent === null ? null : Number(c.vat_percent)) ||
        !same(partner_id, c.partner_id) ||
        !same(hasAppointment ? appointment_id : null, c.appointment_id) ||
        !same(hasItem ? item_id : null, c.item_id) ||
        !same(hasExpense ? expense_id : null, c.expense_id);
      if (changed) {
        return res.status(409).json({ message: "This invoice has a credit note: only the payment method can still be changed" });
      }
    }

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
      if (!masterResult.rows.some((m) => m.id === checkPayment.rows[0].master_id))
        return res.status(403).json({ message: "Can only edit your own payments" });
      if (!hasAppointment) return res.status(403).json({ message: "Masters can only register payments for their appointments" });
      const target = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [appointment_id]);
      if (!masterResult.rows.some((m) => m.id === target.rows[0]?.master_id))
        return res.status(403).json({ message: "Can only link payments to your own appointments" });
    }
    // Partner exists and matches the payment direction
    const partnerResult = await db.query(`SELECT id, type FROM ${schema}.clients WHERE id = $1`, [partner_id]);
    if (partnerResult.rows.length === 0) return res.status(404).json({ message: "Partner not found" });
    const expectedType = partnerResult.rows[0].type === "customer" ? "incoming" : "outgoing";
    if (type !== expectedType) {
      return res.status(400).json({
        message: `${partnerResult.rows[0].type === "customer" ? "Customer" : "Vendor"} payments must be ${expectedType}`,
      });
    }

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

// DELETE payment (admin only)
router.delete("/:id", authenticateToken, requireFeature('payments'), async (req, res) => {
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
    // Deleting financial records is reserved for admins.
    if (role !== "admin") return res.status(403).json({ message: "Only an admin can delete payments" });

    const result = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT document_type, document_number,
                EXISTS (SELECT 1 FROM ${schema}.payments r WHERE r.refund_of = p.id) AS has_credit_notes
           FROM ${schema}.payments p WHERE p.id = $1 FOR UPDATE`,
        [id]
      );
      const doc = rows[0];
      if (doc.has_credit_notes) {
        return { status: 409, message: "This invoice has a credit note and cannot be deleted" };
      }
      if (doc.document_number) {
        // Numbered invoices must stay correlative: only the latest number of
        // its series can be withdrawn (e.g. one created by mistake just now).
        const m = /(\d{4})-(\d{4,})$/.exec(doc.document_number);
        const series = doc.document_type === "credit_note" ? "R" : "F";
        const counter = m
          ? await client.query(
              `SELECT last FROM ${schema}.document_counters WHERE series = $1 AND year = $2 FOR UPDATE`,
              [series, Number(m[1])]
            )
          : { rows: [] };
        if (!m || counter.rows[0]?.last !== Number(m[2])) {
          return {
            status: 409,
            message: `Invoice ${doc.document_number} is not the latest one and cannot be deleted. Issue a credit note instead.`,
          };
        }
        await client.query(`UPDATE ${schema}.document_counters SET last = last - 1 WHERE series = $1 AND year = $2`, [series, Number(m[1])]);
      }
      await client.query(`DELETE FROM ${schema}.payments WHERE id = $1`, [id]);
      return { status: 200, message: "Payment deleted successfully" };
    });
    res.status(result.status).json({ message: result.message });
  } catch (err) {
    console.error("DELETE PAYMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/payments/:id/credit-note  { amount?, method?, reason }   (admin)
// Refunds all or part of a customer invoice. Creates a credit note: a payment
// with a negative amount, its own number series and a link to the invoice.
router.post("/:id/credit-note", authenticateToken, requireFeature('payments'), async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Only an admin can issue credit notes" });
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ message: "Please give a reason for the credit note" });
  if (reason.length > 500) return res.status(400).json({ message: "Reason is too long (max 500 characters)" });
  const method = req.body?.method;
  if (method !== undefined && !["Card", "Cash"].includes(method)) {
    return res.status(400).json({ message: 'method must be "Card" or "Cash"' });
  }
  const requested = req.body?.amount === undefined || req.body?.amount === "" ? null : Number(req.body.amount);
  if (requested !== null && !(requested > 0)) return res.status(400).json({ message: "amount must be a positive number" });

  try {
    const schema = await resolveTenantSchema(req);
    const result = await db.withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM ${schema}.payments WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const inv = rows[0];
      if (!inv) return { status: 404, body: { message: "Payment not found" } };
      if (inv.type !== "incoming" || inv.document_type !== "payment") {
        return { status: 400, body: { message: "Credit notes can only be issued for payments received from customers" } };
      }
      const done = await client.query(
        `SELECT COALESCE(-sum(amount), 0) AS refunded FROM ${schema}.payments WHERE refund_of = $1`,
        [inv.id]
      );
      const refundable = Math.round((Number(inv.amount) - Number(done.rows[0].refunded)) * 100) / 100;
      if (refundable <= 0) return { status: 409, body: { message: "This invoice has already been refunded in full" } };
      const amount = requested === null ? refundable : Math.round(requested * 100) / 100;
      if (amount - refundable > 0.005) {
        return { status: 400, body: { message: `At most ${refundable.toFixed(2)} can still be refunded on this invoice` } };
      }
      const full = Math.abs(amount - Number(inv.amount)) < 0.005;
      const ins = await client.query(
        `INSERT INTO ${schema}.payments
           (partner_id, appointment_id, item_id, qty, amount, vat_percent, method, type,
            document_type, refund_of, reason, unit_cost, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'incoming', 'credit_note', $8, $9, $10, NOW())
         RETURNING id, document_number, amount, vat_amount, amount_net, refund_of, reason, paid_at`,
        [
          inv.partner_id,
          inv.appointment_id,
          inv.item_id,
          full ? -inv.qty : 0, // a full refund also returns the quantity sold
          -amount,
          inv.vat_percent,
          method || inv.method,
          inv.id,
          reason,
          inv.unit_cost,
        ]
      );
      return { status: 201, body: { ...ins.rows[0], refund_of_number: inv.document_number } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("CREATE CREDIT NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET invoice data for payment (supports expense)
router.get("/:id/invoice", authenticateToken, requireFeature('payments'), async (req, res) => {
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
        p.vat_amount,
        p.amount_net,
        p.method,
        p.type,
        p.paid_at,
        p.document_type,
        p.document_number,
        p.refund_of,
        p.reason,
        (SELECT o.document_number FROM ${schema}.payments o WHERE o.id = p.refund_of) AS refund_of_number,
        COALESCE((SELECT -sum(r.amount) FROM ${schema}.payments r WHERE r.refund_of = p.id), 0) AS refunded,
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

    if (role === "master" && !payment.appointment_id) return res.status(403).json({ message: "Forbidden" });
    if (role === "master" && payment.appointment_id) {
      const masterResult = await db.query(`SELECT id FROM ${schema}.masters WHERE user_id = $1`, [userId]);
      if (masterResult.rows.length === 0) return res.status(403).json({ message: "Master profile not found" });
      const appointmentCheck = await db.query(`SELECT master_id FROM ${schema}.appointments WHERE id = $1`, [
        payment.appointment_id,
      ]);
      if (appointmentCheck.rows.length === 0) return res.status(404).json({ message: "Appointment not found" });
      if (!masterResult.rows.some((m) => m.id === appointmentCheck.rows[0].master_id)) return res.status(403).json({ message: "Forbidden" });
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
        document_type: payment.document_type,
        document_number: payment.document_number,
        refund_of: payment.refund_of,
        refund_of_number: payment.refund_of_number,
        refunded: Number(payment.refunded || 0),
        reason: payment.reason,
        vat_amount: payment.vat_amount !== undefined ? Number(payment.vat_amount) : undefined,
        amount_net: payment.amount_net !== undefined ? Number(payment.amount_net) : undefined,
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
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
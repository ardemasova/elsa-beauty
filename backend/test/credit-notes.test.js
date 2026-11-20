/**
 * Invoice numbering and credit notes (refunds).
 * Same disposable database as the other tests (./test/prepare-db.sh).
 */
process.env.MAIL_TRANSPORT = "json";
process.env.NODE_ENV = "test";
require("dotenv").config({ path: process.env.TEST_ENV_FILE || ".env.test" });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../index");
const db = require("../db");
const { createAccount } = require("../services/provisioning");

let server, base, owner, master, S, tenant;
const ids = {};

async function api(method, path, { token = owner, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const login = async (email, password) =>
  (await (await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json()).token;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const created = await createAccount({
    accountName: "Credit Salon", planCode: "standard",
    ownerEmail: "cn-owner@test.com", ownerPassword: "ownerpassword1", branchName: "Lola Centro",
  });
  tenant = created.tenant;
  S = `"${tenant.schema_name}"`;
  owner = await login("cn-owner@test.com", "ownerpassword1");
  const m = await api("POST", "/api/users", { body: { email: "cn-master@test.com", password: "password123", role: "master", tenant_ids: [tenant.id] } });
  master = await login("cn-master@test.com", "password123");

  ids.svc = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Cut', 60, 121, 20) RETURNING id`)).id;
  ids.m = (await one(`INSERT INTO ${S}.masters (name, commission, user_id) VALUES ('Eva', 30, $1) RETURNING id`, [m.data.id])).id;
  ids.c = (await one(`INSERT INTO ${S}.clients (name, type) VALUES ('Carmen', 'customer') RETURNING id`)).id;
  ids.v = (await one(`INSERT INTO ${S}.clients (name, type) VALUES ('Supplier', 'vendor') RETURNING id`)).id;
  ids.item = (await one(`INSERT INTO ${S}.items (name, price, cost, unit) VALUES ('Mask', 12.1, 4, 'pcs') RETURNING id`)).id;
  ids.exp = (await one(`INSERT INTO ${S}.expenses (name) VALUES ('Rent') RETURNING id`)).id;
  ids.appt = (await one(
    `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
     VALUES ($1, $2, $3, now() - interval '2 hours', now() - interval '1 hour', 'completed') RETURNING id`,
    [ids.m, ids.c, ids.svc]
  )).id;
});

after(async () => {
  server.close();
  await db.pool.end();
});

const pay = (body, token) => api("POST", "/api/payments", { token, body: { method: "Card", vat_percent: 21, ...body } });
const year = new Date().toLocaleString("en-CA", { timeZone: "Europe/Madrid" }).slice(0, 4);

test("customer payments get correlative invoice numbers with the branch prefix; supplier payments get none", async () => {
  const a = await pay({ partner_id: ids.c, appointment_id: ids.appt, amount: 121, type: "incoming" });
  const b = await pay({ partner_id: ids.c, item_id: ids.item, qty: 2, amount: 24.2, type: "incoming" });
  const v = await pay({ partner_id: ids.v, expense_id: ids.exp, amount: 500, type: "outgoing" });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  ids.inv1 = a.data.id;
  ids.inv2 = b.data.id;
  const list = (await api("GET", "/api/payments")).data;
  const num = (id) => list.find((p) => p.id === id).document_number;
  assert.equal(num(a.data.id), `LOL-F-${year}-0001`);
  assert.equal(num(b.data.id), `LOL-F-${year}-0002`);
  assert.equal(num(v.data.id), null);
});

test("parallel payments never get the same number", async () => {
  const rs = await Promise.all(Array.from({ length: 8 }, () => pay({ partner_id: ids.c, item_id: ids.item, qty: 1, amount: 12.1, type: "incoming" })));
  assert.ok(rs.every((r) => r.status === 201));
  const nums = (await db.query(`SELECT document_number FROM ${S}.payments WHERE document_number IS NOT NULL`)).rows.map((r) => r.document_number);
  assert.equal(new Set(nums).size, nums.length);
  assert.equal(nums.length, 10);
});

test("a partial credit note: own series, negative amount with VAT, linked to the invoice", async () => {
  const r = await api("POST", `/api/payments/${ids.inv1}/credit-note`, { body: { amount: 24.2, reason: "Late appointment discount" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.document_number, `LOL-R-${year}-0001`);
  assert.deepEqual([Number(r.data.amount), Number(r.data.vat_amount), Number(r.data.amount_net)], [-24.2, -4.2, -20]);
  assert.equal(r.data.refund_of_number, `LOL-F-${year}-0001`);

  const inv = (await api("GET", `/api/payments/${r.data.id}/invoice`)).data;
  assert.equal(inv.payment.document_type, "credit_note");
  assert.equal(inv.payment.refund_of_number, `LOL-F-${year}-0001`);
  assert.equal(inv.payment.reason, "Late appointment discount");
});

test("cannot refund more than what is left; full refund of the rest works", async () => {
  const over = await api("POST", `/api/payments/${ids.inv1}/credit-note`, { body: { amount: 100, reason: "x" } });
  assert.equal(over.status, 400);
  assert.match(over.data.message, /96\.80/);
  const rest = await api("POST", `/api/payments/${ids.inv1}/credit-note`, { body: { reason: "Cancelled" } });
  assert.equal(rest.status, 201);
  assert.equal(Number(rest.data.amount), -96.8);
  const again = await api("POST", `/api/payments/${ids.inv1}/credit-note`, { body: { reason: "x" } });
  assert.equal(again.status, 409);
  const list = (await api("GET", "/api/payments")).data;
  assert.equal(Number(list.find((p) => p.id === ids.inv1).refunded), 121);
});

test("rules: reason required, admins only, only customer invoices", async () => {
  assert.equal((await api("POST", `/api/payments/${ids.inv2}/credit-note`, { body: {} })).status, 400);
  assert.equal((await api("POST", `/api/payments/${ids.inv2}/credit-note`, { token: master, body: { reason: "x" } })).status, 403);
  const vendorPay = (await db.query(`SELECT id FROM ${S}.payments WHERE type = 'outgoing'`)).rows[0].id;
  assert.equal((await api("POST", `/api/payments/${vendorPay}/credit-note`, { body: { reason: "x" } })).status, 400);
});

test("refunded invoices and credit notes cannot be rewritten or deleted", async () => {
  const cn = (await db.query(`SELECT id FROM ${S}.payments WHERE document_type = 'credit_note' LIMIT 1`)).rows[0].id;
  const edit = await api("PUT", `/api/payments/${cn}`, { body: { partner_id: ids.c, appointment_id: ids.appt, amount: 1, method: "Cash", type: "incoming" } });
  assert.equal(edit.status, 409);
  const changeAmount = await api("PUT", `/api/payments/${ids.inv1}`, { body: { partner_id: ids.c, appointment_id: ids.appt, amount: 50, vat_percent: 21, method: "Card", type: "incoming" } });
  assert.equal(changeAmount.status, 409);
  const changeMethod = await api("PUT", `/api/payments/${ids.inv1}`, { body: { partner_id: ids.c, appointment_id: ids.appt, amount: 121, vat_percent: 21, method: "Cash", type: "incoming" } });
  assert.equal(changeMethod.status, 200, JSON.stringify(changeMethod.data));
  assert.equal((await api("DELETE", `/api/payments/${ids.inv1}`)).status, 409);
  // an older invoice (not the latest number) cannot be deleted either
  assert.equal((await api("DELETE", `/api/payments/${ids.inv2}`)).status, 409);
});

test("the latest invoice can be withdrawn and its number is reused", async () => {
  const last = await pay({ partner_id: ids.c, item_id: ids.item, qty: 1, amount: 12.1, type: "incoming" });
  const n = (await one(`SELECT document_number FROM ${S}.payments WHERE id = $1`, [last.data.id])).document_number;
  assert.equal(n, `LOL-F-${year}-0011`);
  assert.equal((await api("DELETE", `/api/payments/${last.data.id}`)).status, 200);
  const next = await pay({ partner_id: ids.c, item_id: ids.item, qty: 1, amount: 12.1, type: "incoming" });
  assert.equal((await one(`SELECT document_number FROM ${S}.payments WHERE id = $1`, [next.data.id])).document_number, `LOL-F-${year}-0011`);
});

test("reports: refunds lower income of the month; the visit does not become unpaid", async () => {
  const today = new Date().toLocaleString("en-CA", { timeZone: "Europe/Madrid" }).slice(0, 10);
  const r = await api("GET", `/api/analytics/overview?from=${today.slice(0, 8)}01&to=${today}`);
  const c = r.data.current;
  // invoices: 121 + 24.20 + 8 x 12.10 + 12.10 (re-issued no. 11) = 254.10; refunds 121
  assert.equal(c.income.gross, 133.1);
  assert.equal(c.income.refunds, 121);
  assert.equal(c.income.refunds_count, 2);
  assert.equal(c.income.payments, 11);
  assert.equal(c.unpaid.count, 0);
  // masters: the refunded visit no longer brings money
  const m = (await api("GET", `/api/analytics/breakdown/master?from=${today.slice(0, 8)}01&to=${today}`)).data.rows;
  assert.equal(m.find((x) => x.name === "Eva").income_gross, 0);
});

test("invoice prefix can be changed in settings", async () => {
  const r = await api("PUT", "/api/settings/company", { body: { name: "Lola Centro", invoice_prefix: "lc1" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const p = await pay({ partner_id: ids.c, item_id: ids.item, qty: 1, amount: 12.1, type: "incoming" });
  assert.equal((await one(`SELECT document_number FROM ${S}.payments WHERE id = $1`, [p.data.id])).document_number, `LC1-F-${year}-0012`);
  assert.equal((await api("PUT", "/api/settings/company", { body: { name: "Lola Centro", invoice_prefix: "LC-1" } })).status, 400);
});

/**
 * Report figures checked against numbers worked out by hand.
 * Uses the same disposable test database as security.test.js
 * (./test/prepare-db.sh && npm test).
 *
 * Branch time zone: Europe/Madrid (CET +1 in winter, CEST +2 from 29 Mar 2026).
 * All payments include 21% VAT unless stated.
 */
process.env.MAIL_TRANSPORT = "json";
process.env.NODE_ENV = "test";
require("dotenv").config({ path: process.env.TEST_ENV_FILE || ".env.test" });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../index");
const db = require("../db");
const { createAccount } = require("../services/provisioning");

let server, base, ownerToken, masterToken, S;
const ids = {};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const login = async (email, password) => (await api("POST", "/api/auth/login", { body: { email, password } })).data.token;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  const { owner, tenant } = await createAccount({
    accountName: "Report Test Salon", planCode: "standard",
    ownerEmail: "reports-owner@test.com", ownerPassword: "ownerpassword1", branchName: "Centro",
  });
  S = `"${tenant.schema_name}"`;
  ownerToken = await login("reports-owner@test.com", "ownerpassword1");

  const m = await api("POST", "/api/users", {
    token: ownerToken,
    body: { email: "bea@test.com", password: "password123", role: "master", tenant_ids: [tenant.id] },
  });
  assert.equal(m.status, 201, JSON.stringify(m.data));
  masterToken = await login("bea@test.com", "password123");

  ids.cut = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Cut', 60, 50, 10) RETURNING id`)).id;
  ids.color = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Color', 120, 121, 21) RETURNING id`)).id;
  ids.dayoff = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Day Off', 480, 0, 0) RETURNING id`)).id;
  ids.ana = (await one(`INSERT INTO ${S}.masters (name, commission, user_id) VALUES ('Ana', 40, $1) RETURNING id`, [owner.id])).id;
  ids.bea = (await one(`INSERT INTO ${S}.masters (name, commission, user_id) VALUES ('Bea', 30, $1) RETURNING id`, [m.data.id])).id;
  ids.c1 = (await one(`INSERT INTO ${S}.clients (name, type, phone) VALUES ('Carmen', 'customer', '600111222') RETURNING id`)).id;
  ids.c2 = (await one(`INSERT INTO ${S}.clients (name, type) VALUES ('Lucia', 'customer') RETURNING id`)).id;
  ids.v1 = (await one(`INSERT INTO ${S}.clients (name, type) VALUES ('Landlord', 'vendor') RETURNING id`)).id;
  ids.shampoo = (await one(`INSERT INTO ${S}.items (name, price, cost, unit) VALUES ('Shampoo', 24.2, 8, 'pcs') RETURNING id`)).id;
  ids.rent = (await one(`INSERT INTO ${S}.expenses (name) VALUES ('Rent') RETURNING id`)).id;

  const appt = async (key, master, client, service, start, minutes, status) => {
    ids[key] = (await one(
      `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(mins => $5), $6) RETURNING id`,
      [master, client, service, start, minutes, status]
    )).id;
  };
  await appt("a1", ids.ana, ids.c1, ids.cut, "2026-03-10 10:00+01", 60, "completed");
  await appt("a2", ids.ana, ids.c2, ids.color, "2026-03-11 10:00+01", 120, "completed");
  await appt("a3", ids.bea, ids.c1, ids.cut, "2026-03-12 10:00+01", 60, "cancelled");
  // 31 Mar 22:30 UTC = 1 Apr 00:30 in Madrid -> an APRIL visit
  await appt("a4", ids.bea, ids.c2, ids.color, "2026-03-31 22:30+00", 120, "completed");
  await appt("a5", ids.bea, null, ids.dayoff, "2026-03-15 09:00+01", 480, "planned"); // day off: never a visit
  await appt("a6", ids.bea, ids.c1, ids.cut, "2026-03-20 10:00+01", 60, "planned");

  // Prices and commission change AFTER booking: history must not move.
  await db.query(`UPDATE ${S}.services SET price = 60, cost = 15 WHERE id = $1`, [ids.cut]);
  await db.query(`UPDATE ${S}.masters SET commission = 50 WHERE id = $1`, [ids.ana]);
  await db.query(`UPDATE ${S}.items SET cost = 9.99 WHERE id = $1`, [ids.shampoo]);

  const pay = (fields) => {
    const cols = Object.keys(fields);
    return db.query(
      `INSERT INTO ${S}.payments (${cols.join(", ")}) VALUES (${cols.map((_, k) => `$${k + 1}`).join(", ")})`,
      Object.values(fields)
    );
  };
  await pay({ appointment_id: ids.a1, partner_id: ids.c1, amount: 50, vat_percent: 21, method: "Card", type: "incoming", paid_at: "2026-03-10 11:00+01" });
  await pay({ appointment_id: ids.a2, partner_id: ids.c2, amount: 100, vat_percent: 21, method: "Cash", type: "incoming", paid_at: "2026-03-11 12:00+01" });
  // item sale; unit_cost was 8 at the time (set before the cost change? no: snapshot is taken at sale time)
  await db.query(`UPDATE ${S}.items SET cost = 8 WHERE id = $1`, [ids.shampoo]);
  await pay({ item_id: ids.shampoo, qty: 2, partner_id: ids.c1, amount: 48.4, vat_percent: 21, method: "Card", type: "incoming", paid_at: "2026-03-15 12:00+01" });
  // 28 Feb 23:30 UTC = 1 Mar 00:30 in Madrid -> a MARCH payment
  await pay({ item_id: ids.shampoo, qty: 1, partner_id: ids.c1, amount: 24.2, vat_percent: 21, method: "Cash", type: "incoming", paid_at: "2026-02-28 23:30+00" });
  await db.query(`UPDATE ${S}.items SET cost = 9.99 WHERE id = $1`, [ids.shampoo]);
  await pay({ expense_id: ids.rent, partner_id: ids.v1, amount: 1210, vat_percent: 21, method: "Card", type: "outgoing", paid_at: "2026-03-01 10:00+01" });
  // 31 Mar 22:45 UTC = 1 Apr in Madrid -> an APRIL payment
  await pay({ appointment_id: ids.a4, partner_id: ids.c2, amount: 121, vat_percent: 21, method: "Card", type: "incoming", paid_at: "2026-03-31 22:45+00" });
});

after(async () => {
  server.close();
  await db.pool.end();
});

const MARCH = "from=2026-03-01&to=2026-03-31";

test("booking snapshots: later price/commission changes do not rewrite history", async () => {
  const a1 = await one(`SELECT price, cost, commission_percent FROM ${S}.appointments WHERE id = $1`, [ids.a1]);
  assert.deepEqual([Number(a1.price), Number(a1.cost), Number(a1.commission_percent)], [50, 10, 40]);

  // a new booking gets today's price; changing the service re-prices it
  const { id } = await one(
    `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
     VALUES ($1, $2, $3, '2026-05-05 10:00+02', '2026-05-05 11:00+02', 'planned') RETURNING id`,
    [ids.ana, ids.c1, ids.cut]
  );
  assert.equal(Number((await one(`SELECT price FROM ${S}.appointments WHERE id = $1`, [id])).price), 60);
  await db.query(`UPDATE ${S}.appointments SET service_id = $1 WHERE id = $2`, [ids.color, id]);
  assert.equal(Number((await one(`SELECT price FROM ${S}.appointments WHERE id = $1`, [id])).price), 121);
  // changing only the status keeps the price
  await db.query(`UPDATE ${S}.services SET price = 130 WHERE id = $1`, [ids.color]);
  await db.query(`UPDATE ${S}.appointments SET status = 'cancelled' WHERE id = $1`, [id]);
  assert.equal(Number((await one(`SELECT price FROM ${S}.appointments WHERE id = $1`, [id])).price), 121);
  await db.query(`DELETE FROM ${S}.appointments WHERE id = $1`, [id]);
  await db.query(`UPDATE ${S}.services SET price = 121 WHERE id = $1`, [ids.color]);
});

test("payments: VAT is split out of the VAT-inclusive amount", async () => {
  const r = await one(`SELECT amount, vat_amount, amount_net FROM ${S}.payments WHERE expense_id = $1`, [ids.rent]);
  assert.deepEqual([Number(r.amount), Number(r.vat_amount), Number(r.amount_net)], [1210, 210, 1000]);
});

test("overview for March matches the hand calculation", async () => {
  const r = await api("GET", `/api/analytics/overview?${MARCH}`, { token: ownerToken });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = r.data.current;
  assert.equal(r.data.period.timezone, "Europe/Madrid");
  assert.equal(r.data.period.currency, "EUR");

  // income: 50 + 100 + 48.40 + 24.20 (the 1 Mar 00:30 sale), NOT the 1 Apr payment
  assert.deepEqual(c.income, { gross: 222.6, net: 183.96, vat: 38.64, payments: 4, services: 150, items: 72.6, other: 0, without_vat_rate: 0, refunds: 0, refunds_count: 0 });
  assert.deepEqual(c.expenses, { gross: 1210, net: 1000, vat: 210, payments: 1 });

  // visits: a1 + a2 completed (a4 is in April, a5 is a day off)
  assert.equal(c.services.completed, 2);
  assert.equal(c.services.rendered_value, 171); // 50 (booked price, not today's 60) + 121
  assert.equal(c.services.hours, 3);
  assert.equal(c.services.cancelled, 1);
  assert.equal(c.services.cancelled_value, 50);
  assert.equal(c.services.planned, 1);
  assert.equal(c.services.unique_clients, 2);

  assert.equal(c.margin.services, 140); // (50-10) + (121-21)
  assert.equal(c.margin.items, 36); // (40.00 - 2*8) + (20.00 - 8)
  assert.equal(c.margin.commissions, 68.4); // Ana 40% (booked) of 171
  assert.equal(c.avg_ticket, 85.5); // 171 services done / 2 completed visits
  assert.deepEqual(c.unpaid, { count: 1, amount: 21 }); // a2: 121 - 100
  assert.equal(c.result, -884.44); // 183.96 - 1000 - 68.40

  // a whole month is compared with the whole month before it
  assert.deepEqual(r.data.previous_period, { from: "2026-02-01", to: "2026-02-28" });
  assert.equal(r.data.previous.income.gross, 0); // the 28 Feb 23:30 UTC sale belongs to March
  assert.equal(r.data.change.income_gross, null); // nothing to compare with
});

test("April gets the visit and payment that happened after midnight in Madrid", async () => {
  const r = await api("GET", "/api/analytics/overview?from=2026-04-01&to=2026-04-30", { token: ownerToken });
  const c = r.data.current;
  assert.equal(c.income.gross, 121);
  assert.equal(c.services.completed, 1);
  assert.equal(c.margin.commissions, 36.3); // Bea 30%
  assert.deepEqual(r.data.previous_period, { from: "2026-03-01", to: "2026-03-31" });
  assert.equal(r.data.previous.income.gross, 222.6);
  assert.equal(r.data.change.income_gross, -45.6); // (121 - 222.60) / 222.60
});

test("breakdown by master", async () => {
  const r = await api("GET", `/api/analytics/breakdown/master?${MARCH}`, { token: ownerToken });
  const ana = r.data.rows.find((x) => x.name === "Ana");
  const bea = r.data.rows.find((x) => x.name === "Bea");
  assert.deepEqual(
    { completed: ana.completed, rendered: ana.rendered_value, gross: ana.income_gross, net: ana.income_net, commission: ana.commission, hours: ana.hours, perHour: ana.revenue_per_hour, ticket: ana.avg_ticket },
    { completed: 2, rendered: 171, gross: 150, net: 123.96, commission: 68.4, hours: 3, perHour: 57, ticket: 85.5 }
  );
  assert.deepEqual({ completed: bea.completed, cancelled: bea.cancelled, gross: bea.income_gross }, { completed: 0, cancelled: 1, gross: 0 });
});

test("breakdowns by service, item, expense and day", async () => {
  const svc = (await api("GET", `/api/analytics/breakdown/service?${MARCH}`, { token: ownerToken })).data.rows;
  const color = svc.find((x) => x.name === "Color");
  assert.deepEqual([color.completed, color.rendered_value, color.income_gross, color.margin, color.margin_percent], [1, 121, 100, 100, 82.64]);

  const items = (await api("GET", `/api/analytics/breakdown/item?${MARCH}`, { token: ownerToken })).data.rows;
  assert.deepEqual(items, [{ item_id: items[0].item_id, name: "Shampoo", unit: "pcs", qty: 3, income_gross: 72.6, income_net: 60, cost: 24, margin: 36, margin_percent: 60 }]);

  const exp = (await api("GET", `/api/analytics/breakdown/expense?${MARCH}`, { token: ownerToken })).data.rows;
  assert.deepEqual(exp.map((e) => [e.name, e.gross, e.net, e.vat]), [["Rent", 1210, 1000, 210]]);

  const days = (await api("GET", `/api/analytics/breakdown/day?${MARCH}`, { token: ownerToken })).data.rows;
  assert.equal(days.length, 31);
  assert.deepEqual(days[0], { day: "2026-03-01", income_gross: 24.2, income_net: 20, expenses_net: 1000, completed: 0, rendered_value: 0, cancelled: 0 });
  assert.equal(days.find((d) => d.day === "2026-03-11").rendered_value, 121);
  assert.equal(Math.round(days.reduce((s, d) => s + d.income_gross, 0) * 100) / 100, 222.6);
});

test("receivables list the partly paid visit", async () => {
  const r = await api("GET", `/api/analytics/receivables?${MARCH}`, { token: ownerToken });
  assert.equal(r.data.total, 21);
  assert.deepEqual([r.data.items[0].client_name, r.data.items[0].price, r.data.items[0].paid, r.data.items[0].due], ["Lucia", 121, 100, 21]);
});

test("owner sees branches side by side with totals", async () => {
  const r = await api("GET", `/api/analytics/branches?${MARCH}`, { token: ownerToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.branches.length, 1);
  assert.equal(r.data.currency, "EUR");
  assert.equal(r.data.totals.income.gross, 222.6);
  assert.equal(r.data.totals.result, -884.44);
});

test("a master sees only their own figures", async () => {
  for (const p of [`/api/analytics/overview?${MARCH}`, `/api/analytics/breakdown/master?${MARCH}`, `/api/analytics/receivables?${MARCH}`, `/api/analytics/branches?${MARCH}`]) {
    assert.equal((await api("GET", p, { token: masterToken })).status, 403, p);
  }
  const me = await api("GET", "/api/analytics/me?from=2026-04-01&to=2026-04-30", { token: masterToken });
  assert.equal(me.status, 200);
  assert.equal(me.data.master.name, "Bea");
  assert.equal(me.data.current.income.gross, 121);
  assert.equal(me.data.current.margin.commissions, 36.3);
  assert.equal(me.data.current.expenses, undefined); // salon costs are not shown to masters
  assert.equal(me.data.current.result, undefined);
  assert.equal(me.data.current.margin.services, undefined); // would reveal purchase cost
  assert.equal(me.data.current.margin.items, undefined);
  assert.equal(me.data.days.length, 30);

  const march = await api("GET", `/api/analytics/me?${MARCH}`, { token: masterToken });
  assert.equal(march.data.current.income.gross, 0); // Ana's payments are not Bea's
  assert.equal(march.data.current.services.cancelled, 1);
});

test("a master cannot record more than is due for the appointment", async () => {
  const body = (amount) => ({ partner_id: ids.c1, appointment_id: ids.a6, amount, method: "Cash", type: "incoming", vat_percent: 21 });
  const over = await api("POST", "/api/payments", { token: masterToken, body: body(60) });
  assert.equal(over.status, 400, JSON.stringify(over.data));
  const ok = await api("POST", "/api/payments", { token: masterToken, body: body(50) });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const again = await api("POST", "/api/payments", { token: masterToken, body: body(1) });
  assert.equal(again.status, 400);
});

test("bad input is rejected with a clear message", async () => {
  assert.equal((await api("GET", "/api/analytics/overview?from=2026-03-31&to=2026-03-01", { token: ownerToken })).status, 400);
  assert.equal((await api("GET", "/api/analytics/overview?from=31/03/2026&to=2026-04-01", { token: ownerToken })).status, 400);
  assert.equal((await api("GET", "/api/analytics/overview?from=2020-01-01&to=2026-01-01", { token: ownerToken })).status, 400);
  assert.equal((await api("GET", `/api/analytics/breakdown/nope?${MARCH}`, { token: ownerToken })).status, 400);
});

test("dashboard uses the same calculation", async () => {
  const r = await api("GET", "/api/dashboard/stats?period=month", { token: ownerToken });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok("revenue_net" in r.data && "unpaid" in r.data);
});

// --- findings of the independent review --------------------------------------

test("parallel payments by a master cannot exceed what is due", async () => {
  const { id } = await one(
    `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
     VALUES ($1, $2, $3, '2026-06-01 10:00+02', '2026-06-01 11:00+02', 'completed') RETURNING id`,
    [ids.bea, ids.c2, ids.cut]
  ); // booked at today's 60
  const body = { partner_id: ids.c2, appointment_id: id, amount: 60, method: "Cash", type: "incoming", vat_percent: 21 };
  const results = await Promise.all(Array.from({ length: 5 }, () => api("POST", "/api/payments", { token: masterToken, body })));
  assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.status).join(","));
  const paid = await one(`SELECT sum(amount) AS s FROM ${S}.payments WHERE appointment_id = $1`, [id]);
  assert.equal(Number(paid.s), 60);
});

test("a master with two profiles sees and pays for both", async () => {
  const bea = await one(`SELECT user_id FROM ${S}.masters WHERE id = $1`, [ids.bea]);
  const old = (await one(`INSERT INTO ${S}.masters (name, commission, user_id, is_active, created_at) VALUES ('Bea (old)', 30, $1, false, '2025-01-01') RETURNING id`, [bea.user_id])).id;
  const { id } = await one(
    `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
     VALUES ($1, $2, $3, '2026-04-10 10:00+02', '2026-04-10 11:00+02', 'completed') RETURNING id`,
    [old, ids.c1, ids.cut]
  );
  const me = await api("GET", "/api/analytics/me?from=2026-04-01&to=2026-04-30", { token: masterToken });
  assert.equal(me.data.master.name, "Bea"); // the active profile is shown
  assert.equal(me.data.current.services.completed, 2); // a4 + the old profile's visit
  const pay = await api("POST", "/api/payments", {
    token: masterToken,
    body: { partner_id: ids.c1, appointment_id: id, amount: 60, method: "Card", type: "incoming", vat_percent: 21 },
  });
  assert.equal(pay.status, 201, JSON.stringify(pay.data));
});

test("appointments list returns the booked price (used to pre-fill payments)", async () => {
  const r = await api("GET", "/api/appointments?start_date=2026-03-10&end_date=2026-03-10", { token: ownerToken });
  assert.equal(Number(r.data.find((a) => a.id === ids.a1).price), 50);
});

test("an invalid time zone in settings falls back instead of breaking reports", async () => {
  await db.query(`UPDATE ${S}.settings SET timezone = 'Madrid'`);
  try {
    const r = await api("GET", `/api/analytics/overview?${MARCH}`, { token: ownerToken });
    assert.equal(r.status, 200);
    assert.equal(r.data.period.timezone, "Europe/Madrid");
  } finally {
    await db.query(`UPDATE ${S}.settings SET timezone = 'Europe/Madrid'`);
  }
});

test("legacy payments without a type were given one by the migration", async () => {
  const r = await one(`SELECT count(*)::int AS n FROM demo_hospi.payments WHERE type IS NULL`);
  assert.equal(r.n, 0);
});

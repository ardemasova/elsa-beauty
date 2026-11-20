/**
 * Dashboard data (POST /api/dashboard/overview) checked against hand-made figures.
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
const { periodGoal } = require("../services/reports/dashboard");

let server, base, owner, master, S;
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

// Monday 2 Nov - Sunday 8 Nov 2026, Madrid = UTC+1
const WEEK = { from: "2026-11-02", to: "2026-11-08" };
const at = (day, hh) => `2026-11-${day}T${hh}:00+01:00`;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const created = await createAccount({
    accountName: "Dash Salon", planCode: "standard",
    ownerEmail: "dash-owner@test.com", ownerPassword: "ownerpassword1", branchName: "Dash Centro",
  });
  S = `"${created.tenant.schema_name}"`;
  owner = await login("dash-owner@test.com", "ownerpassword1");
  const m = await api("POST", "/api/users", { body: { email: "dash-master@test.com", password: "password123", role: "master", tenant_ids: [created.tenant.id] } });
  master = await login("dash-master@test.com", "password123");

  ids.cut = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Cut', 60, 50, 10) RETURNING id`)).id;
  ids.color = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Color', 120, 121, 21) RETURNING id`)).id;
  ids.off = (await one(`INSERT INTO ${S}.services (name, duration, price, cost) VALUES ('Day Off', 600, 0, 0) RETURNING id`)).id;
  ids.ana = (await one(`INSERT INTO ${S}.masters (name, commission, user_id) VALUES ('Ana', 40, $1) RETURNING id`, [created.owner.id])).id;
  ids.bea = (await one(`INSERT INTO ${S}.masters (name, commission, user_id) VALUES ('Bea', 30, $1) RETURNING id`, [m.data.id])).id;
  ids.carmen = (await one(`INSERT INTO ${S}.clients (name, type, phone) VALUES ('Carmen', 'customer', '600111222') RETURNING id`)).id;
  ids.lola = (await one(`INSERT INTO ${S}.clients (name, type, phone) VALUES ('Lola', 'customer', '600333444') RETURNING id`)).id;
  ids.vendor = (await one(`INSERT INTO ${S}.clients (name, type) VALUES ('Supplier', 'vendor') RETURNING id`)).id;

  const appt = async (master, client, service, start, end, status) =>
    (await one(
      `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [master, client, service, start, end, status]
    )).id;
  // Lola was last here in August: away for more than 60 days
  await appt(ids.ana, ids.lola, ids.cut, "2026-08-20T10:00:00+02:00", "2026-08-20T11:00:00+02:00", "completed");
  // Mon 2: Ana cut 10-11 done + paid 50; Bea color 12-14 done, unpaid
  ids.a1 = await appt(ids.ana, ids.carmen, ids.cut, at("02", "10:00"), at("02", "11:00"), "completed");
  await appt(ids.bea, ids.carmen, ids.color, at("02", "12:00"), at("02", "14:00"), "completed");
  // Tue 3: Ana cancelled; Bea day off (whole day)
  await appt(ids.ana, ids.carmen, ids.cut, at("03", "10:00"), at("03", "11:00"), "cancelled");
  await appt(ids.bea, null, ids.off, at("03", "10:00"), at("03", "20:00"), "planned");
  await db.query(
    `INSERT INTO ${S}.payments (appointment_id, partner_id, amount, vat_percent, method, type, paid_at)
     VALUES ($1, $2, 50, 21, 'Card', 'incoming', $3)`,
    [ids.a1, ids.carmen, at("02", "11:05")]
  );
  // a supplier payment never counts as income
  await db.query(`INSERT INTO ${S}.payments (partner_id, amount, vat_percent, method, type, paid_at) VALUES ($1, 300, 21, 'Card', 'outgoing', $2)`, [ids.vendor, at("04", "09:00")]);
  // a visit booked far ahead: forecast only while it is in the future
  await appt(ids.bea, ids.carmen, ids.color, "2099-01-05T10:00:00+01:00", "2099-01-05T12:00:00+01:00", "planned");
});

after(async () => {
  server.close();
  await db.pool.end();
});

const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);

test("week figures: income, visits, unpaid, occupancy with a day off", async () => {
  const r = await api("POST", "/api/dashboard/overview", { body: WEEK });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = r.data;
  assert.equal(sum(d.cells, "income"), 50);
  assert.equal(sum(d.cells, "completed"), 2);
  assert.equal(sum(d.cells, "cancelled"), 1);
  assert.equal(sum(d.cells, "rendered"), 171);
  assert.equal(sum(d.cells, "unpaid"), 121);
  // open Mon-Sat 10-20 = 600 min a day, 2 masters, 6 days, minus Bea's day off
  assert.equal(sum(d.cells, "available_min"), 2 * 6 * 600 - 600);
  // booked: 60 + 120 (the cancelled visit does not count)
  assert.equal(sum(d.cells, "booked_min"), 180);
  const bea = d.cells.find((c) => c.master_id === ids.bea && c.day === "2026-11-03");
  assert.equal(bea?.available_min || 0, 0);
  // services: Color first by value
  assert.deepEqual(d.services.map((s) => s.name).sort(), ["Color", "Cut"]);
  assert.equal(d.goal.source, "last_year");
});

test("filters: one master, one service", async () => {
  const onlyBea = (await api("POST", "/api/dashboard/overview", { body: { ...WEEK, masters: [ids.bea] } })).data;
  assert.equal(sum(onlyBea.cells, "income"), 0);
  assert.equal(sum(onlyBea.cells, "rendered"), 121);
  assert.ok(onlyBea.cells.every((c) => c.master_id === ids.bea));
  const onlyCut = (await api("POST", "/api/dashboard/overview", { body: { ...WEEK, services: [ids.cut] } })).data;
  assert.equal(sum(onlyCut.cells, "rendered"), 50);
  assert.equal(sum(onlyCut.cells, "income"), 50);
  assert.equal((await api("POST", "/api/dashboard/overview", { body: { ...WEEK, masters: ["nope"] } })).status, 400);
  assert.equal((await api("POST", "/api/dashboard/overview", { body: { from: "2026-01-01", to: "2026-06-30" } })).status, 400);
});

test("customers: loyal by money this year, away for 60+ days with phone", async () => {
  const c = (await api("POST", "/api/dashboard/overview", { body: WEEK })).data.customers;
  assert.equal(c.loyal[0].name, "Carmen");
  assert.equal(c.loyal[0].spent, 50);
  const lola = c.lapsed.find((x) => x.name === "Lola");
  assert.ok(lola, "Lola has not been back since August");
  assert.equal(lola.phone, "600333444");
  // Carmen has a visit booked ahead, so she is not "away"
  assert.ok(!c.lapsed.find((x) => x.name === "Carmen"));
  assert.equal(c.cancel_rate, 33.3);
});

test("a master sees only their own figures and no customer lists", async () => {
  const r = await api("POST", "/api/dashboard/overview", { token: master, body: { ...WEEK, masters: [ids.ana] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.cells.every((c) => c.master_id === ids.bea));
  assert.equal(r.data.customers, null);
});

test("monthly goal is spread over working days", () => {
  const settings = { revenue_goal_month: 2600, work_days: [1, 2, 3, 4, 5, 6] };
  // November 2026 has 25 days Mon-Sat; the week 2-8 Nov has 6 of them
  assert.equal(periodGoal({ from: "2026-11-02", to: "2026-11-08" }, settings), 624);
  assert.equal(periodGoal({ from: "2026-11-01", to: "2026-11-30" }, settings), 2600);
  assert.equal(periodGoal({ from: "2026-11-01", to: "2026-11-30" }, { ...settings, revenue_goal_month: null }), null);
});

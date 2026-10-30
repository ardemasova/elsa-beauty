/**
 * Security regression tests: branch isolation and role permissions.
 *
 * Needs a DISPOSABLE database prepared by test/prepare-db.sh (never point this
 * at production - the tests create and change data).
 *
 *   ./test/prepare-db.sh && npm test
 */
process.env.MAIL_TRANSPORT = "json";
process.env.NODE_ENV = "test";
require("dotenv").config({ path: process.env.TEST_ENV_FILE || ".env.test" });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../index");
const db = require("../db");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { createAccount } = require("../services/provisioning");

let server;
let base;

const SALON = "11111111-1111-1111-1111-111111111111";
const HOSPI = "22222222-2222-2222-2222-222222222222";
const HOSPI_ADMIN = "aaaaaaaa-0000-0000-0000-000000000004";

async function api(method, path, { token, body, headers = {}, raw } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(raw ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function login(email, password = "password123") {
  const r = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
  return r.data;
}

let adminToken, masterToken, hospiToken;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await login("admin@demo.com")).token;
  masterToken = (await login("master@demo.com")).token;
  hospiToken = (await login("hospi@demo.com")).token;
});

after(async () => {
  server.close();
  await db.pool.end();
});

// --- Authentication ---------------------------------------------------------

test("login needs no branch and opens only the user's own branch", async () => {
  const s = await login("admin@demo.com");
  assert.deepEqual(s.tenants.map((t) => t.id), [SALON]);
  assert.equal(s.currentTenant.id, SALON);
  assert.equal(s.user.role, "admin");
});

test("wrong password and unknown email give the same answer", async () => {
  const a = await api("POST", "/api/auth/login", { body: { email: "admin@demo.com", password: "nope" } });
  const b = await api("POST", "/api/auth/login", { body: { email: "nobody@x.com", password: "nope" } });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.data.message, b.data.message);
});

test("public branch list is gone", async () => {
  const r = await api("GET", "/api/tenants/public");
  assert.notEqual(r.status, 200);
});

test("tokens in the old format (and forged tokens) are rejected", async () => {
  const old = jwt.sign({ userId: "x", tenantId: SALON, role: "admin" }, process.env.ACCESS_TOKEN_SECRET);
  assert.equal((await api("GET", "/api/clients", { token: old })).status, 401);
  const forged = jwt.sign({ sub: HOSPI_ADMIN, tid: SALON }, "wrong-secret");
  assert.equal((await api("GET", "/api/clients", { token: forged })).status, 401);
});

test("a valid token cannot be pointed at another salon's branch", async () => {
  const t = jwt.sign({ sub: HOSPI_ADMIN, tid: SALON, tv: 0, auth_time: Math.floor(Date.now() / 1000) }, process.env.ACCESS_TOKEN_SECRET);
  assert.equal((await api("GET", "/api/clients", { token: t })).status, 403);
  const sw = await api("POST", "/api/auth/switch-tenant", { token: hospiToken, body: { tenant_id: SALON } });
  assert.equal(sw.status, 403);
});

test("debug endpoints are removed", async () => {
  assert.equal((await api("GET", "/__debug/routes")).status, 404);
  assert.equal((await api("GET", "/__debug/file?p=x")).status, 404);
});

// --- Cross-salon user management -------------------------------------------

test("admin sees only users of their own branch", async () => {
  const r = await api("GET", "/api/users", { token: adminToken });
  assert.equal(r.status, 200);
  assert.ok(r.data.length > 0);
  assert.ok(r.data.every((u) => u.tenant_ids.includes(SALON)));
  assert.ok(!r.data.some((u) => u.id === HOSPI_ADMIN));
});

test("admin cannot read, edit or delete another salon's user", async () => {
  assert.equal((await api("GET", `/api/users/${HOSPI_ADMIN}`, { token: adminToken })).status, 404);
  const put = await api("PUT", `/api/users/${HOSPI_ADMIN}`, {
    token: adminToken,
    body: { email: "hacked@x.com", role: "admin", password: "hackedpass1" },
  });
  assert.equal(put.status, 404);
  assert.equal((await api("DELETE", `/api/users/${HOSPI_ADMIN}`, { token: adminToken })).status, 404);
  const still = await api("POST", "/api/auth/login", { body: { email: "hospi@demo.com", password: "password123" } });
  assert.equal(still.status, 200);
});

test("admin cannot create users in another salon's branch or create admins", async () => {
  const other = await api("POST", "/api/users", {
    token: adminToken,
    body: { email: "x1@x.com", password: "password123", role: "master", tenant_id: HOSPI },
  });
  // admins always create in their current branch; the foreign id is ignored
  assert.equal(other.status, 201);
  assert.deepEqual(other.data.tenant_ids, [SALON]);

  const adm = await api("POST", "/api/users", {
    token: adminToken,
    body: { email: "x2@x.com", password: "password123", role: "admin" },
  });
  assert.equal(adm.status, 403);
});

test("master cannot manage users", async () => {
  assert.equal((await api("GET", "/api/users", { token: masterToken })).status, 403);
});

// --- Branches -----------------------------------------------------------------

test("only an owner may open, change or remove branches", async () => {
  assert.equal((await api("POST", "/api/tenants", { token: adminToken, body: { name: "X" } })).status, 403);
  assert.equal((await api("PUT", `/api/tenants/${HOSPI}`, { token: adminToken, body: { name: "X" } })).status, 403);
  assert.equal((await api("DELETE", `/api/tenants/${HOSPI}`, { token: adminToken })).status, 403);
  const list = await api("GET", "/api/tenants", { token: adminToken });
  assert.deepEqual(list.data.map((t) => t.id), [SALON]);
  assert.ok(!("schema_name" in list.data[0]));
});

test("owner: branch limit, switching, and no access to other accounts", async () => {
  const { tenant: first } = await createAccount({
    accountName: "Test Salon", planCode: "standard", ownerEmail: "owner-std@test.com",
    ownerPassword: "ownerpassword1", branchName: "Centro",
  });
  const s = await login("owner-std@test.com", "ownerpassword1");
  assert.equal(s.user.isOwner, true);
  assert.equal(s.currentTenant.id, first.id);

  // standard plan = 1 branch
  const over = await api("POST", "/api/tenants", { token: s.token, body: { name: "Second" } });
  assert.equal(over.status, 403);

  // new branch is usable right away (plan features, VAT 21% default)
  const vat = await api("GET", "/api/vat", { token: s.token });
  assert.equal(vat.status, 200);
  assert.equal(Number(vat.data.find((v) => v.is_default === "Y").percent), 21);

  // pro plan = 3 branches
  await createAccount({
    accountName: "Pro Salon", planCode: "pro", ownerEmail: "owner-pro@test.com",
    ownerPassword: "ownerpassword1", branchName: "Uno",
  });
  const p = await login("owner-pro@test.com", "ownerpassword1");
  const second = await api("POST", "/api/tenants", { token: p.token, body: { name: "Dos" } });
  assert.equal(second.status, 201);
  const sw = await api("POST", "/api/auth/switch-tenant", { token: p.token, body: { tenant_id: second.data.id } });
  assert.equal(sw.status, 200);
  assert.equal(sw.data.currentTenant.id, second.data.id);
  assert.equal(sw.data.tenants.length, 2);

  // the pro owner cannot enter the standard owner's branch
  const cross = await api("POST", "/api/auth/switch-tenant", { token: p.token, body: { tenant_id: first.id } });
  assert.equal(cross.status, 403);
  // nor the demo salon
  const cross2 = await api("POST", "/api/auth/switch-tenant", { token: p.token, body: { tenant_id: SALON } });
  assert.equal(cross2.status, 403);
});

test("deactivated users are locked out immediately", async () => {
  const c = await api("POST", "/api/users", {
    token: adminToken,
    body: { email: "temp-master@x.com", password: "password123", role: "master" },
  });
  const t = (await login("temp-master@x.com")).token;
  assert.equal((await api("GET", "/api/auth/me", { token: t })).status, 200);
  await api("PUT", `/api/users/${c.data.id}`, { token: adminToken, body: { is_active: false } });
  assert.equal((await api("GET", "/api/auth/me", { token: t })).status, 401);
});

// --- Master permissions -------------------------------------------------------

test("master cannot see salon reports, only own performance", async () => {
  for (const path of ["/api/reports/revenue-by-day?from=2026-01-01&to=2026-12-31", "/api/reports/summary?from=2026-01-01&to=2026-12-31", "/api/dashboard/stats"]) {
    assert.equal((await api("GET", path, { token: masterToken })).status, 403, path);
  }
  const mp = await api("GET", "/api/reports/master-performance", { token: masterToken });
  assert.equal(mp.status, 200);
  assert.equal(mp.data.length, 1);
  assert.equal(mp.data[0].master_name, "Master One");
});

test("fixed report: cancelled appointments are no longer counted as revenue", async () => {
  const mp = await api("GET", "/api/reports/master-performance", { token: adminToken });
  const adminAsMaster = mp.data.find((m) => m.master_name === "Admin As Master");
  assert.equal(Number(adminAsMaster.revenue_generated), 0); // only a cancelled appointment
  assert.equal(Number(adminAsMaster.appointments_cancelled), 1);
});

test("master cannot change company settings or VAT", async () => {
  assert.equal((await api("PUT", "/api/settings/company", { token: masterToken, body: { name: "Hacked" } })).status, 403);
  assert.equal((await api("POST", "/api/vat", { token: masterToken, body: { percent: 5 } })).status, 403);
});

test("master sees customers without vendor/bank data", async () => {
  const r = await api("GET", "/api/clients", { token: masterToken });
  assert.equal(r.status, 200);
  assert.ok(r.data.every((c) => c.type === "customer"));
  assert.ok(r.data.every((c) => !("bank_account" in c)));
});

test("master sees colleagues' appointments only as busy time", async () => {
  const r = await api("GET", "/api/appointments", { token: masterToken });
  const foreign = r.data.filter((a) => a.master_name !== "Master One");
  assert.ok(foreign.length > 0);
  assert.ok(foreign.every((a) => a.client_name === null));
});

test("master cannot record expense payments or delete payments", async () => {
  const r = await api("POST", "/api/payments", {
    token: masterToken,
    body: { partner_id: "c0000000-0000-0000-0000-000000000002", expense_id: 1, amount: 99, method: "Cash", type: "outgoing" },
  });
  assert.equal(r.status, 403);
  const list = await api("GET", "/api/payments", { token: adminToken });
  const del = await api("DELETE", `/api/payments/${list.data[0].id}`, { token: masterToken });
  assert.equal(del.status, 403);
});

// --- Expenses & uploads -------------------------------------------------------

test("expenses need login and are per branch", async () => {
  assert.equal((await api("GET", "/api/expenses")).status, 401);
  const salon = await api("GET", "/api/expenses", { token: adminToken });
  assert.deepEqual(salon.data.map((e) => e.name), ["Rent"]);
  const hospi = await api("GET", "/api/expenses", { token: hospiToken });
  assert.deepEqual(hospi.data, []);
  assert.equal((await api("POST", "/api/expenses", { token: masterToken, body: { name: "X" } })).status, 403);
});

test("uploads need login, accept only real images, and stay within the branch", async () => {
  const masterId = "ae000000-0000-0000-0000-000000000001";
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d10000000049454e44ae426082", "hex");

  const form = (buf, name) => {
    const f = new FormData();
    f.append("photo", new Blob([buf]), name);
    return f;
  };
  const up = (token, id, buf, name) =>
    fetch(`${base}/api/uploads/masters/${id}/photo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form(buf, name),
    });

  assert.equal((await up(null, masterId, png, "a.png")).status, 401);
  assert.equal((await up(adminToken, masterId, Buffer.from("<html><script>alert(1)</script>"), "x.png")).status, 400);
  // hospi admin cannot touch salon's master (record is not in their branch)
  assert.equal((await up(hospiToken, masterId, png, "a.png")).status, 404);

  const ok = await up(adminToken, masterId, png, "evil.html");
  assert.equal(ok.status, 200);
  const { photo_url } = await ok.json();
  assert.match(photo_url, /^\/uploads\/salon_demo\/masters\/[0-9a-f-]+\.png$/);
  const img = await fetch(`${base}${photo_url}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("x-content-type-options"), "nosniff");
});

// --- Demo sign-up ---------------------------------------------------------------

test("demo sign-up is refused until a frozen template exists, never clones a live branch", async () => {
  const r = await api("POST", "/api/demo-register", { body: { email: "early@test.com", name: "Early" } });
  assert.equal(r.status, 503);
});

test("demo sign-up creates a separate account from the frozen template", async () => {
  execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "demo-template.js"), "snapshot", "--from", "salon_demo"], {
    env: process.env,
    stdio: "pipe",
  });

  // Data planted in the live demo branch AFTER the snapshot must not reach new demos.
  await api("POST", "/api/clients", { token: adminToken, body: { name: "Planted by a prospect", phone: "1", type: "customer" } });

  const r = await api("POST", "/api/demo-register", { body: { email: "prospect@test.com", name: "Prospect" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));

  const { rows } = await db.query(
    `SELECT u.id AS user_id, a.is_demo, t.schema_name, u.role FROM public.users u
       JOIN public.accounts a ON a.id = u.account_id
       JOIN public.tenants t ON t.account_id = a.id
      WHERE u.email = 'prospect@test.com'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_demo, true);
  assert.equal(rows[0].role, "owner");
  const s = rows[0].schema_name;

  assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${s}".appointments`)).rows[0].n, 2);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${s}".clients WHERE name = 'Planted by a prospect'`)).rows[0].n, 0);
  // copied masters point to the new owner, not to users of another account
  const foreign = await db.query(`SELECT count(*)::int AS n FROM "${s}".masters WHERE user_id <> $1`, [rows[0].user_id]);
  assert.equal(foreign.rows[0].n, 0);

  const dup = await api("POST", "/api/demo-register", { body: { email: "prospect@test.com", name: "Prospect" } });
  assert.equal(dup.status, 409);
});

// --- Findings of the independent review -----------------------------------------

test("legacy data: case-duplicate emails and orphaned payments did not block the migration", async () => {
  const { rows } = await db.query(`SELECT email, is_active FROM public.users WHERE email LIKE 'case%' ORDER BY email`);
  assert.deepEqual(rows.map((r) => r.email), ["case+dup2@demo.com", "case@demo.com"]);
  const done = await db.query(`SELECT count(*)::int AS n FROM demo_hospi.schema_migrations`);
  assert.equal(done.rows[0].n, 2);
});

test("admin cannot take over a master who also works in another branch", async () => {
  const shared = "aaaaaaaa-0000-0000-0000-000000000007";
  await db.query(`INSERT INTO public.user_tenants (user_id, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [shared, HOSPI]);
  // (test fixture: give the shared master the hospi account so both branches are "theirs")
  await db.query(`UPDATE public.tenants SET account_id = (SELECT account_id FROM public.tenants WHERE id = $1) WHERE id = $2`, [SALON, HOSPI]);
  try {
    const put = await api("PUT", `/api/users/${shared}`, { token: adminToken, body: { password: "takeover123" } });
    assert.equal(put.status, 403);
    const del = await api("DELETE", `/api/users/${shared}`, { token: adminToken });
    assert.equal(del.status, 200);
    assert.match(del.data.message, /removed from this branch/);
    const still = await db.query(`SELECT tenant_id FROM public.user_tenants WHERE user_id = $1`, [shared]);
    assert.deepEqual(still.rows.map((r) => r.tenant_id), [HOSPI]);
  } finally {
    await db.query(`UPDATE public.tenants SET account_id = (SELECT account_id FROM public.users WHERE id = $1) WHERE id = $2`, [HOSPI_ADMIN, HOSPI]);
  }
});

test("masters can only record the client's incoming payment and cannot edit payments", async () => {
  const appt = "a0000000-0000-0000-0000-000000000001"; // Master One's appointment, client A
  const vendorPay = await api("POST", "/api/payments", {
    token: masterToken,
    body: { partner_id: "c0000000-0000-0000-0000-000000000002", appointment_id: appt, amount: 999, method: "Cash", type: "outgoing" },
  });
  assert.equal(vendorPay.status, 403);
  const list = await api("GET", "/api/payments", { token: masterToken });
  const own = list.data.find((p) => p.appointment_id === appt);
  const edit = await api("PUT", `/api/payments/${own.id}`, {
    token: masterToken,
    body: { partner_id: own.partner_id, appointment_id: appt, amount: 0.01, method: "Cash", type: "incoming" },
  });
  assert.equal(edit.status, 403);
});

test("admin edit of a payment must keep partner type and direction consistent", async () => {
  const list = await api("GET", "/api/payments", { token: adminToken });
  const own = list.data.find((p) => p.appointment_id === "a0000000-0000-0000-0000-000000000001");
  const r = await api("PUT", `/api/payments/${own.id}`, {
    token: adminToken,
    body: { partner_id: "c0000000-0000-0000-0000-000000000002", appointment_id: own.appointment_id, amount: 40, method: "Card", type: "incoming" },
  });
  assert.equal(r.status, 400);
});

test("password change logs out other sessions; own password cannot be changed via the users API", async () => {
  await api("POST", "/api/users", { token: adminToken, body: { email: "pw@x.com", password: "password123", role: "master" } });
  const a = (await login("pw@x.com")).token;
  const b = (await login("pw@x.com")).token;
  const ch = await api("POST", "/api/auth/change-password", { token: a, body: { current_password: "password123", new_password: "newpassword123" } });
  assert.equal(ch.status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: b })).status, 401);
  assert.equal((await api("GET", "/api/auth/me", { token: ch.data.token })).status, 200);

  const me = await api("GET", "/api/auth/me", { token: adminToken });
  const self = await api("PUT", `/api/users/${me.data.user.id}`, { token: adminToken, body: { password: "sneaky12345" } });
  assert.equal(self.status, 400);
});

test("sessions cannot be refreshed forever", async () => {
  const s = await login("hospi@demo.com");
  const p = jwt.decode(s.token);
  const { exp, iat, ...claims } = p; // eslint-disable-line no-unused-vars
  const old = jwt.sign({ ...claims, auth_time: p.auth_time - 31 * 24 * 3600 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
  assert.equal((await api("POST", "/api/auth/refresh", { token: old })).status, 401);
});

test("a user whose branch was closed can still reach account routes and move on", async () => {
  const { tenant } = await createAccount({
    accountName: "Closing Salon", planCode: "pro", ownerEmail: "owner-close@test.com",
    ownerPassword: "ownerpassword1", branchName: "A",
  });
  const s = await login("owner-close@test.com", "ownerpassword1");
  const second = await api("POST", "/api/tenants", { token: s.token, body: { name: "B" } });
  const onB = (await api("POST", "/api/auth/switch-tenant", { token: s.token, body: { tenant_id: second.data.id } })).data.token;
  // close B behind the session's back
  await db.query(`UPDATE public.tenants SET is_active = false WHERE id = $1`, [second.data.id]);
  assert.equal((await api("GET", "/api/clients", { token: onB })).status, 403);
  const me = await api("GET", "/api/auth/me", { token: onB });
  assert.equal(me.status, 200);
  assert.equal(me.data.currentTenant, null);
  const sw = await api("POST", "/api/auth/switch-tenant", { token: onB, body: { tenant_id: tenant.id } });
  assert.equal(sw.status, 200);
});

test("masters do not see purchase cost or other masters' client phones", async () => {
  const services = await api("GET", "/api/services", { token: masterToken });
  assert.ok(services.data.length && services.data.every((x) => !("cost" in x)));
  const adminServices = await api("GET", "/api/services", { token: adminToken });
  assert.ok(adminServices.data.every((x) => "cost" in x));
});

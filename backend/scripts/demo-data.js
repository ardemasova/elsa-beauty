#!/usr/bin/env node
/**
 * Fills a DEMO branch with realistic activity, so reports and the calendar
 * look alive.
 *
 *   npm run demo-data -- --schema salon_demo                 # Jan 1 .. Dec 31 of this year
 *   npm run demo-data -- --schema salon_demo --from 2026-01-01 --until 2026-12-31
 *
 * What it does (Europe/Madrid time):
 *  - Appointments Mon-Sat 10:00-19:00 for every active master on days where
 *    the master has no appointments yet. Past ones are completed (about 7%
 *    cancelled), future ones planned.
 *  - Every past appointment is settled: past "planned" ones become completed,
 *    and anything not fully paid gets a payment on the visit day.
 *  - A few product sales on past days and monthly expenses (rent, utilities,
 *    supplies) for months that have started.
 *  - Invoice numbers of the branch are re-issued in date order.
 *
 * Safe to run again: days already filled are skipped. Refuses to touch a
 * branch that is not a demo unless --force is given.
 */
const { pool } = require("../db");
const { quoteIdent, isValidSchemaName } = require("../utils/sql");
const { renumberDocuments } = require("../services/provisioning");

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const MARK = "demo-data";
const TZ = "Europe/Madrid";

// Small seeded random generator: the same run always produces the same data.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random numbers that depend only on `key` (same day + master -> same schedule). */
function keyed(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return rng(h);
}

const FIRST = ["Lucía", "Carmen", "Marta", "Elena", "Paula", "Sara", "Laura", "Ana", "Irene", "Nuria", "Cristina", "Raquel",
  "Alba", "Noelia", "Patricia", "Beatriz", "Rocío", "Silvia", "Andrea", "Julia", "Clara", "Inés", "Teresa", "Pilar"];
const LAST = ["García", "Martínez", "López", "Sánchez", "Pérez", "Gómez", "Fernández", "Ruiz", "Díaz", "Moreno", "Muñoz",
  "Álvarez", "Romero", "Navarro", "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Serrano"];

(async () => {
  const schemaName = arg("schema");
  if (!schemaName || !isValidSchemaName(schemaName)) {
    console.error("Usage: npm run demo-data -- --schema salon_demo [--from YYYY-MM-DD] [--until YYYY-MM-DD] [--force]");
    process.exit(1);
  }
  const S = quoteIdent(schemaName);
  const year = new Date().getFullYear();
  const from = arg("from") || `${year}-01-01`;
  const until = arg("until") || `${year}-12-31`;

  const info = await pool.query(
    `SELECT t.name, a.is_demo FROM public.tenants t JOIN public.accounts a ON a.id = t.account_id WHERE t.schema_name = $1`,
    [schemaName]
  );
  const looksDemo = info.rows[0]?.is_demo || /demo/i.test(schemaName);
  if (!info.rows.length && !/demo/i.test(schemaName)) throw new Error(`No branch with schema "${schemaName}"`);
  if (!looksDemo && !process.argv.includes("--force")) {
    throw new Error(`"${schemaName}" is not a demo branch. Use --force only if you are sure.`);
  }

  const client = await pool.connect();
  const rand = rng(20261231);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const stats = { appointments: 0, settled: 0, payments: 0, sales: 0, expenses: 0, clients: 0 };

  try {
    await client.query("BEGIN");
    // Old rows may break rules added later; lift them for this run.
    await client.query(`ALTER TABLE ${S}.payments DROP CONSTRAINT IF EXISTS payments_method_check`);
    await client.query(`ALTER TABLE ${S}.appointments DROP CONSTRAINT IF EXISTS appointments_time_order_check`);

    const vat = await client.query(`SELECT percent FROM ${S}.vat ORDER BY (is_default = 'Y') DESC, percent DESC LIMIT 1`);
    const vatRate = vat.rows[0] ? Number(vat.rows[0].percent) : 21;

    const masters = (await client.query(`SELECT id FROM ${S}.masters WHERE is_active ORDER BY created_at`)).rows;
    const services = (await client.query(
      `SELECT id, duration, price FROM ${S}.services
        WHERE is_active AND price > 0 AND lower(name) NOT LIKE '%day off%' AND duration BETWEEN 15 AND 240`
    )).rows;
    if (!masters.length || !services.length) throw new Error("The branch needs at least one active master and one priced service");

    let customers = (await client.query(`SELECT id FROM ${S}.clients WHERE type = 'customer'`)).rows;
    while (customers.length < 40) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const phone = `6${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`;
      const r = await client.query(`INSERT INTO ${S}.clients (name, phone, type) VALUES ($1, $2, 'customer') RETURNING id`, [name, phone]);
      customers.push(r.rows[0]);
      stats.clients++;
    }

    // ---- appointments ------------------------------------------------------
    const days = (await client.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day FROM generate_series($1::date, $2::date, interval '1 day') d
        WHERE EXTRACT(isodow FROM d) < 7`,
      [from, until]
    )).rows.map((r) => r.day);

    for (const day of days) {
      for (const m of masters) {
        const busy = await client.query(
          `SELECT 1 FROM ${S}.appointments
            WHERE master_id = $1 AND (start_time AT TIME ZONE $3)::date = $2::date LIMIT 1`,
          [m.id, day, TZ]
        );
        const r = keyed(`${m.id}|${day}`);
        if (busy.rows.length || r() < 0.12) continue; // already has a schedule, or a day off
        let minute = 10 * 60 + Math.floor(r() * 4) * 15;
        while (minute < 18 * 60) {
          const svc = services[Math.floor(r() * services.length)];
          const dur = Number(svc.duration);
          if (minute + dur > 19 * 60) break;
          if (r() < 0.78) {
            const start = `${day} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
            const ins = await client.query(
              `INSERT INTO ${S}.appointments (master_id, client_id, service_id, start_time, end_time, status)
               SELECT $1, $2, $3, s, s + make_interval(mins => $4),
                      CASE WHEN s + make_interval(mins => $4) > now() THEN 'planned'
                           WHEN $6 THEN 'cancelled' ELSE 'completed' END
                 FROM (SELECT ($5::timestamp AT TIME ZONE '${TZ}') AS s) x
               ON CONFLICT DO NOTHING
               RETURNING id`,
              [m.id, customers[Math.floor(r() * customers.length)].id, svc.id, dur, start, r() < 0.07]
            );
            stats.appointments += ins.rowCount;
          }
          minute += dur + (r() < 0.5 ? 0 : 15);
        }
      }
    }

    // ---- settle everything in the past ------------------------------------------
    const settled = await client.query(
      `UPDATE ${S}.appointments SET status = 'completed'
        WHERE status = 'planned' AND end_time < now() AND client_id IS NOT NULL`
    );
    stats.settled = settled.rowCount;

    const due = await client.query(
      `SELECT a.id, a.client_id, a.end_time,
              a.price - COALESCE((SELECT sum(p.amount) FROM ${S}.payments p
                                   WHERE p.appointment_id = a.id AND p.type = 'incoming'), 0) AS due
         FROM ${S}.appointments a
        WHERE a.status = 'completed' AND a.client_id IS NOT NULL AND a.end_time < now() AND a.price > 0`
    );
    for (const a of due.rows) {
      if (Number(a.due) <= 0.004) continue;
      await client.query(
        `INSERT INTO ${S}.payments (appointment_id, partner_id, amount, vat_percent, method, type, paid_at, reason)
         VALUES ($1, $2, $3, $4, $5, 'incoming', $6::timestamptz + interval '5 minutes', $7)`,
        [a.id, a.client_id, a.due, vatRate, rand() < 0.7 ? "Card" : "Cash", a.end_time, MARK]
      );
      stats.payments++;
    }

    // ---- product sales on past days -------------------------------------------
    const items = (await client.query(`SELECT id, price FROM ${S}.items WHERE is_active AND price > 0`)).rows;
    if (items.length) {
      const pastDays = days.filter((d) => d < new Date().toISOString().slice(0, 10));
      for (const day of pastDays) {
        const exists = await client.query(
          `SELECT 1 FROM ${S}.payments WHERE item_id IS NOT NULL AND reason = $1
             AND (paid_at AT TIME ZONE $3)::date = $2::date LIMIT 1`,
          [MARK, day, TZ]
        );
        if (exists.rows.length) continue;
        const r = keyed(`sales|${day}`);
        const sales = Math.floor(r() * 4);
        for (let k = 0; k < sales; k++) {
          const it = items[Math.floor(r() * items.length)];
          const qty = r() < 0.8 ? 1 : 2;
          const time = `${day} ${11 + Math.floor(r() * 8)}:${String(Math.floor(r() * 60)).padStart(2, "0")}`;
          await client.query(
            `INSERT INTO ${S}.payments (item_id, qty, partner_id, amount, vat_percent, method, type, paid_at, reason)
             VALUES ($1, $2, $3, $4, $5, $6, 'incoming', ($7::timestamp AT TIME ZONE '${TZ}'), $8)`,
            [it.id, qty, customers[Math.floor(r() * customers.length)].id, (Number(it.price) * qty).toFixed(2), vatRate, r() < 0.7 ? "Card" : "Cash", time, MARK]
          );
          stats.sales++;
        }
      }
    }

    // ---- monthly expenses ---------------------------------------------------------
    let vendor = (await client.query(`SELECT id FROM ${S}.clients WHERE type = 'vendor' ORDER BY created_at LIMIT 1`)).rows[0];
    if (!vendor) {
      vendor = (await client.query(`INSERT INTO ${S}.clients (name, type) VALUES ('Proveedores Demo S.L.', 'vendor') RETURNING id`)).rows[0];
    }
    const expenses = (await client.query(`SELECT id, name FROM ${S}.expenses ORDER BY id`)).rows;
    const byName = (re) => expenses.find((e) => re.test(e.name));
    const plan = [
      { e: byName(/rent|alquiler|аренд/i) || expenses[0], day: 1, amount: 1815 },
      { e: byName(/util|electric|luz|agua|water/i) || expenses[1], day: 10, amount: 290.4 },
      { e: byName(/suppl|material|product|consum/i) || expenses[2], day: 20, amount: 423.5 },
    ].filter((x) => x.e);
    const months = (await client.query(
      `SELECT to_char(m, 'YYYY-MM') AS ym FROM generate_series(date_trunc('month', $1::date), date_trunc('month', LEAST($2::date, now()::date)), interval '1 month') m`,
      [from, until]
    )).rows.map((r) => r.ym);
    for (const ym of months) {
      for (const x of plan) {
        const when = `${ym}-${String(x.day).padStart(2, "0")} 09:00`;
        if (new Date(`${when}:00`) > new Date()) continue;
        const exists = await client.query(
          `SELECT 1 FROM ${S}.payments WHERE expense_id = $1 AND reason = $2 AND to_char(paid_at AT TIME ZONE $4, 'YYYY-MM') = $3 LIMIT 1`,
          [x.e.id, MARK, ym, TZ]
        );
        if (exists.rows.length) continue;
        const amount = (x.amount * (0.9 + rand() * 0.2)).toFixed(2);
        await client.query(
          `INSERT INTO ${S}.payments (expense_id, partner_id, amount, vat_percent, method, type, paid_at, reason)
           VALUES ($1, $2, $3, $4, 'Card', 'outgoing', ($5::timestamp AT TIME ZONE '${TZ}'), $6)`,
          [x.e.id, vendor.id, amount, vatRate, when, MARK]
        );
        stats.expenses++;
      }
    }

    // Demo only: re-issue invoice numbers so they follow the dates.
    await renumberDocuments(client, schemaName);

    await client.query(`ALTER TABLE ${S}.payments ADD CONSTRAINT payments_method_check CHECK (method IN ('Card', 'Cash')) NOT VALID`);
    await client.query(`ALTER TABLE ${S}.appointments ADD CONSTRAINT appointments_time_order_check CHECK (end_time > start_time) NOT VALID`);
    await client.query("COMMIT");

    console.log(`✅ ${schemaName}, ${from} .. ${until}:`);
    console.log(`   new appointments      ${stats.appointments}`);
    console.log(`   past planned -> done  ${stats.settled}`);
    console.log(`   visit payments        ${stats.payments}`);
    console.log(`   product sales         ${stats.sales}`);
    console.log(`   expenses              ${stats.expenses}`);
    console.log(`   new demo clients      ${stats.clients}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
})().catch(async (err) => {
  console.error("❌", err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});

/**
 * Report calculations - the single source of truth for every number shown in
 * reports and on the dashboard.
 *
 * Definitions (agreed with the product owner):
 *  - Income (cobros): INCOMING payments, by the date they were PAID, in the
 *    branch's local time zone. payments.amount includes VAT; net = without VAT.
 *  - Services rendered: COMPLETED appointments by the date of the VISIT,
 *    valued at the price fixed when the appointment was booked
 *    (appointments.price), not today's price list.
 *  - Unpaid: completed appointments of the period whose payments (any date)
 *    are less than their price.
 *  - Expenses: OUTGOING payments by date paid.
 *  - Commission: price * master's commission % fixed at booking time.
 *  - Average ticket: value of services done / completed visits (both by
 *    visit date, so it does not depend on when a visit was paid).
 *  - Comparison: whole calendar months are compared with the same number of
 *    whole months before them; any other period with the days just before it.
 *  - Day-off entries (appointments without a client) are not visits and are
 *    excluded everywhere.
 *  - VAT is split per payment and rounded to cents (as on the receipt).
 *
 * All functions take a query runner `q` (db or a client) and a QUOTED schema.
 */
const db = require("../../db");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 3 * 366;

class ReportInputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}
function i(v) {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? x : 0;
}

function parseDate(s) {
  if (!DATE_RE.test(String(s || ""))) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, k) => new Date(d.getTime() + k * 86400000);

/** Validates ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive local dates). */
function parsePeriod(from, to) {
  const f = parseDate(from);
  const t = parseDate(to);
  if (!f || !t) throw new ReportInputError("from and to must be dates in format YYYY-MM-DD");
  if (f > t) throw new ReportInputError("from must not be after to");
  const days = Math.round((t - f) / 86400000) + 1;
  if (days > MAX_DAYS) throw new ReportInputError("Period is too long (max 3 years)");
  return { from: iso(f), to: iso(t), days };
}

/**
 * The period to compare with: for whole calendar months (e.g. 1-31 Mar or
 * 1 Jan-31 Mar) the same number of whole months before; otherwise the same
 * number of days right before.
 */
function previousPeriod({ from, to, days }) {
  const f = parseDate(from);
  const t = parseDate(to);
  const lastOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  if (f.getUTCDate() === 1 && t.getTime() === lastOfMonth(t).getTime()) {
    const months = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()) + 1;
    const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - months, 1));
    const pt = addDays(f, -1);
    return { from: iso(pf), to: iso(pt), days: Math.round((pt - pf) / 86400000) + 1 };
  }
  const prevTo = addDays(f, -1);
  return { from: iso(addDays(prevTo, -(days - 1))), to: iso(prevTo), days };
}

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function branchSettings(q, schema) {
  const { rows } = await q.query(`SELECT currency, timezone FROM ${schema}.settings ORDER BY created_at NULLS LAST LIMIT 1`);
  return {
    currency: rows[0]?.currency?.trim() || "EUR",
    // An invalid zone name would make every report fail; fall back safely.
    timezone: validTimezone(rows[0]?.timezone) ? rows[0].timezone : "Europe/Madrid",
  };
}

// $1 = from date, $2 = to date, $3 = time zone  ->  [start, end) as timestamptz
const RANGE = `
  r AS (SELECT ($1::date)::timestamp AT TIME ZONE $3 AS s,
               ($2::date + 1)::timestamp AT TIME ZONE $3 AS e)`;

/**
 * Headline figures for one branch and period.
 * opts.masterIds restricts everything to these master profiles (one user may
 * have several): income = payments for their appointments; no items,
 * expenses or purchase costs are returned.
 */
async function overview(q, schema, period, opts = {}) {
  const tz = opts.timezone || (await branchSettings(q, schema)).timezone;
  const m = opts.masterIds?.length ? opts.masterIds : null;
  const params = [period.from, period.to, tz, m];

  const { rows } = await q.query(
    `WITH ${RANGE},
     pay AS (
       SELECT p.*, a.master_id
         FROM ${schema}.payments p
         LEFT JOIN ${schema}.appointments a ON a.id = p.appointment_id, r
        WHERE p.paid_at >= r.s AND p.paid_at < r.e
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
     ),
     ap AS MATERIALIZED (
       SELECT a.* FROM ${schema}.appointments a, r
        WHERE a.start_time >= r.s AND a.start_time < r.e
          AND a.client_id IS NOT NULL
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
     ),
     done AS MATERIALIZED (
       -- completed visits with everything paid for them (any date)
       SELECT ap.id, ap.price,
              COALESCE(sum(p.amount) FILTER (WHERE p.type = 'incoming'), 0) AS paid
         FROM ap
         LEFT JOIN ${schema}.payments p ON p.appointment_id = ap.id
        WHERE ap.status = 'completed'
        GROUP BY ap.id, ap.price
     )
     SELECT
       (SELECT COALESCE(sum(amount), 0)      FROM pay WHERE type = 'incoming') AS income_gross,
       (SELECT COALESCE(sum(amount_net), 0)  FROM pay WHERE type = 'incoming') AS income_net,
       (SELECT COALESCE(sum(vat_amount), 0)  FROM pay WHERE type = 'incoming') AS income_vat,
       (SELECT count(*)                      FROM pay WHERE type = 'incoming') AS income_count,
       (SELECT COALESCE(sum(amount), 0) FROM pay WHERE type = 'incoming' AND appointment_id IS NOT NULL) AS income_services,
       (SELECT COALESCE(sum(amount), 0) FROM pay WHERE type = 'incoming' AND item_id IS NOT NULL)        AS income_items,
       (SELECT COALESCE(sum(amount), 0) FROM pay WHERE type = 'incoming' AND appointment_id IS NULL AND item_id IS NULL) AS income_other,
       (SELECT count(DISTINCT appointment_id) FROM pay WHERE type = 'incoming' AND appointment_id IS NOT NULL) AS paid_visits,
       (SELECT COALESCE(sum(amount_net - COALESCE(unit_cost, 0) * qty), 0)
          FROM pay WHERE type = 'incoming' AND item_id IS NOT NULL) AS items_margin,

       (SELECT COALESCE(sum(amount), 0)     FROM pay WHERE type = 'outgoing') AS expenses_gross,
       (SELECT COALESCE(sum(amount_net), 0) FROM pay WHERE type = 'outgoing') AS expenses_net,
       (SELECT COALESCE(sum(vat_amount), 0) FROM pay WHERE type = 'outgoing') AS expenses_vat,
       (SELECT count(*)                     FROM pay WHERE type = 'outgoing') AS expenses_count,

       (SELECT count(*)                         FROM ap WHERE status = 'completed') AS completed,
       (SELECT COALESCE(sum(price), 0)          FROM ap WHERE status = 'completed') AS rendered_value,
       (SELECT COALESCE(sum(price - cost), 0)   FROM ap WHERE status = 'completed') AS services_margin,
       (SELECT COALESCE(sum(price * COALESCE(commission_percent, 0) / 100), 0)
          FROM ap WHERE status = 'completed') AS commissions,
       (SELECT COALESCE(sum(EXTRACT(epoch FROM (end_time - start_time)) / 3600), 0)
          FROM ap WHERE status = 'completed') AS hours,
       (SELECT count(*)                FROM ap WHERE status = 'cancelled') AS cancelled,
       (SELECT COALESCE(sum(price), 0) FROM ap WHERE status = 'cancelled') AS cancelled_value,
       (SELECT count(*)                FROM ap WHERE status = 'planned')   AS planned,
       (SELECT COALESCE(sum(price), 0) FROM ap WHERE status = 'planned')   AS planned_value,
       (SELECT count(DISTINCT client_id) FROM ap WHERE status = 'completed') AS unique_clients,

       (SELECT count(*) FROM done WHERE price - paid > 0.005) AS unpaid_count,
       (SELECT COALESCE(sum(price - paid), 0) FROM done WHERE price - paid > 0.005) AS unpaid_amount,
       (SELECT COALESCE(sum(amount), 0) FROM pay WHERE type = 'incoming' AND vat_percent IS NULL) AS income_no_vat_rate`,
    params
  );
  const r = rows[0];

  const paidVisits = i(r.paid_visits);
  const commissions = n(r.commissions);
  const completed = i(r.completed);
  const result = {
    income: {
      gross: n(r.income_gross),
      net: n(r.income_net),
      vat: n(r.income_vat),
      payments: i(r.income_count),
      services: n(r.income_services),
      items: n(r.income_items),
      other: n(r.income_other),
      without_vat_rate: n(r.income_no_vat_rate), // counted as 0% VAT
    },
    services: {
      completed: i(r.completed),
      rendered_value: n(r.rendered_value),
      hours: n(r.hours),
      unique_clients: i(r.unique_clients),
      cancelled: i(r.cancelled),
      cancelled_value: n(r.cancelled_value),
      planned: i(r.planned),
      planned_value: n(r.planned_value),
    },
    margin: {
      services: n(r.services_margin),
      items: n(r.items_margin),
      commissions,
    },
    avg_ticket: completed ? n(Number(r.rendered_value) / completed) : 0,
    paid_visits: paidVisits,
    unpaid: { count: i(r.unpaid_count), amount: n(r.unpaid_amount) },
  };

  if (m) {
    // Masters must not be able to work out purchase costs.
    delete result.margin.services;
    delete result.margin.items;
  } else {
    result.expenses = {
      gross: n(r.expenses_gross),
      net: n(r.expenses_net),
      vat: n(r.expenses_vat),
      payments: i(r.expenses_count),
    };
    // Estimated operating result: income and expenses without VAT, minus
    // masters' commissions (which are paid outside the system).
    result.result = n(result.income.net - result.expenses.net - commissions);
  }
  return result;
}

/** Relative change in %, or null when there is nothing to compare with. */
function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

const HEADLINE = {
  income_gross: (o) => o.income.gross,
  income_net: (o) => o.income.net,
  rendered_value: (o) => o.services.rendered_value,
  completed: (o) => o.services.completed,
  avg_ticket: (o) => o.avg_ticket,
  cancelled: (o) => o.services.cancelled,
  expenses_net: (o) => o.expenses?.net,
  result: (o) => o.result,
};

async function overviewWithComparison(q, schema, period, opts = {}) {
  const settings = await branchSettings(q, schema);
  const o = { ...opts, timezone: settings.timezone };
  const prev = previousPeriod(period);
  const [current, previous] = await Promise.all([overview(q, schema, period, o), overview(q, schema, prev, o)]);
  const change = {};
  for (const [k, get] of Object.entries(HEADLINE)) {
    const c = get(current);
    if (c !== undefined) change[k] = pctChange(c, get(previous));
  }
  return {
    period: { from: period.from, to: period.to, ...settings },
    previous_period: { from: prev.from, to: prev.to },
    current,
    previous,
    change,
  };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

async function byMaster(q, schema, period, tz) {
  const { rows } = await q.query(
    `WITH ${RANGE},
     ap AS (
       SELECT a.master_id,
              count(*) FILTER (WHERE status = 'completed') AS completed,
              COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0) AS rendered_value,
              COALESCE(sum(price - cost) FILTER (WHERE status = 'completed'), 0) AS margin,
              COALESCE(sum(price * COALESCE(commission_percent, 0) / 100) FILTER (WHERE status = 'completed'), 0) AS commission,
              COALESCE(sum(EXTRACT(epoch FROM (end_time - start_time)) / 3600) FILTER (WHERE status = 'completed'), 0) AS hours,
              count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
              count(DISTINCT client_id) FILTER (WHERE status = 'completed') AS unique_clients
         FROM ${schema}.appointments a, r
        WHERE a.start_time >= r.s AND a.start_time < r.e AND a.client_id IS NOT NULL
        GROUP BY a.master_id
     ),
     pay AS (
       SELECT a.master_id, sum(p.amount) AS income_gross, sum(p.amount_net) AS income_net,
              count(DISTINCT p.appointment_id) AS paid_visits
         FROM ${schema}.payments p
         JOIN ${schema}.appointments a ON a.id = p.appointment_id, r
        WHERE p.type = 'incoming' AND p.paid_at >= r.s AND p.paid_at < r.e
        GROUP BY a.master_id
     )
     SELECT m.id, m.name, m.color, m.photo_url, m.is_active,
            COALESCE(ap.completed, 0) AS completed, COALESCE(ap.rendered_value, 0) AS rendered_value,
            COALESCE(ap.margin, 0) AS margin, COALESCE(ap.commission, 0) AS commission,
            COALESCE(ap.hours, 0) AS hours, COALESCE(ap.cancelled, 0) AS cancelled,
            COALESCE(ap.unique_clients, 0) AS unique_clients,
            COALESCE(pay.income_gross, 0) AS income_gross, COALESCE(pay.income_net, 0) AS income_net,
            COALESCE(pay.paid_visits, 0) AS paid_visits
       FROM ${schema}.masters m
       LEFT JOIN ap ON ap.master_id = m.id
       LEFT JOIN pay ON pay.master_id = m.id
      WHERE m.is_active OR ap.master_id IS NOT NULL OR pay.master_id IS NOT NULL
      ORDER BY COALESCE(pay.income_gross, 0) DESC, m.name`,
    [period.from, period.to, tz]
  );
  return rows.map((r) => ({
    master_id: r.id,
    name: r.name,
    color: r.color,
    photo_url: r.photo_url,
    is_active: r.is_active,
    completed: i(r.completed),
    cancelled: i(r.cancelled),
    unique_clients: i(r.unique_clients),
    hours: n(r.hours),
    rendered_value: n(r.rendered_value),
    income_gross: n(r.income_gross),
    income_net: n(r.income_net),
    avg_ticket: i(r.completed) ? n(r.rendered_value / r.completed) : 0,
    margin: n(r.margin),
    commission: n(r.commission),
    revenue_per_hour: Number(r.hours) > 0 ? n(r.rendered_value / r.hours) : 0,
  }));
}

async function byService(q, schema, period, tz) {
  const { rows } = await q.query(
    `WITH ${RANGE},
     ap AS (
       SELECT a.service_id,
              count(*) FILTER (WHERE status = 'completed') AS completed,
              COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0) AS rendered_value,
              COALESCE(sum(price - cost) FILTER (WHERE status = 'completed'), 0) AS margin,
              count(*) FILTER (WHERE status = 'cancelled') AS cancelled
         FROM ${schema}.appointments a, r
        WHERE a.start_time >= r.s AND a.start_time < r.e AND a.client_id IS NOT NULL
        GROUP BY a.service_id
     ),
     pay AS (
       SELECT a.service_id, sum(p.amount) AS income_gross, sum(p.amount_net) AS income_net
         FROM ${schema}.payments p
         JOIN ${schema}.appointments a ON a.id = p.appointment_id, r
        WHERE p.type = 'incoming' AND p.paid_at >= r.s AND p.paid_at < r.e
        GROUP BY a.service_id
     )
     SELECT s.id, s.name, s.price AS list_price,
            COALESCE(ap.completed, 0) AS completed, COALESCE(ap.cancelled, 0) AS cancelled,
            COALESCE(ap.rendered_value, 0) AS rendered_value, COALESCE(ap.margin, 0) AS margin,
            COALESCE(pay.income_gross, 0) AS income_gross, COALESCE(pay.income_net, 0) AS income_net
       FROM ${schema}.services s
       LEFT JOIN ap ON ap.service_id = s.id
       LEFT JOIN pay ON pay.service_id = s.id
      WHERE ap.service_id IS NOT NULL OR pay.service_id IS NOT NULL
      ORDER BY COALESCE(pay.income_gross, 0) DESC, COALESCE(ap.rendered_value, 0) DESC, s.name`,
    [period.from, period.to, tz]
  );
  return rows.map((r) => ({
    service_id: r.id,
    name: r.name,
    list_price: n(r.list_price),
    completed: i(r.completed),
    cancelled: i(r.cancelled),
    rendered_value: n(r.rendered_value),
    income_gross: n(r.income_gross),
    income_net: n(r.income_net),
    margin: n(r.margin),
    margin_percent: Number(r.rendered_value) > 0 ? n((r.margin / r.rendered_value) * 100) : 0,
  }));
}

async function byItem(q, schema, period, tz) {
  const { rows } = await q.query(
    `WITH ${RANGE}
     SELECT i.id, i.name, i.unit,
            sum(p.qty) AS qty, sum(p.amount) AS income_gross, sum(p.amount_net) AS income_net,
            sum(COALESCE(p.unit_cost, 0) * p.qty) AS cost
       FROM ${schema}.payments p
       JOIN ${schema}.items i ON i.id = p.item_id, r
      WHERE p.type = 'incoming' AND p.paid_at >= r.s AND p.paid_at < r.e
      GROUP BY i.id, i.name, i.unit
      ORDER BY sum(p.amount) DESC`,
    [period.from, period.to, tz]
  );
  return rows.map((r) => {
    const margin = n(r.income_net - r.cost);
    return {
      item_id: r.id,
      name: r.name,
      unit: r.unit,
      qty: n(r.qty),
      income_gross: n(r.income_gross),
      income_net: n(r.income_net),
      cost: n(r.cost),
      margin,
      margin_percent: Number(r.income_net) > 0 ? n((margin / r.income_net) * 100) : 0,
    };
  });
}

async function byExpense(q, schema, period, tz) {
  const { rows } = await q.query(
    `WITH ${RANGE}
     SELECT COALESCE(e.name, CASE WHEN i.id IS NOT NULL THEN 'Purchase: ' || i.name END, 'Other') AS name,
            p.expense_id, count(*) AS payments,
            sum(p.amount) AS gross, sum(p.amount_net) AS net, sum(p.vat_amount) AS vat
       FROM ${schema}.payments p
       LEFT JOIN ${schema}.expenses e ON e.id = p.expense_id
       LEFT JOIN ${schema}.items i ON i.id = p.item_id, r
      WHERE p.type = 'outgoing' AND p.paid_at >= r.s AND p.paid_at < r.e
      GROUP BY 1, p.expense_id
      ORDER BY sum(p.amount) DESC`,
    [period.from, period.to, tz]
  );
  return rows.map((r) => ({
    name: r.name,
    expense_id: r.expense_id,
    payments: i(r.payments),
    gross: n(r.gross),
    net: n(r.net),
    vat: n(r.vat),
  }));
}

/** One row per calendar day of the period (days without activity included). */
async function byDay(q, schema, period, tz, masterIds = null) {
  const ids = masterIds?.length ? masterIds : null;
  const { rows } = await q.query(
    `WITH ${RANGE},
     days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day),
     pay AS (
       SELECT (p.paid_at AT TIME ZONE $3)::date AS day,
              COALESCE(sum(p.amount) FILTER (WHERE p.type = 'incoming'), 0) AS income_gross,
              COALESCE(sum(p.amount_net) FILTER (WHERE p.type = 'incoming'), 0) AS income_net,
              COALESCE(sum(p.amount_net) FILTER (WHERE p.type = 'outgoing'), 0) AS expenses_net
         FROM ${schema}.payments p
         LEFT JOIN ${schema}.appointments a ON a.id = p.appointment_id, r
        WHERE p.paid_at >= r.s AND p.paid_at < r.e
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
        GROUP BY 1
     ),
     ap AS (
       SELECT (a.start_time AT TIME ZONE $3)::date AS day,
              count(*) FILTER (WHERE status = 'completed') AS completed,
              COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0) AS rendered_value,
              count(*) FILTER (WHERE status = 'cancelled') AS cancelled
         FROM ${schema}.appointments a, r
        WHERE a.start_time >= r.s AND a.start_time < r.e AND a.client_id IS NOT NULL
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
        GROUP BY 1
     )
     SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
            COALESCE(pay.income_gross, 0) AS income_gross, COALESCE(pay.income_net, 0) AS income_net,
            COALESCE(pay.expenses_net, 0) AS expenses_net,
            COALESCE(ap.completed, 0) AS completed, COALESCE(ap.rendered_value, 0) AS rendered_value,
            COALESCE(ap.cancelled, 0) AS cancelled
       FROM days
       LEFT JOIN pay ON pay.day = days.day
       LEFT JOIN ap ON ap.day = days.day
      ORDER BY days.day`,
    [period.from, period.to, tz, ids]
  );
  return rows.map((r) => ({
    day: r.day,
    income_gross: n(r.income_gross),
    income_net: n(r.income_net),
    ...(ids ? {} : { expenses_net: n(r.expenses_net) }),
    completed: i(r.completed),
    rendered_value: n(r.rendered_value),
    cancelled: i(r.cancelled),
  }));
}

/** Completed appointments of the period that are not (fully) paid. */
async function receivables(q, schema, period, tz) {
  const { rows } = await q.query(
    `WITH ${RANGE},
     ap AS (
       SELECT a.* FROM ${schema}.appointments a, r
        WHERE a.status = 'completed' AND a.client_id IS NOT NULL
          AND a.start_time >= r.s AND a.start_time < r.e
     ),
     paid AS (
       SELECT appointment_id, sum(amount) AS paid FROM ${schema}.payments
        WHERE type = 'incoming' AND appointment_id IN (SELECT id FROM ap)
        GROUP BY appointment_id
     )
     SELECT ap.id AS appointment_id, to_char(ap.start_time AT TIME ZONE $3, 'YYYY-MM-DD HH24:MI') AS date,
            c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
            m.name AS master_name, s.name AS service_name,
            ap.price, COALESCE(paid.paid, 0) AS paid, ap.price - COALESCE(paid.paid, 0) AS due,
            count(*) OVER () AS total_count, sum(ap.price - COALESCE(paid.paid, 0)) OVER () AS total_due
       FROM ap
       LEFT JOIN paid ON paid.appointment_id = ap.id
       LEFT JOIN ${schema}.clients c ON c.id = ap.client_id
       LEFT JOIN ${schema}.masters m ON m.id = ap.master_id
       LEFT JOIN ${schema}.services s ON s.id = ap.service_id
      WHERE ap.price - COALESCE(paid.paid, 0) > 0.005
      ORDER BY ap.start_time
      LIMIT 1000`,
    [period.from, period.to, tz]
  );
  const items = rows.map((r) => ({
    appointment_id: r.appointment_id,
    date: r.date,
    client_id: r.client_id,
    client_name: r.client_name,
    client_phone: r.client_phone,
    master_name: r.master_name,
    service_name: r.service_name,
    price: n(r.price),
    paid: n(r.paid),
    due: n(r.due),
  }));
  // Totals cover every unpaid visit, even beyond the first 1000 listed.
  return {
    total: n(rows[0]?.total_due ?? 0),
    count: i(rows[0]?.total_count ?? 0),
    truncated: i(rows[0]?.total_count ?? 0) > items.length,
    items,
  };
}

const BREAKDOWNS = { master: byMaster, service: byService, item: byItem, expense: byExpense, day: byDay };

async function breakdown(q, schema, period, by) {
  const fn = BREAKDOWNS[by];
  if (!fn) throw new ReportInputError(`Unknown breakdown "${by}". Use one of: ${Object.keys(BREAKDOWNS).join(", ")}`);
  const settings = await branchSettings(q, schema);
  return { period: { from: period.from, to: period.to, ...settings }, by, rows: await fn(q, schema, period, settings.timezone) };
}

module.exports = {
  ReportInputError,
  parsePeriod,
  previousPeriod,
  branchSettings,
  overview,
  overviewWithComparison,
  breakdown,
  byDay,
  receivables,
  db,
};

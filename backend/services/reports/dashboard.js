/**
 * Data for the dashboard, in one call.
 *
 * The dashboard reacts to clicks (a day, a master, a service) without asking
 * the server again, so instead of ready totals this returns small fact tables
 * that the screen adds up for whatever is selected:
 *
 *   cells      one row per day x master: money received, visits, booked
 *              minutes, minutes the master was available, unpaid amount ...
 *   svc_cells  one row per day x master x service: completed visits and value
 *
 * Definitions are the same as in metrics.js (Reports):
 *   income      = customer payments by date paid (credit notes subtract)
 *   rendered    = completed visits at their booked price
 *   booked      = planned visits from now on, at their booked price (forecast)
 *   available   = opening hours on working days, minus the master's days off
 *   occupancy   = booked minutes (done + planned) / available minutes
 */
const metrics = require("./metrics");

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
};
const i = (v) => {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? x : 0;
};
const LAPSED_DAYS = 60;

async function dashboardSettings(q, schema) {
  const base = await metrics.branchSettings(q, schema);
  const { rows } = await q.query(
    `SELECT to_char(work_start, 'HH24:MI') AS work_start, to_char(work_end, 'HH24:MI') AS work_end,
            work_days, revenue_goal_month
       FROM ${schema}.settings ORDER BY created_at NULLS LAST LIMIT 1`
  );
  const r = rows[0] || {};
  return {
    ...base,
    work_start: r.work_start || "10:00",
    work_end: r.work_end || "20:00",
    work_days: (r.work_days || [1, 2, 3, 4, 5, 6]).map(Number),
    revenue_goal_month: r.revenue_goal_month === null || r.revenue_goal_month === undefined ? null : n(r.revenue_goal_month),
  };
}

// $1 from, $2 to, $3 tz, $4 masters[], $5 services[], $6 clients[]
const RANGE = `r AS (SELECT ($1::date)::timestamp AT TIME ZONE $3 AS s, ($2::date + 1)::timestamp AT TIME ZONE $3 AS e)`;
const AP_FILTER = `a.client_id IS NOT NULL
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
          AND ($5::uuid[] IS NULL OR a.service_id = ANY($5::uuid[]))
          AND ($6::uuid[] IS NULL OR a.client_id = ANY($6::uuid[]))`;
// Payments for visits follow the visit's master/service; product sales have
// neither, so they count only while no master or service is filtered.
const PAY_FILTER = `p.type = 'incoming'
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
          AND ($5::uuid[] IS NULL OR a.service_id = ANY($5::uuid[]))
          AND ($6::uuid[] IS NULL OR p.partner_id = ANY($6::uuid[]))`;

async function incomeByDay(q, schema, from, to, tz, f) {
  const { rows } = await q.query(
    `WITH ${RANGE}
     SELECT to_char((p.paid_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day, sum(p.amount) AS income
       FROM ${schema}.payments p
       LEFT JOIN ${schema}.appointments a ON a.id = p.appointment_id, r
      WHERE p.paid_at >= r.s AND p.paid_at < r.e AND ${PAY_FILTER}
      GROUP BY 1 ORDER BY 1`,
    [from, to, tz, f.masters, f.services, f.clients]
  );
  return rows.map((r) => ({ day: r.day, income: n(r.income) }));
}

/** Money goal for the period: the monthly goal spread over working days. */
function periodGoal(period, settings) {
  const goal = settings.revenue_goal_month;
  if (goal === null) return null;
  const isWork = (d) => settings.work_days.includes(((d.getUTCDay() + 6) % 7) + 1);
  let total = 0;
  const start = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(`${period.to}T00:00:00Z`);
  const perMonth = new Map();
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    if (!isWork(d)) continue;
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!perMonth.has(key)) {
      let wd = 0;
      const m0 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      for (let x = m0; x.getUTCMonth() === m0.getUTCMonth(); x = new Date(x.getTime() + 86400000)) if (isWork(x)) wd++;
      perMonth.set(key, wd);
    }
    total += goal / perMonth.get(key);
  }
  return n(total);
}

const shiftYear = (iso, k) => {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y + k, m, 0)).getUTCDate();
  return `${y + k}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};

/**
 * @param f filters: { masters, services, clients } arrays of ids or null (= all)
 * @param opts.forMaster true for a master's own dashboard: no customer lists
 */
async function dashboard(q, schema, period, f, opts = {}) {
  const settings = await dashboardSettings(q, schema);
  const tz = settings.timezone;
  const params = [period.from, period.to, tz, f.masters, f.services, f.clients];

  // ---- day x master facts ---------------------------------------------------
  const cells = await q.query(
    `WITH ${RANGE},
     st AS (SELECT work_start, work_end, work_days FROM ${schema}.settings ORDER BY created_at NULLS LAST LIMIT 1),
     days AS (SELECT d::date AS day FROM generate_series($1::date, $2::date, interval '1 day') d),
     ms AS (
       SELECT m.id, m.is_active FROM ${schema}.masters m
        WHERE ($4::uuid[] IS NULL OR m.id = ANY($4::uuid[]))
          AND (m.is_active OR EXISTS (SELECT 1 FROM ${schema}.appointments a, r
                                       WHERE a.master_id = m.id AND a.start_time >= r.s AND a.start_time < r.e))
     ),
     pay AS (
       SELECT (p.paid_at AT TIME ZONE $3)::date AS day, a.master_id, sum(p.amount) AS income
         FROM ${schema}.payments p
         LEFT JOIN ${schema}.appointments a ON a.id = p.appointment_id, r
        WHERE p.paid_at >= r.s AND p.paid_at < r.e AND ${PAY_FILTER}
        GROUP BY 1, 2
     ),
     ap AS MATERIALIZED (
       SELECT a.id, a.master_id, a.status, a.start_time, a.price,
              (a.start_time AT TIME ZONE $3)::date AS day,
              EXTRACT(epoch FROM (a.end_time - a.start_time)) / 60 AS minutes,
              COALESCE((SELECT sum(p.amount) FROM ${schema}.payments p
                         WHERE p.appointment_id = a.id AND p.type = 'incoming' AND p.document_type = 'payment'), 0) AS paid
         FROM ${schema}.appointments a, r
        WHERE a.start_time >= r.s AND a.start_time < r.e AND ${AP_FILTER}
     ),
     apc AS (
       SELECT day, master_id,
              count(*) FILTER (WHERE status = 'completed') AS completed,
              count(*) FILTER (WHERE start_time < now()) AS due,
              count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
              count(*) FILTER (WHERE status = 'planned' AND start_time >= now()) AS ahead,
              COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0) AS rendered,
              COALESCE(sum(price) FILTER (WHERE status = 'planned' AND start_time >= now()), 0) AS booked_value,
              COALESCE(sum(GREATEST(price - paid, 0)) FILTER (WHERE status = 'completed'), 0) AS unpaid,
              count(*) FILTER (WHERE status = 'completed' AND price - paid > 0.005) AS unpaid_count,
              COALESCE(sum(minutes) FILTER (WHERE status <> 'cancelled'), 0) AS booked_min
         FROM ap GROUP BY 1, 2
     ),
     off AS (
       SELECT (a.start_time AT TIME ZONE $3)::date AS day, a.master_id,
              sum(EXTRACT(epoch FROM (a.end_time - a.start_time)) / 60) AS minutes
         FROM ${schema}.appointments a, r
        WHERE a.client_id IS NULL AND a.status <> 'cancelled'
          AND a.start_time >= r.s AND a.start_time < r.e
          AND ($4::uuid[] IS NULL OR a.master_id = ANY($4::uuid[]))
        GROUP BY 1, 2
     ),
     grid AS (
       SELECT days.day, ms.id AS master_id,
              CASE WHEN ms.is_active AND EXTRACT(isodow FROM days.day)::int = ANY(st.work_days)
                   THEN EXTRACT(epoch FROM (st.work_end - st.work_start)) / 60 ELSE 0 END AS open_min
         FROM days CROSS JOIN ms CROSS JOIN st
     ),
     keys AS (
       SELECT day, master_id FROM grid
       UNION SELECT day, master_id FROM pay
       UNION SELECT day, master_id FROM apc
     )
     SELECT to_char(k.day, 'YYYY-MM-DD') AS day, k.master_id,
            COALESCE(pay.income, 0) AS income,
            COALESCE(apc.completed, 0) AS completed, COALESCE(apc.due, 0) AS due,
            COALESCE(apc.cancelled, 0) AS cancelled, COALESCE(apc.ahead, 0) AS ahead,
            COALESCE(apc.rendered, 0) AS rendered, COALESCE(apc.booked_value, 0) AS booked_value,
            COALESCE(apc.unpaid, 0) AS unpaid, COALESCE(apc.unpaid_count, 0) AS unpaid_count,
            COALESCE(apc.booked_min, 0) AS booked_min,
            GREATEST(COALESCE(grid.open_min, 0) - COALESCE(off.minutes, 0), 0) AS available_min
       FROM keys k
       LEFT JOIN pay  ON pay.day = k.day  AND pay.master_id IS NOT DISTINCT FROM k.master_id
       LEFT JOIN apc  ON apc.day = k.day  AND apc.master_id = k.master_id
       LEFT JOIN grid ON grid.day = k.day AND grid.master_id = k.master_id
       LEFT JOIN off  ON off.day = k.day  AND off.master_id = k.master_id
      ORDER BY k.day, k.master_id NULLS LAST`,
    params
  );

  const svc = await q.query(
    `WITH ${RANGE}
     SELECT to_char((a.start_time AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day, a.master_id, a.service_id,
            count(*) AS completed, COALESCE(sum(a.price), 0) AS rendered
       FROM ${schema}.appointments a, r
      WHERE a.start_time >= r.s AND a.start_time < r.e AND a.status = 'completed' AND ${AP_FILTER}
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    params
  );

  // ---- reference lists ------------------------------------------------------
  const masterIds = [...new Set(cells.rows.map((r) => r.master_id).filter(Boolean))];
  const serviceIds = [...new Set(svc.rows.map((r) => r.service_id))];
  const masters = masterIds.length
    ? (await q.query(
        `SELECT id, name, color, photo_url, is_active FROM ${schema}.masters WHERE id = ANY($1::uuid[]) ORDER BY name`,
        [masterIds]
      )).rows
    : [];
  const services = serviceIds.length
    ? (await q.query(`SELECT id, name FROM ${schema}.services WHERE id = ANY($1::uuid[]) ORDER BY name`, [serviceIds])).rows
    : [];

  // ---- comparisons and goal ---------------------------------------------------
  const prev = metrics.previousPeriod(period);
  const prevDays = await incomeByDay(q, schema, prev.from, prev.to, tz, f);
  const goal = periodGoal(period, settings);
  let lastYear = null;
  if (goal === null) {
    const ly = await incomeByDay(q, schema, shiftYear(period.from, -1), shiftYear(period.to, -1), tz, f);
    lastYear = n(ly.reduce((s, d) => s + d.income, 0));
  }

  // ---- busy hours: weekday x hour, last 8 weeks up to the period end ----------
  const heat = await q.query(
    `WITH st AS (SELECT work_start, work_end, work_days FROM ${schema}.settings ORDER BY created_at NULLS LAST LIMIT 1),
     win AS (SELECT LEAST($1::date, (now() AT TIME ZONE $2)::date) AS last_day),
     r AS (SELECT ((SELECT last_day FROM win) - 55)::timestamp AT TIME ZONE $2 AS s,
                  ((SELECT last_day FROM win) + 1)::timestamp AT TIME ZONE $2 AS e),
     hours AS (SELECT h FROM generate_series(0, 23) h, st
                WHERE h >= EXTRACT(hour FROM st.work_start) AND h < EXTRACT(hour FROM st.work_end - interval '1 second') + 1),
     ms AS (SELECT count(*) AS k FROM ${schema}.masters m
             WHERE m.is_active AND ($3::uuid[] IS NULL OR m.id = ANY($3::uuid[]))),
     ap AS (
       SELECT a.client_id IS NULL AS is_off,
              a.start_time AT TIME ZONE $2 AS s, a.end_time AT TIME ZONE $2 AS e
         FROM ${schema}.appointments a, r
        WHERE a.start_time >= r.s AND a.start_time < r.e AND a.status <> 'cancelled'
          AND ($3::uuid[] IS NULL OR a.master_id = ANY($3::uuid[]))
     ),
     slots AS (
       SELECT EXTRACT(isodow FROM ap.s)::int AS dow, hours.h, ap.is_off,
              EXTRACT(epoch FROM (LEAST(ap.e, date_trunc('day', ap.s) + make_interval(hours => hours.h + 1))
                                - GREATEST(ap.s, date_trunc('day', ap.s) + make_interval(hours => hours.h)))) / 60 AS minutes
         FROM ap CROSS JOIN hours
        WHERE ap.e > date_trunc('day', ap.s) + make_interval(hours => hours.h)
          AND ap.s < date_trunc('day', ap.s) + make_interval(hours => hours.h + 1)
     )
     SELECT d.dow, hours.h,
            COALESCE(sum(slots.minutes) FILTER (WHERE NOT slots.is_off), 0) AS booked,
            COALESCE(sum(slots.minutes) FILTER (WHERE slots.is_off), 0) AS off,
            (SELECT k FROM ms) * 8 * 60 AS capacity
       FROM (SELECT unnest(work_days)::int AS dow FROM st) d
       CROSS JOIN hours
       LEFT JOIN slots ON slots.dow = d.dow AND slots.h = hours.h
      GROUP BY d.dow, hours.h
      ORDER BY d.dow, hours.h`,
    [period.to, tz, f.masters]
  );

  // ---- upcoming visits ----------------------------------------------------------
  const upcoming = await q.query(
    `SELECT a.id, a.start_time, a.end_time, m.name AS master_name, m.color AS master_color,
            c.name AS client_name, s.name AS service_name
       FROM ${schema}.appointments a
       JOIN ${schema}.masters m ON m.id = a.master_id
       JOIN ${schema}.services s ON s.id = a.service_id
       LEFT JOIN ${schema}.clients c ON c.id = a.client_id
      WHERE a.status = 'planned' AND a.start_time >= now() AND ${AP_FILTER.replace(/\$([456])/g, (_, k) => `$${k - 3}`)}
      ORDER BY a.start_time, m.name
      LIMIT 3`,
    [f.masters, f.services, f.clients]
  );
  const todayCount = await q.query(
    `SELECT count(*) AS k FROM ${schema}.appointments a
      WHERE a.status <> 'cancelled' AND (a.start_time AT TIME ZONE $4)::date = (now() AT TIME ZONE $4)::date
        AND ${AP_FILTER.replace(/\$([456])/g, (_, k) => `$${k - 3}`)}`,
    [f.masters, f.services, f.clients, tz]
  );

  // ---- customers ------------------------------------------------------------------
  let customers = null;
  if (!opts.forMaster) customers = await customerFigures(q, schema, period, tz, f);

  const today = new Date().toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
  return {
    period: { from: period.from, to: period.to, previous: prev, today },
    settings,
    goal: goal !== null ? { amount: goal, source: "goal" } : { amount: lastYear, source: "last_year" },
    masters: masters.map((m) => ({ id: m.id, name: m.name, color: m.color, photo_url: m.photo_url, is_active: m.is_active })),
    services: services.map((s) => ({ id: s.id, name: s.name })),
    cells: cells.rows
      .map((r) => ({
        day: r.day,
        master_id: r.master_id,
        income: n(r.income),
        completed: i(r.completed),
        due: i(r.due),
        cancelled: i(r.cancelled),
        ahead: i(r.ahead),
        rendered: n(r.rendered),
        booked_value: n(r.booked_value),
        unpaid: n(r.unpaid),
        unpaid_count: i(r.unpaid_count),
        booked_min: Math.round(Number(r.booked_min)),
        available_min: Math.round(Number(r.available_min)),
      }))
      .filter((c) => c.income || c.completed || c.due || c.ahead || c.booked_min || c.available_min),
    svc_cells: svc.rows.map((r) => ({
      day: r.day,
      master_id: r.master_id,
      service_id: r.service_id,
      completed: i(r.completed),
      rendered: n(r.rendered),
    })),
    previous_days: prevDays,
    heatmap: heat.rows.map((r) => {
      const capacity = Number(r.capacity) - Number(r.off);
      return {
        dow: i(r.dow),
        hour: i(r.h),
        share: capacity > 0 ? Math.min(1, Math.round((Number(r.booked) / capacity) * 1000) / 1000) : 0,
      };
    }),
    upcoming: upcoming.rows,
    today_count: i(todayCount.rows[0].k),
    customers,
  };
}

async function customerFigures(q, schema, period, tz, f) {
  const params = [period.from, period.to, tz, f.masters, f.services, f.clients];
  const { rows } = await q.query(
    `WITH ${RANGE},
     ap AS (SELECT a.* FROM ${schema}.appointments a, r
             WHERE a.start_time >= r.s AND a.start_time < r.e AND ${AP_FILTER}),
     visitors AS (SELECT DISTINCT client_id FROM ap WHERE status = 'completed'),
     first_visit AS (
       SELECT a.client_id, min(a.start_time) AS first
         FROM ${schema}.appointments a WHERE a.status = 'completed' AND a.client_id IN (SELECT client_id FROM visitors)
        GROUP BY 1
     )
     SELECT (SELECT count(*) FROM visitors) AS visitors,
            (SELECT count(*) FROM first_visit, r WHERE first >= r.s) AS new_clients,
            (SELECT count(*) FROM ap WHERE status = 'cancelled') AS cancelled,
            (SELECT count(*) FROM ap WHERE status IN ('completed', 'cancelled')) AS decided`,
    params
  );
  const c = rows[0];
  const visitors = i(c.visitors);
  const newClients = i(c.new_clients);

  const year = Number(period.from.slice(0, 4));
  const loyal = await q.query(
    `WITH r AS (SELECT make_date($1, 1, 1)::timestamp AT TIME ZONE $2 AS s,
                       make_date($1 + 1, 1, 1)::timestamp AT TIME ZONE $2 AS e)
     SELECT c.id, c.name, c.phone,
            COALESCE(sum(p.amount), 0) AS spent,
            (SELECT count(*) FROM ${schema}.appointments a, r
              WHERE a.client_id = c.id AND a.status = 'completed' AND a.start_time >= r.s AND a.start_time < r.e) AS visits,
            (SELECT max(a.start_time) FROM ${schema}.appointments a
              WHERE a.client_id = c.id AND a.status = 'completed') AS last_visit
       FROM ${schema}.clients c
       JOIN ${schema}.payments p ON p.partner_id = c.id AND p.type = 'incoming', r
      WHERE c.type = 'customer' AND p.paid_at >= r.s AND p.paid_at < r.e
        AND ($3::uuid[] IS NULL OR c.id = ANY($3::uuid[]))
      GROUP BY c.id, c.name, c.phone
     HAVING sum(p.amount) > 0
      ORDER BY spent DESC, c.name
      LIMIT 5`,
    [year, tz, f.clients]
  );

  const lapsed = await q.query(
    `WITH last AS (
       SELECT DISTINCT ON (a.client_id) a.client_id, a.start_time, s.name AS service_name
         FROM ${schema}.appointments a JOIN ${schema}.services s ON s.id = a.service_id
        WHERE a.status = 'completed' AND a.client_id IS NOT NULL
        ORDER BY a.client_id, a.start_time DESC
     )
     SELECT c.id, c.name, c.phone, last.start_time AS last_visit, last.service_name,
            ((now() AT TIME ZONE $1)::date - (last.start_time AT TIME ZONE $1)::date) AS days_away,
            COALESCE((SELECT sum(p.amount) FROM ${schema}.payments p
                       WHERE p.partner_id = c.id AND p.type = 'incoming'), 0) AS spent
       FROM ${schema}.clients c JOIN last ON last.client_id = c.id
      WHERE c.type = 'customer'
        AND last.start_time < now() - make_interval(days => $2)
        AND NOT EXISTS (SELECT 1 FROM ${schema}.appointments f
                         WHERE f.client_id = c.id AND f.status = 'planned' AND f.start_time >= now())
        AND ($3::uuid[] IS NULL OR c.id = ANY($3::uuid[]))
      ORDER BY spent DESC, last.start_time DESC
      LIMIT 50`,
    [tz, LAPSED_DAYS, f.clients]
  );

  return {
    visitors,
    new_clients: newClients,
    returning_share: visitors ? Math.round(((visitors - newClients) / visitors) * 1000) / 10 : null,
    cancel_rate: i(c.decided) ? Math.round((i(c.cancelled) / i(c.decided)) * 1000) / 10 : null,
    year,
    loyal: loyal.rows.map((r) => ({
      id: r.id, name: r.name, phone: r.phone, spent: n(r.spent), visits: i(r.visits), last_visit: r.last_visit,
    })),
    lapsed_days: LAPSED_DAYS,
    lapsed: lapsed.rows.map((r) => ({
      id: r.id, name: r.name, phone: r.phone, last_visit: r.last_visit, service: r.service_name,
      days_away: i(r.days_away), spent: n(r.spent),
    })),
  };
}

module.exports = { dashboard, dashboardSettings, periodGoal };

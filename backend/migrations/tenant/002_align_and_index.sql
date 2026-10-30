-- Brings every branch schema to the same shape (the existing demo schemas had
-- drifted apart), adds the indexes the calendar and reports need, and
-- recreates the report views inside each branch so they read that branch's
-- own data.

-- 1. "Day off" entries have no client.
ALTER TABLE appointments ALTER COLUMN client_id DROP NOT NULL;

-- 2. Payment method: the API sends 'Card' / 'Cash'. One schema only accepted
--    lowercase values, so payments could not be created there.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
UPDATE payments SET method = 'Card' WHERE lower(method) = 'card' AND method <> 'Card';
UPDATE payments SET method = 'Cash' WHERE lower(method) = 'cash' AND method <> 'Cash';
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('Card', 'Cash')) NOT VALID;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_type_check CHECK (type IN ('incoming', 'outgoing')) NOT VALID;

-- 3. items.id is bigint, payments.item_id was integer.
ALTER TABLE payments ALTER COLUMN item_id TYPE bigint;

-- 4. Foreign keys. Deleting a client used to CASCADE-delete their payments,
--    silently erasing financial history; now it is refused instead.
--    Branches created by the old API had some of these keys missing, so old
--    rows may point to deleted items/expenses. Keys are therefore added
--    NOT VALID: enforced for every new/changed row, old rows are left as they
--    are and reported below.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_partner_id;
ALTER TABLE payments ADD CONSTRAINT fk_partner_id
  FOREIGN KEY (partner_id) REFERENCES clients(id) ON DELETE RESTRICT NOT VALID;

DO $$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payments'::regclass AND conname = 'payments_item_id_fkey') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payments'::regclass AND conname = 'fk_payments_expense') THEN
    ALTER TABLE payments ADD CONSTRAINT fk_payments_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payments'::regclass AND conname = 'payments_appointment_id_fkey') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_master_id_fkey') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_master_id_fkey FOREIGN KEY (master_id) REFERENCES masters(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_client_id_fkey') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_service_id_fkey') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) NOT VALID;
  END IF;

  SELECT count(*) INTO n FROM payments p
   WHERE (p.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM items i WHERE i.id = p.item_id))
      OR (p.expense_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = p.expense_id))
      OR NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = p.partner_id);
  IF n > 0 THEN
    RAISE WARNING 'Schema %: % payment(s) point to a deleted item, expense or partner. They are kept unchanged; review them.', current_schema(), n;
  END IF;
END $$;

-- 5. A master cannot have two overlapping (non-cancelled) appointments.
--    If old data already overlaps, the rule cannot be added; we warn instead
--    of failing so the rest of the migration still applies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'appointments'::regclass AND contype = 'x') THEN
    BEGIN
      ALTER TABLE appointments
        ADD CONSTRAINT appointments_master_id_tstzrange_excl
        EXCLUDE USING gist (master_id WITH =, tstzrange(start_time, end_time) WITH &&)
        WHERE (status <> 'cancelled');
    EXCEPTION WHEN exclusion_violation THEN
      RAISE WARNING 'Schema %: overlapping appointments exist, double-booking rule NOT added. Fix the overlaps and re-add it.', current_schema();
    END;
  END IF;
END $$;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_time_order_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_time_order_check CHECK (end_time > start_time) NOT VALID;

-- 6. Duplicate / useless indexes.
DROP INDEX IF EXISTS no_overlap_per_master;   -- plain index, never enforced anything
DROP INDEX IF EXISTS clients_type_idx;        -- duplicate of idx_clients_type
DROP INDEX IF EXISTS payments_paid_at_idx;    -- duplicate of idx_payments_paid_at

-- 7. Indexes for calendar, payments and reports.
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients (type);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments (start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_master_start ON appointments (master_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments (client_id);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments (appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_partner ON payments (partner_id);
CREATE INDEX IF NOT EXISTS idx_masters_user ON masters (user_id);

-- 8. Branch settings: currency and time zone (used by reports and invoices).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency character(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Madrid';

-- 9. At most one default VAT rate.
UPDATE vat SET is_default = 'N'
WHERE is_default = 'Y'
  AND id <> (SELECT id FROM vat WHERE is_default = 'Y' ORDER BY created_at DESC, id LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS vat_single_default ON vat ((is_default)) WHERE is_default = 'Y';

-- 10. Report views, recreated per branch (they used to point at salon_demo).
--     These are kept only until the reports module is rebuilt (stage 3).
DROP VIEW IF EXISTS master_performance;
DROP VIEW IF EXISTS revenue_by_day;
DROP VIEW IF EXISTS revenue_by_master;
DROP VIEW IF EXISTS revenue_by_service;
DROP VIEW IF EXISTS cogs_report;

CREATE VIEW revenue_by_day AS
SELECT date(a.start_time) AS revenue_date,
       sum(s.price) AS revenue,
       count(a.id) AS appointments_completed
FROM appointments a
JOIN services s ON s.id = a.service_id
WHERE a.status = 'completed'
GROUP BY date(a.start_time);

CREATE VIEW revenue_by_master AS
SELECT m.id AS master_id, m.name AS master_name,
       sum(s.price) AS revenue,
       count(a.id) AS appointments_completed
FROM appointments a
JOIN services s ON s.id = a.service_id
JOIN masters m ON m.id = a.master_id
WHERE a.status = 'completed'
GROUP BY m.id, m.name;

CREATE VIEW revenue_by_service AS
SELECT s.id AS service_id, s.name AS service_name,
       sum(s.price) AS revenue,
       count(a.id) AS times_sold
FROM appointments a
JOIN services s ON s.id = a.service_id
WHERE a.status = 'completed'
GROUP BY s.id, s.name;

CREATE VIEW cogs_report AS
SELECT a.id AS appointment_id,
       date(a.start_time) AS appointment_date,
       m.id AS master_id, m.name AS master_name,
       s.id AS service_id, s.name AS service_name,
       s.price AS revenue,
       s.cost AS cogs,
       (s.price - s.cost) AS gross_margin,
       (s.price * m.commission / 100) AS commission_paid,
       (s.price - s.cost - s.price * m.commission / 100) AS net_margin,
       round((s.price - s.cost) / NULLIF(s.price, 0) * 100, 2) AS gross_margin_percent,
       round((s.price - s.cost - s.price * m.commission / 100) / NULLIF(s.price, 0) * 100, 2) AS net_margin_percent
FROM appointments a
JOIN services s ON s.id = a.service_id
JOIN masters m ON m.id = a.master_id
WHERE a.status = 'completed';

-- Fixed: revenue/margins now count completed appointments only (cancelled and
-- planned were included before), and masters without appointments are listed.
CREATE VIEW master_performance AS
WITH x AS (
  SELECT m.id AS master_id, m.name AS master_name, m.commission,
         COALESCE(sum(s.price) FILTER (WHERE a.status = 'completed'), 0) AS revenue,
         COALESCE(sum(s.price - s.cost) FILTER (WHERE a.status = 'completed'), 0) AS gross,
         COALESCE(sum(s.price - s.cost - s.price * m.commission / 100) FILTER (WHERE a.status = 'completed'), 0) AS net,
         count(a.id) FILTER (WHERE a.status = 'completed') AS completed,
         count(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled,
         count(a.id) FILTER (WHERE a.status = 'planned') AS planned,
         COALESCE(sum(EXTRACT(epoch FROM (a.end_time - a.start_time)) / 3600) FILTER (WHERE a.status = 'completed'), 0) AS hours
  FROM masters m
  LEFT JOIN appointments a ON a.master_id = m.id
  LEFT JOIN services s ON s.id = a.service_id
  GROUP BY m.id, m.name, m.commission
)
SELECT master_id, master_name,
       revenue AS revenue_generated,
       commission,
       gross AS gross_margin,
       net AS net_margin,
       completed AS appointments_completed,
       cancelled AS appointments_cancelled,
       planned AS appointments_planned,
       hours AS hours_worked,
       CASE WHEN hours > 0 THEN revenue / hours ELSE 0 END AS revenue_per_hour,
       CASE WHEN revenue > 0 THEN round(gross / revenue * 100, 2) ELSE 0 END AS margin_percent,
       CASE WHEN revenue > 0 THEN round(net / revenue * 100, 2) ELSE 0 END AS net_margin_percent
FROM x;

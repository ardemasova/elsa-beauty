-- Data the reports need, stored at the moment things happen so that later
-- changes to the price list or a master's commission do not rewrite history.
--
--  appointments.price / cost / commission_percent
--      copied from the service and the master when the appointment is
--      created, and again only when its service or master is changed.
--  payments.vat_amount / amount_net
--      payments.amount is the total INCLUDING VAT (as typed by the user);
--      the VAT contained in it is amount * rate / (100 + rate).
--  payments.unit_cost
--      purchase cost of a sold item at the time of the sale.
--
-- Existing rows are filled from today's prices: the best information there is.

-- 0. Legacy rows may break rules that were added later as NOT VALID (an
--    appointment ending when it starts, an old payment method such as
--    'transfer'). PostgreSQL re-checks such rules when a row is updated, so
--    the rules are lifted while the snapshots below are filled in and put back
--    (again NOT VALID) at the end. New and edited rows are still checked.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_time_order_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_type_check;

-- Payments without a direction were invisible in every total: derive it from
-- the partner (customer -> incoming, vendor -> outgoing).
UPDATE payments p
   SET type = CASE WHEN c.type = 'vendor' THEN 'outgoing' ELSE 'incoming' END
  FROM clients c
 WHERE c.id = p.partner_id AND p.type IS NULL;
UPDATE payments SET type = 'incoming' WHERE type IS NULL;
ALTER TABLE payments ALTER COLUMN type SET DEFAULT 'incoming';
ALTER TABLE payments ALTER COLUMN type SET NOT NULL;

-- 1. Appointment snapshots -----------------------------------------------------
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price numeric(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cost numeric(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2);

UPDATE appointments a
   SET price = s.price, cost = s.cost
  FROM services s
 WHERE s.id = a.service_id AND a.price IS NULL;

UPDATE appointments a
   SET commission_percent = m.commission
  FROM masters m
 WHERE m.id = a.master_id AND a.commission_percent IS NULL;

-- Trigger functions live in each branch schema but read the tables of the
-- schema the triggering table belongs to (TG_TABLE_SCHEMA), so they never
-- depend on the connection's search_path.
CREATE OR REPLACE FUNCTION appointment_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.price IS NULL THEN
    EXECUTE format('SELECT price, cost FROM %I.services WHERE id = $1', TG_TABLE_SCHEMA)
       INTO NEW.price, NEW.cost USING NEW.service_id;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.master_id IS DISTINCT FROM OLD.master_id OR NEW.commission_percent IS NULL THEN
    EXECUTE format('SELECT commission FROM %I.masters WHERE id = $1', TG_TABLE_SCHEMA)
       INTO NEW.commission_percent USING NEW.master_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS appointments_snapshot ON appointments;
CREATE TRIGGER appointments_snapshot
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointment_snapshot();

-- 2. Payment VAT split (computed by the database, always consistent) ----------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS vat_amount numeric(10,2)
  GENERATED ALWAYS AS (round(amount * COALESCE(vat_percent, 0) / (100 + COALESCE(vat_percent, 0)), 2)) STORED;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_net numeric(10,2)
  GENERATED ALWAYS AS (amount - round(amount * COALESCE(vat_percent, 0) / (100 + COALESCE(vat_percent, 0)), 2)) STORED;

-- 3. Item cost at the time of sale --------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2);

UPDATE payments p SET unit_cost = i.cost
  FROM items i WHERE i.id = p.item_id AND p.unit_cost IS NULL;

CREATE OR REPLACE FUNCTION payment_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.item_id IS NULL THEN
    NEW.unit_cost := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.unit_cost IS NULL THEN
    EXECUTE format('SELECT cost FROM %I.items WHERE id = $1', TG_TABLE_SCHEMA)
       INTO NEW.unit_cost USING NEW.item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_snapshot ON payments;
CREATE TRIGGER payments_snapshot
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_snapshot();

-- 4. Rules lifted in step 0 are back (old rows are not re-checked) -----------
ALTER TABLE appointments ADD CONSTRAINT appointments_time_order_check CHECK (end_time > start_time) NOT VALID;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('Card', 'Cash')) NOT VALID;
ALTER TABLE payments ADD CONSTRAINT payments_type_check CHECK (type IN ('incoming', 'outgoing')) NOT VALID;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM payments WHERE vat_percent IS NULL;
  IF n > 0 THEN
    RAISE WARNING 'Schema %: % payment(s) have no VAT rate and are counted as 0%% VAT in reports.', current_schema(), n;
  END IF;
END $$;

-- 5. Indexes for the report queries --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_type_paid_at ON payments (type, paid_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status_start ON appointments (status, start_time);

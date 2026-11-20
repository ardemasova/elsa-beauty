-- Invoice numbering and credit notes (facturas rectificativas).
--
--  * Every payment received from a customer is an invoice with a number from
--    a correlative series per branch and year: <prefix>-F-2026-0001.
--  * A credit note refunds all or part of an invoice. It is a payment with a
--    NEGATIVE amount, its own series (<prefix>-R-2026-0001) and a link to the
--    invoice it corrects (refund_of). It lowers income in the month it is
--    issued.
--  * The prefix tells the branches of one company apart (same NIF, different
--    series). It is set from the branch name and can be changed in Settings.

-- 0. Rules added earlier as NOT VALID are re-checked when old rows are
--    updated (numbering below); lift them meanwhile, restore at the end.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_type_check;

-- 1. Columns ---------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'payment';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_of uuid REFERENCES payments(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_document_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_document_type_check
  CHECK (document_type IN ('payment', 'credit_note'));

-- Only credit notes may be negative, and they must point to an invoice.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (
  (document_type = 'payment' AND amount >= 0 AND refund_of IS NULL)
  OR (document_type = 'credit_note' AND amount < 0 AND refund_of IS NOT NULL AND type = 'incoming')
);

-- Unique, but checkable at the end of a transaction so a whole series can be
-- renumbered in one statement (demo data, copied branches).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payments'::regclass AND conname = 'payments_document_number_key') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_document_number_key UNIQUE (document_number) DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_payments_refund_of ON payments (refund_of);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS invoice_prefix text;

-- Every branch needs a settings row (the numbering reads the prefix from it).
INSERT INTO settings (name)
SELECT t.name FROM public.tenants t
 WHERE t.schema_name = current_schema() AND NOT EXISTS (SELECT 1 FROM settings);

-- Default prefix: first 3 letters/digits of the branch name, made unique
-- among the branches of the same company ("LOL", "LOL2", ...): branches share
-- one NIF, so their invoice series must never produce the same number.
DO $$
DECLARE
  base text;
  cand text;
  acc uuid;
  k integer := 1;
  taken boolean;
  other record;
BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE invoice_prefix IS NOT NULL) THEN RETURN; END IF;
  SELECT NULLIF(upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 3)), ''), account_id
    INTO base, acc FROM public.tenants WHERE schema_name = current_schema();
  base := COALESCE(base, 'B');
  cand := base;
  LOOP
    taken := false;
    FOR other IN SELECT schema_name FROM public.tenants WHERE account_id = acc AND schema_name <> current_schema() LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = other.schema_name AND table_name = 'settings' AND column_name = 'invoice_prefix') THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.settings WHERE upper(invoice_prefix) = $1)', other.schema_name)
           INTO taken USING cand;
        EXIT WHEN taken;
      END IF;
    END LOOP;
    EXIT WHEN NOT taken;
    k := k + 1;
    cand := left(base, 5) || k;
  END LOOP;
  UPDATE settings SET invoice_prefix = cand;
END $$;

CREATE TABLE IF NOT EXISTS document_counters (
    series text NOT NULL,      -- 'F' invoices, 'R' credit notes
    year integer NOT NULL,
    last integer NOT NULL,
    PRIMARY KEY (series, year)
);

-- 2. Number for every new customer document ---------------------------------------
CREATE OR REPLACE FUNCTION payment_document_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tz text;
  prefix text;
  ser text;
  yr integer;
  n integer;
BEGIN
  IF NEW.type <> 'incoming' OR NEW.document_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT timezone, invoice_prefix FROM %I.settings ORDER BY created_at NULLS LAST LIMIT 1', TG_TABLE_SCHEMA)
     INTO tz, prefix;
  IF tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz) THEN
    tz := 'Europe/Madrid';
  END IF;
  ser := CASE WHEN NEW.document_type = 'credit_note' THEN 'R' ELSE 'F' END;
  yr := EXTRACT(year FROM (COALESCE(NEW.paid_at, now()) AT TIME ZONE tz))::integer;
  -- Atomic: concurrent inserts wait for each other on the counter row.
  EXECUTE format(
    'INSERT INTO %I.document_counters (series, year, last) VALUES ($1, $2, 1)
     ON CONFLICT (series, year) DO UPDATE SET last = %I.document_counters.last + 1
     RETURNING last', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
     INTO n USING ser, yr;
  NEW.document_number := concat_ws('-', NULLIF(prefix, ''), ser, yr::text, lpad(n::text, greatest(4, length(n::text)), '0'));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_document_number ON payments;
CREATE TRIGGER payments_document_number
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION payment_document_number();

-- 3. Number the existing customer payments in date order ---------------------------
DO $$
DECLARE
  prefix text;
  tz text;
BEGIN
  SELECT invoice_prefix, timezone INTO prefix, tz FROM settings ORDER BY created_at NULLS LAST LIMIT 1;
  IF tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz) THEN tz := 'Europe/Madrid'; END IF;

  WITH numbered AS (
    SELECT id,
           EXTRACT(year FROM (paid_at AT TIME ZONE tz))::integer AS yr,
           row_number() OVER (PARTITION BY EXTRACT(year FROM (paid_at AT TIME ZONE tz)) ORDER BY paid_at, id) AS n
      FROM payments
     WHERE type = 'incoming' AND document_number IS NULL AND document_type = 'payment'
  )
  UPDATE payments p
     SET document_number = concat_ws('-', NULLIF(prefix, ''), 'F', numbered.yr::text, lpad(numbered.n::text, greatest(4, length(numbered.n::text)), '0'))
    FROM numbered
   WHERE numbered.id = p.id;

  INSERT INTO document_counters (series, year, last)
  SELECT 'F', EXTRACT(year FROM (paid_at AT TIME ZONE tz))::integer, count(*)
    FROM payments WHERE type = 'incoming' AND document_type = 'payment'
   GROUP BY 2
  ON CONFLICT (series, year) DO UPDATE SET last = GREATEST(document_counters.last, EXCLUDED.last);
END $$;

-- 4. Item cost snapshot: keep a value given on insert (a credit note copies the
--    cost of the sale it refunds instead of today's cost).
CREATE OR REPLACE FUNCTION payment_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.item_id IS NULL THEN
    NEW.unit_cost := NULL;
  ELSIF (TG_OP = 'INSERT' AND NEW.unit_cost IS NULL)
     OR (TG_OP = 'UPDATE' AND (NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.unit_cost IS NULL)) THEN
    EXECUTE format('SELECT cost FROM %I.items WHERE id = $1', TG_TABLE_SCHEMA)
       INTO NEW.unit_cost USING NEW.item_id;
  END IF;
  RETURN NEW;
END $$;

-- 5. Restore the rules lifted in step 0 (old rows are not re-checked) ------------
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('Card', 'Cash')) NOT VALID;
ALTER TABLE payments ADD CONSTRAINT payments_type_check CHECK (type IN ('incoming', 'outgoing')) NOT VALID;

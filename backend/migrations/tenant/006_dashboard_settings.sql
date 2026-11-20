-- Branch settings used by the dashboard.
--   work_start / work_end  opening hours (same every working day for now)
--   work_days              ISO weekdays the salon is open: 1 = Monday ... 7 = Sunday
--   revenue_goal_month     money the salon aims to receive per month, incl. VAT;
--                          NULL = compare with the same dates last year instead
-- Masters are treated as available during opening hours, minus their days off.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS work_start time NOT NULL DEFAULT '10:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS work_end time NOT NULL DEFAULT '20:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS work_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS revenue_goal_month numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_work_hours_check' AND conrelid = 'settings'::regclass) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_work_hours_check CHECK (work_end > work_start);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_work_days_check' AND conrelid = 'settings'::regclass) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_work_days_check
      CHECK (cardinality(work_days) BETWEEN 1 AND 7 AND work_days <@ '{1,2,3,4,5,6,7}'::smallint[]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_revenue_goal_check' AND conrelid = 'settings'::regclass) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_revenue_goal_check CHECK (revenue_goal_month IS NULL OR revenue_goal_month >= 0);
  END IF;
END $$;

-- Dashboard lookups: a client's visits, and the masters' days off.
CREATE INDEX IF NOT EXISTS idx_appointments_client_start ON appointments (client_id, start_time);

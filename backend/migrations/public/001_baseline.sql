-- Baseline of the shared (public) schema.
-- Written to be safe on the existing production database: every statement is
-- "IF NOT EXISTS" / "ON CONFLICT DO NOTHING", so on a database that already has
-- these objects it changes nothing. On an empty database it creates them.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.plans (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    price_month integer,
    price_year integer,
    max_branches integer,
    max_masters integer,
    max_users integer
);

CREATE TABLE IF NOT EXISTS public.features (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plan_features (
    plan_id integer NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    feature_id integer NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, feature_id)
);

CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    schema_name text NOT NULL UNIQUE,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    plan_id integer REFERENCES public.plans(id)
);

CREATE TABLE IF NOT EXISTS public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'master')),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    name character varying,
    phone character varying,
    UNIQUE (tenant_id, email)
);

-- Reference data (same ids as production)
INSERT INTO public.features (id, code, name) VALUES
  (1, 'appointments', 'Appointments'),
  (2, 'dashboard', 'Dashboard'),
  (3, 'masters', 'Masters'),
  (4, 'users', 'Users'),
  (5, 'partners', 'Partners'),
  (6, 'items', 'Items'),
  (7, 'payments', 'Payments'),
  (8, 'invoices', 'Invoices'),
  (9, 'basic_reports', 'Basic Reports'),
  (10, 'advanced_reports', 'Advanced Reports'),
  (11, 'ai_basic', 'AI Assistant (Basic)'),
  (12, 'ai_pro_reports', 'AI Reports (Pro)'),
  (13, 'ai_pro_assistant', 'AI Assistant (Pro)'),
  (14, 'mobile_access', 'Mobile Access'),
  (15, 'priority_support', 'Priority Support'),
  (16, 'custom_features', 'Custom Features')
ON CONFLICT DO NOTHING;

INSERT INTO public.plans (id, code, name, price_month, price_year, max_branches, max_masters, max_users) VALUES
  (1, 'standard', 'Standard', 20, 200, 1, 5, 5),
  (2, 'pro', 'Pro', 50, 500, 3, 20, 20),
  (3, 'enterprise', 'Enterprise', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_id) VALUES
  (1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8),(1,9),(1,11),
  (2,1),(2,2),(2,3),(2,4),(2,5),(2,6),(2,7),(2,8),(2,9),(2,10),(2,11),(2,12),(2,13),(2,14),
  (3,1),(3,2),(3,3),(3,4),(3,5),(3,6),(3,7),(3,8),(3,9),(3,10),(3,11),(3,12),(3,13),(3,14),(3,15),(3,16)
ON CONFLICT DO NOTHING;

SELECT setval('public.features_id_seq', GREATEST((SELECT max(id) FROM public.features), 1));
SELECT setval('public.plans_id_seq', GREATEST((SELECT max(id) FROM public.plans), 1));

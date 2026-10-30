-- Accounts: one paying customer (a salon business) that owns one or more
-- tenants (branches). The plan now belongs to the account, so branch limits
-- (plans.max_branches) and user limits are checked per account.
--
-- Access model:
--   owner  - account level: all branches of the account, opens new branches,
--            manages users. Acts as "admin" inside any of its branches.
--   admin  - manages the branches listed for them in user_tenants.
--   master - works in the branches listed for them in user_tenants.

CREATE TABLE IF NOT EXISTS public.accounts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    plan_id integer NOT NULL REFERENCES public.plans(id),
    is_active boolean NOT NULL DEFAULT true,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.users   ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.user_tenants (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS user_tenants_tenant_idx ON public.user_tenants (tenant_id);

-- ---------------------------------------------------------------------------
-- Backfill: every existing tenant becomes its own account (keeps today's
-- behaviour: existing users keep access to exactly the branch they had).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  new_account uuid;
  default_plan integer;
BEGIN
  SELECT id INTO default_plan FROM public.plans WHERE code = 'standard';

  FOR t IN SELECT id, name, plan_id FROM public.tenants WHERE account_id IS NULL LOOP
    INSERT INTO public.accounts (name, plan_id, is_demo)
    VALUES (t.name, COALESCE(t.plan_id, default_plan), false)
    RETURNING id INTO new_account;

    UPDATE public.tenants SET account_id = new_account WHERE id = t.id;
  END LOOP;
END $$;

UPDATE public.users u
SET account_id = t.account_id
FROM public.tenants t
WHERE t.id = u.tenant_id AND u.account_id IS NULL;

INSERT INTO public.user_tenants (user_id, tenant_id)
SELECT id, tenant_id FROM public.users WHERE tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Email becomes the login (no more branch dropdown), so it must be unique
-- across the whole platform. Existing duplicates (same email registered in
-- several branches) are kept: the oldest keeps its email, the newer copies get
-- a "+dupN" suffix and are deactivated, so nothing is silently merged.
-- ---------------------------------------------------------------------------
-- The old per-branch rule is replaced by the global one below. Dropped first,
-- otherwise "Anna@x.com" + "anna@x.com" in one branch would block lowercasing.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_tenant_id_email_key;

DO $$
DECLARE
  r record;
  norm text;
BEGIN
  FOR r IN
    SELECT id, email, rn FROM (
      SELECT id, email,
             row_number() OVER (PARTITION BY lower(trim(email))
                                ORDER BY is_active DESC, created_at, id) AS rn
      FROM public.users
    ) x WHERE rn > 1
  LOOP
    norm := lower(trim(r.email));
    UPDATE public.users
    SET email = split_part(norm, '@', 1) || '+dup' || r.rn || '@' || split_part(norm, '@', 2),
        is_active = false
    WHERE id = r.id;
    RAISE WARNING 'Duplicate login % (user %) renamed to +dup% and deactivated', norm, r.id, r.rn;
  END LOOP;
END $$;

UPDATE public.users SET email = lower(trim(email)) WHERE email <> lower(trim(email));

-- Revocable sessions: bumping token_version logs the user out everywhere
-- (password change, deactivation).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users (lower(email));

ALTER TABLE public.tenants ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.users   ALTER COLUMN account_id SET NOT NULL;

-- users.tenant_id is now only "last used branch"; an owner may have none.
ALTER TABLE public.users ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_tenant_id_fkey;
ALTER TABLE public.users
  ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenants_account_idx ON public.tenants (account_id);
CREATE INDEX IF NOT EXISTS users_account_idx ON public.users (account_id);

-- This view lived in "public" but read salon_demo's tables. Nothing uses it
-- (reports read the per-branch view), and it could expose demo data.
DROP VIEW IF EXISTS public.master_performance;

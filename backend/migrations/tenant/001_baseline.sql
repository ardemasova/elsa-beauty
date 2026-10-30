-- Baseline of a branch (tenant) schema.
-- The runner executes this with search_path = <tenant schema>, public, so all
-- names below are unqualified and land in the branch's own schema.
-- Safe on existing branches (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name character varying(255),
    address text,
    vat_number character varying(50),
    bank_name character varying(255),
    bank_account character varying(50),
    bank_code character varying(20),
    email character varying(255),
    phone character varying(20),
    website character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    duration integer NOT NULL CONSTRAINT services_duration_minutes_check CHECK (duration > 0),
    price numeric(10,2) NOT NULL CONSTRAINT services_price_check CHECK (price >= 0),
    cost numeric(10,2) NOT NULL CONSTRAINT services_cost_check CHECK (cost >= 0),
    is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS masters (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    name text NOT NULL,
    commission numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    color character varying(7) DEFAULT '#3b82f6',
    photo_url text
);

CREATE TABLE IF NOT EXISTS clients (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    phone text,
    email text,
    created_at timestamptz DEFAULT now() NOT NULL,
    type character varying(20) DEFAULT 'customer',
    address text,
    vat_number character varying(50),
    bank_name character varying(255),
    bank_account character varying(50),
    bank_code character varying(20),
    photo_url text
);

CREATE TABLE IF NOT EXISTS items (
    id bigserial PRIMARY KEY,
    name character varying(255) NOT NULL,
    price numeric(12,2) NOT NULL,
    cost numeric(12,2) NOT NULL,
    unit character varying(50) NOT NULL,
    stock_qty numeric(14,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
    id bigserial PRIMARY KEY,
    name character varying(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS vat (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    percent numeric(5,2) NOT NULL CONSTRAINT vat_percent_check CHECK (percent >= 0 AND percent <= 100),
    is_default character(1) DEFAULT 'N' NOT NULL CONSTRAINT vat_is_default_check CHECK (is_default IN ('Y', 'N')),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    master_id uuid NOT NULL REFERENCES masters(id),
    client_id uuid REFERENCES clients(id),
    service_id uuid NOT NULL REFERENCES services(id),
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    status text NOT NULL CONSTRAINT appointments_status_check CHECK (status IN ('planned', 'completed', 'cancelled')),
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id uuid REFERENCES appointments(id),
    amount numeric(10,2) NOT NULL CONSTRAINT payments_amount_check CHECK (amount >= 0),
    method text NOT NULL,
    paid_at timestamptz DEFAULT now() NOT NULL,
    type character varying(20) DEFAULT 'incoming',
    partner_id uuid NOT NULL,
    item_id bigint,
    qty integer DEFAULT 1 NOT NULL,
    vat_percent numeric(5,2),
    expense_id bigint
);

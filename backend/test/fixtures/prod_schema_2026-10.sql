--
-- PostgreSQL database dump
--


-- Dumped from database version 15.16 (Debian 15.16-1.pgdg13+1)
-- Dumped by pg_dump version 15.16 (Debian 15.16-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: demo_hospi; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA demo_hospi;


--
-- Name: salon_demo; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA salon_demo;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appointments; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    master_id uuid NOT NULL,
    client_id uuid NOT NULL,
    service_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: clients; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(20) DEFAULT 'customer'::character varying,
    address text,
    vat_number character varying(50),
    bank_name character varying(255),
    bank_account character varying(50),
    bank_code character varying(20),
    photo_url text
);


--
-- Name: expenses; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.expenses (
    id bigint NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: demo_hospi; Owner: -
--

CREATE SEQUENCE demo_hospi.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: demo_hospi; Owner: -
--

ALTER SEQUENCE demo_hospi.expenses_id_seq OWNED BY demo_hospi.expenses.id;


--
-- Name: items; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.items (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(12,2) NOT NULL,
    cost numeric(12,2) NOT NULL,
    unit character varying(50) NOT NULL,
    stock_qty numeric(14,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: items_id_seq; Type: SEQUENCE; Schema: demo_hospi; Owner: -
--

CREATE SEQUENCE demo_hospi.items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: demo_hospi; Owner: -
--

ALTER SEQUENCE demo_hospi.items_id_seq OWNED BY demo_hospi.items.id;


--
-- Name: masters; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.masters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    commission numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    color character varying(7) DEFAULT '#3b82f6'::character varying,
    photo_url text
);


--
-- Name: payments; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid,
    amount numeric(10,2) NOT NULL,
    method text NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(20) DEFAULT 'incoming'::character varying,
    partner_id uuid NOT NULL,
    item_id integer,
    qty integer DEFAULT 1 NOT NULL,
    vat_percent numeric(5,2),
    expense_id bigint,
    CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text])))
);


--
-- Name: services; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    duration integer NOT NULL,
    price numeric(10,2) NOT NULL,
    cost numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT services_cost_check CHECK ((cost >= (0)::numeric)),
    CONSTRAINT services_duration_minutes_check CHECK ((duration > 0)),
    CONSTRAINT services_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: settings; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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


--
-- Name: vat; Type: TABLE; Schema: demo_hospi; Owner: -
--

CREATE TABLE demo_hospi.vat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    percent numeric(5,2) NOT NULL,
    is_default character(1) DEFAULT 'N'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vat_is_default_check CHECK ((is_default = ANY (ARRAY['Y'::bpchar, 'N'::bpchar]))),
    CONSTRAINT vat_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric)))
);


--
-- Name: features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.features (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL
);


--
-- Name: features_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: features_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.features_id_seq OWNED BY public.features.id;


--
-- Name: appointments; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    master_id uuid NOT NULL,
    client_id uuid,
    service_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: masters; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.masters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    commission numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    color character varying(7) DEFAULT '#3b82f6'::character varying,
    photo_url text
);


--
-- Name: services; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    duration integer NOT NULL,
    price numeric(10,2) NOT NULL,
    cost numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT services_cost_check CHECK ((cost >= (0)::numeric)),
    CONSTRAINT services_duration_minutes_check CHECK ((duration > 0)),
    CONSTRAINT services_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: master_performance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.master_performance AS
 SELECT m.id AS master_id,
    m.name AS master_name,
    sum(s.price) AS revenue_generated,
    sum(((s.price * m.commission) / (100)::numeric)) AS commission,
    sum((s.price - s.cost)) AS gross_margin,
    count(a.id) FILTER (WHERE (a.status = 'completed'::text)) AS appointments_completed,
    count(a.id) FILTER (WHERE (a.status = 'cancelled'::text)) AS appointments_cancelled,
    count(a.id) FILTER (WHERE (a.status = 'planned'::text)) AS appointments_planned,
    sum((EXTRACT(epoch FROM (a.end_time - a.start_time)) / (3600)::numeric)) FILTER (WHERE (a.status = 'completed'::text)) AS hours_worked,
        CASE
            WHEN (sum((EXTRACT(epoch FROM (a.end_time - a.start_time)) / (3600)::numeric)) > (0)::numeric) THEN (sum(s.price) / sum((EXTRACT(epoch FROM (a.end_time - a.start_time)) / (3600)::numeric)))
            ELSE (0)::numeric
        END AS revenue_per_hour,
        CASE
            WHEN (sum(s.price) > (0)::numeric) THEN round(((sum((s.price - s.cost)) / sum(s.price)) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS margin_percent
   FROM ((salon_demo.masters m
     LEFT JOIN salon_demo.appointments a ON ((a.master_id = m.id)))
     LEFT JOIN salon_demo.services s ON ((s.id = a.service_id)))
  WHERE (a.status = ANY (ARRAY['completed'::text, 'planned'::text, 'cancelled'::text]))
  GROUP BY m.id, m.name
  ORDER BY (sum(s.price)) DESC;


--
-- Name: plan_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_features (
    plan_id integer NOT NULL,
    feature_id integer NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    price_month integer,
    price_year integer,
    max_branches integer,
    max_masters integer,
    max_users integer
);


--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    schema_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_id integer
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying,
    phone character varying,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'master'::text])))
);


--
-- Name: clients; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(20) DEFAULT 'customer'::character varying,
    address text,
    vat_number character varying(50),
    bank_name character varying(255),
    bank_account character varying(50),
    bank_code character varying(20),
    photo_url text
);


--
-- Name: cogs_report; Type: VIEW; Schema: salon_demo; Owner: -
--

CREATE VIEW salon_demo.cogs_report AS
 SELECT a.id AS appointment_id,
    date(a.start_time) AS appointment_date,
    m.id AS master_id,
    m.name AS master_name,
    s.id AS service_id,
    s.name AS service_name,
    s.price AS revenue,
    s.cost AS cogs,
    (s.price - s.cost) AS gross_margin,
    ((s.price * m.commission) / (100)::numeric) AS commission_paid,
    ((s.price - s.cost) - ((s.price * m.commission) / (100)::numeric)) AS net_margin,
    round((((s.price - s.cost) / s.price) * (100)::numeric), 2) AS gross_margin_percent,
    round(((((s.price - s.cost) - ((s.price * m.commission) / (100)::numeric)) / s.price) * (100)::numeric), 2) AS net_margin_percent
   FROM ((salon_demo.appointments a
     JOIN salon_demo.services s ON ((s.id = a.service_id)))
     JOIN salon_demo.masters m ON ((m.id = a.master_id)))
  WHERE (a.status = 'completed'::text)
  ORDER BY (date(a.start_time)), m.id;


--
-- Name: expenses; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.expenses (
    id bigint NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: salon_demo; Owner: -
--

CREATE SEQUENCE salon_demo.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: salon_demo; Owner: -
--

ALTER SEQUENCE salon_demo.expenses_id_seq OWNED BY salon_demo.expenses.id;


--
-- Name: items; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.items (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(12,2) NOT NULL,
    cost numeric(12,2) NOT NULL,
    unit character varying(50) NOT NULL,
    stock_qty numeric(14,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: items_id_seq; Type: SEQUENCE; Schema: salon_demo; Owner: -
--

CREATE SEQUENCE salon_demo.items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: salon_demo; Owner: -
--

ALTER SEQUENCE salon_demo.items_id_seq OWNED BY salon_demo.items.id;


--
-- Name: master_performance; Type: VIEW; Schema: salon_demo; Owner: -
--

CREATE VIEW salon_demo.master_performance AS
SELECT
    NULL::uuid AS master_id,
    NULL::text AS master_name,
    NULL::numeric AS revenue_generated,
    NULL::numeric(5,2) AS commission,
    NULL::numeric AS gross_margin,
    NULL::numeric AS net_margin,
    NULL::bigint AS appointments_completed,
    NULL::bigint AS appointments_cancelled,
    NULL::bigint AS appointments_planned,
    NULL::numeric AS hours_worked,
    NULL::numeric AS revenue_per_hour,
    NULL::numeric AS margin_percent,
    NULL::numeric AS net_margin_percent;


--
-- Name: payments; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid,
    amount numeric(10,2) NOT NULL,
    method text NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(20) DEFAULT 'incoming'::character varying,
    partner_id uuid NOT NULL,
    item_id integer,
    qty integer DEFAULT 1 NOT NULL,
    vat_percent numeric(5,2),
    expense_id bigint,
    CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: revenue_by_day; Type: VIEW; Schema: salon_demo; Owner: -
--

CREATE VIEW salon_demo.revenue_by_day AS
 SELECT date(a.start_time) AS revenue_date,
    sum(s.price) AS revenue,
    count(a.id) AS appointments_completed
   FROM (salon_demo.appointments a
     JOIN salon_demo.services s ON ((s.id = a.service_id)))
  WHERE (a.status = 'completed'::text)
  GROUP BY (date(a.start_time))
  ORDER BY (date(a.start_time));


--
-- Name: revenue_by_master; Type: VIEW; Schema: salon_demo; Owner: -
--

CREATE VIEW salon_demo.revenue_by_master AS
 SELECT m.id AS master_id,
    m.name AS master_name,
    sum(s.price) AS revenue,
    count(a.id) AS appointments_completed
   FROM ((salon_demo.appointments a
     JOIN salon_demo.services s ON ((s.id = a.service_id)))
     JOIN salon_demo.masters m ON ((m.id = a.master_id)))
  WHERE (a.status = 'completed'::text)
  GROUP BY m.id, m.name
  ORDER BY (sum(s.price)) DESC;


--
-- Name: revenue_by_service; Type: VIEW; Schema: salon_demo; Owner: -
--

CREATE VIEW salon_demo.revenue_by_service AS
 SELECT s.id AS service_id,
    s.name AS service_name,
    sum(s.price) AS revenue,
    count(a.id) AS times_sold
   FROM (salon_demo.appointments a
     JOIN salon_demo.services s ON ((s.id = a.service_id)))
  WHERE (a.status = 'completed'::text)
  GROUP BY s.id, s.name
  ORDER BY (sum(s.price)) DESC;


--
-- Name: settings; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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


--
-- Name: vat; Type: TABLE; Schema: salon_demo; Owner: -
--

CREATE TABLE salon_demo.vat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    percent numeric(5,2) NOT NULL,
    is_default character(1) DEFAULT 'N'::bpchar NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vat_is_default_check CHECK ((is_default = ANY (ARRAY['Y'::bpchar, 'N'::bpchar]))),
    CONSTRAINT vat_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric)))
);


--
-- Name: expenses id; Type: DEFAULT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.expenses ALTER COLUMN id SET DEFAULT nextval('demo_hospi.expenses_id_seq'::regclass);


--
-- Name: items id; Type: DEFAULT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.items ALTER COLUMN id SET DEFAULT nextval('demo_hospi.items_id_seq'::regclass);


--
-- Name: features id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features ALTER COLUMN id SET DEFAULT nextval('public.features_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.expenses ALTER COLUMN id SET DEFAULT nextval('salon_demo.expenses_id_seq'::regclass);


--
-- Name: items id; Type: DEFAULT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.items ALTER COLUMN id SET DEFAULT nextval('salon_demo.items_id_seq'::regclass);


--
-- Name: appointments appointments_master_id_tstzrange_excl; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.appointments
    ADD CONSTRAINT appointments_master_id_tstzrange_excl EXCLUDE USING gist (master_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE ((status <> 'cancelled'::text));


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: masters masters_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: vat vat_pkey; Type: CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.vat
    ADD CONSTRAINT vat_pkey PRIMARY KEY (id);


--
-- Name: features features_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_code_key UNIQUE (code);


--
-- Name: features features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features
    ADD CONSTRAINT features_pkey PRIMARY KEY (id);


--
-- Name: plan_features plan_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_pkey PRIMARY KEY (plan_id, feature_id);


--
-- Name: plans plans_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_code_key UNIQUE (code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_schema_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_schema_name_key UNIQUE (schema_name);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_tenant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: settings company_settings_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: masters masters_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: vat vat_pkey; Type: CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.vat
    ADD CONSTRAINT vat_pkey PRIMARY KEY (id);


--
-- Name: clients_type_idx; Type: INDEX; Schema: demo_hospi; Owner: -
--

CREATE INDEX clients_type_idx ON demo_hospi.clients USING btree (type);


--
-- Name: idx_clients_type; Type: INDEX; Schema: demo_hospi; Owner: -
--

CREATE INDEX idx_clients_type ON demo_hospi.clients USING btree (type);


--
-- Name: idx_payments_paid_at; Type: INDEX; Schema: demo_hospi; Owner: -
--

CREATE INDEX idx_payments_paid_at ON demo_hospi.payments USING btree (paid_at DESC);


--
-- Name: no_overlap_per_master; Type: INDEX; Schema: demo_hospi; Owner: -
--

CREATE INDEX no_overlap_per_master ON demo_hospi.appointments USING gist (master_id, tstzrange(start_time, end_time)) WHERE (status <> 'cancelled'::text);


--
-- Name: payments_paid_at_idx; Type: INDEX; Schema: demo_hospi; Owner: -
--

CREATE INDEX payments_paid_at_idx ON demo_hospi.payments USING btree (paid_at DESC);


--
-- Name: idx_clients_type; Type: INDEX; Schema: salon_demo; Owner: -
--

CREATE INDEX idx_clients_type ON salon_demo.clients USING btree (type);


--
-- Name: idx_payments_paid_at; Type: INDEX; Schema: salon_demo; Owner: -
--

CREATE INDEX idx_payments_paid_at ON salon_demo.payments USING btree (paid_at DESC);


--
-- Name: master_performance _RETURN; Type: RULE; Schema: salon_demo; Owner: -
--

CREATE OR REPLACE VIEW salon_demo.master_performance AS
 SELECT m.id AS master_id,
    m.name AS master_name,
    sum(s.price) AS revenue_generated,
    m.commission,
    sum((s.price - s.cost)) AS gross_margin,
    sum(((s.price - s.cost) - ((s.price * m.commission) / (100)::numeric))) AS net_margin,
    count(a.id) FILTER (WHERE (a.status = 'completed'::text)) AS appointments_completed,
    count(a.id) FILTER (WHERE (a.status = 'cancelled'::text)) AS appointments_cancelled,
    count(a.id) FILTER (WHERE (a.status = 'planned'::text)) AS appointments_planned,
    sum((EXTRACT(epoch FROM (a.end_time - a.start_time)) / (3600)::numeric)) FILTER (WHERE (a.status = 'completed'::text)) AS hours_worked,
        CASE
            WHEN (sum((EXTRACT(epoch FROM (a.end_time - a.start_time)) / (3600)::numeric)) > (0)::numeric) THEN (sum(s.price) / sum((EXTRACT(epoch FROM (a.end_time - a.start_time)) / (3600)::numeric)))
            ELSE (0)::numeric
        END AS revenue_per_hour,
        CASE
            WHEN (sum(s.price) > (0)::numeric) THEN round(((sum((s.price - s.cost)) / sum(s.price)) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS margin_percent,
        CASE
            WHEN (sum(s.price) > (0)::numeric) THEN round(((sum(((s.price - s.cost) - ((s.price * m.commission) / (100)::numeric))) / sum(s.price)) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS net_margin_percent
   FROM ((salon_demo.masters m
     LEFT JOIN salon_demo.appointments a ON ((a.master_id = m.id)))
     LEFT JOIN salon_demo.services s ON ((s.id = a.service_id)))
  WHERE (a.status = ANY (ARRAY['completed'::text, 'planned'::text, 'cancelled'::text]))
  GROUP BY m.id, m.name
  ORDER BY (sum(s.price)) DESC;


--
-- Name: appointments appointments_client_id_fkey; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.appointments
    ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES demo_hospi.clients(id);


--
-- Name: appointments appointments_master_id_fkey; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.appointments
    ADD CONSTRAINT appointments_master_id_fkey FOREIGN KEY (master_id) REFERENCES demo_hospi.masters(id);


--
-- Name: appointments appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.appointments
    ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES demo_hospi.services(id);


--
-- Name: payments fk_partner_id; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.payments
    ADD CONSTRAINT fk_partner_id FOREIGN KEY (partner_id) REFERENCES demo_hospi.clients(id) ON DELETE CASCADE;


--
-- Name: payments fk_payments_expense; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.payments
    ADD CONSTRAINT fk_payments_expense FOREIGN KEY (expense_id) REFERENCES demo_hospi.expenses(id);


--
-- Name: payments payments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.payments
    ADD CONSTRAINT payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES demo_hospi.appointments(id);


--
-- Name: payments payments_item_id_fkey; Type: FK CONSTRAINT; Schema: demo_hospi; Owner: -
--

ALTER TABLE ONLY demo_hospi.payments
    ADD CONSTRAINT payments_item_id_fkey FOREIGN KEY (item_id) REFERENCES demo_hospi.items(id);


--
-- Name: plan_features plan_features_feature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.features(id) ON DELETE CASCADE;


--
-- Name: plan_features plan_features_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: tenants tenants_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_client_id_fkey; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.appointments
    ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES salon_demo.clients(id);


--
-- Name: appointments appointments_master_id_fkey; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.appointments
    ADD CONSTRAINT appointments_master_id_fkey FOREIGN KEY (master_id) REFERENCES salon_demo.masters(id);


--
-- Name: appointments appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.appointments
    ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES salon_demo.services(id);


--
-- Name: payments fk_partner_id; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.payments
    ADD CONSTRAINT fk_partner_id FOREIGN KEY (partner_id) REFERENCES salon_demo.clients(id) ON DELETE CASCADE;


--
-- Name: payments fk_payments_expense; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.payments
    ADD CONSTRAINT fk_payments_expense FOREIGN KEY (expense_id) REFERENCES salon_demo.expenses(id);


--
-- Name: payments payments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.payments
    ADD CONSTRAINT payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES salon_demo.appointments(id);


--
-- Name: payments payments_item_id_fkey; Type: FK CONSTRAINT; Schema: salon_demo; Owner: -
--

ALTER TABLE ONLY salon_demo.payments
    ADD CONSTRAINT payments_item_id_fkey FOREIGN KEY (item_id) REFERENCES salon_demo.items(id);


--
-- PostgreSQL database dump complete
--



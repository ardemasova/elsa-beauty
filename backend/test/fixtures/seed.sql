INSERT INTO public.tenants (id,name,schema_name,plan_id) VALUES
 ('11111111-1111-1111-1111-111111111111','Salon Demo','salon_demo',2),
 ('22222222-2222-2222-2222-222222222222','Demo Hospi','demo_hospi',NULL);
-- password for all: "password123"
INSERT INTO public.users (id,tenant_id,email,password_hash,role,name) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin@demo.com', crypt('password123', gen_salt('bf',10)),'admin','Admin Demo'),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','master@demo.com',crypt('password123', gen_salt('bf',10)),'master','Master One'),
 ('aaaaaaaa-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','Admin@Demo.com', crypt('password123', gen_salt('bf',10)),'admin','Dup admin'),
 ('aaaaaaaa-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','hospi@demo.com', crypt('password123', gen_salt('bf',10)),'admin','Hospi admin');
SET search_path TO salon_demo, public;
INSERT INTO services (id,name,duration,price,cost) VALUES ('5e000000-0000-0000-0000-000000000001','Haircut',60,40,5),('5e000000-0000-0000-0000-000000000002','Day Off',480,0,0);
INSERT INTO masters (id,user_id,name,commission) VALUES ('ae000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','Master One',30),('ae000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Admin As Master',20);
INSERT INTO clients (id,name,phone,type,bank_account) VALUES ('c0000000-0000-0000-0000-000000000001','Client A','600','customer',NULL),('c0000000-0000-0000-0000-000000000002','Vendor B','700','vendor','ES12345');
INSERT INTO items (name,price,cost,unit) VALUES ('Shampoo',10,4,'pcs');
INSERT INTO expenses (name) VALUES ('Rent');
INSERT INTO vat (percent,is_default) VALUES (21,'Y'),(10,'Y');
INSERT INTO appointments (id,master_id,client_id,service_id,start_time,end_time,status) VALUES
 ('a0000000-0000-0000-0000-000000000001','ae000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001','2026-10-01 10:00+00','2026-10-01 11:00+00','completed'),
 ('a0000000-0000-0000-0000-000000000002','ae000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001','2026-10-02 10:00+00','2026-10-02 11:00+00','cancelled');
INSERT INTO payments (appointment_id,amount,method,type,partner_id) VALUES ('a0000000-0000-0000-0000-000000000001',40,'Card','incoming','c0000000-0000-0000-0000-000000000001');
INSERT INTO payments (amount,method,type,partner_id,expense_id) VALUES (500,'cash','outgoing','c0000000-0000-0000-0000-000000000002',1);
SET search_path TO demo_hospi, public;
INSERT INTO clients (id,name) VALUES ('c0000000-0000-0000-0000-000000000009','Hospi client');
INSERT INTO payments (amount,method,partner_id) VALUES (10,'cash','c0000000-0000-0000-0000-000000000009');

-- Legacy problems seen in old data -------------------------------------------
-- (1) same email differing only in case inside one branch
INSERT INTO public.users (id,tenant_id,email,password_hash,role) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','Case@demo.com', crypt('password123', gen_salt('bf',10)),'master'),
 ('aaaaaaaa-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','case@demo.com', crypt('password123', gen_salt('bf',10)),'master');
-- (2) branch created by the old API without item FK + payment pointing to a deleted item
ALTER TABLE salon_demo.payments DROP CONSTRAINT IF EXISTS payments_item_id_fkey;
INSERT INTO salon_demo.payments (amount,method,type,partner_id,item_id) VALUES (5,'Cash','incoming','c0000000-0000-0000-0000-000000000001',999);
-- (3) a master who works in two branches
INSERT INTO public.users (id,tenant_id,email,password_hash,role) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','shared@demo.com', crypt('password123', gen_salt('bf',10)),'master');
-- (4) legacy payment method the app no longer accepts
INSERT INTO salon_demo.payments (amount,method,type,partner_id) VALUES (7,'transfer','incoming','c0000000-0000-0000-0000-000000000001');

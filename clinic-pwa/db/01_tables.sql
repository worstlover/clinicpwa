-- جدول‌های انبارگردانی
create table if not exists inv_sessions (
    id bigserial primary key,
    code text unique not null,
    title text,
    started_at timestamptz default now(),
    finished_at timestamptz,
    status text default 'in_progress',
    notes text
);

create table if not exists inv_count_items (
    id bigserial primary key,
    session_id bigint not null references inv_sessions(id) on delete cascade,
    drug_id bigint not null,
    drug_name text,
    batch_number text,
    expiry_date date,
    counted_quantity integer not null default 0,
    barcode text,
    counted_at timestamptz default now(),
    unique(session_id, drug_id, batch_number, expiry_date)
);

create table if not exists inv_discrepancies (
    id bigserial primary key,
    session_id bigint not null references inv_sessions(id) on delete cascade,
    drug_id bigint not null,
    drug_name text,
    system_quantity integer not null default 0,
    counted_quantity integer not null default 0,
    status text default 'pending',
    unique(session_id, drug_id)
);

-- جدول‌های تحویل دارو
create table if not exists disp_orders (
    id bigserial primary key,
    code text unique not null,
    patient_id bigint,
    patient_name text,
    patient_national text,
    prescription_code text,
    doctor_name text,
    status text default 'draft',
    created_at timestamptz default now(),
    finalized_at timestamptz,
    notes text
);

create table if not exists disp_items (
    id bigserial primary key,
    order_id bigint not null references disp_orders(id) on delete cascade,
    drug_id bigint not null,
    drug_name text,
    requested_quantity integer not null default 1,
    dispensed_quantity integer not null default 0,
    barcode text,
    notes text,
    created_at timestamptz default now()
);

create table if not exists disp_batch_allocations (
    id bigserial primary key,
    dispense_item_id bigint not null references disp_items(id) on delete cascade,
    batch_id bigint not null,
    batch_number text,
    expiry_date date,
    quantity integer not null,
    created_at timestamptz default now()
);

-- جدول ادمین‌ها
create table if not exists pwa_admins (
    email text primary key,
    full_name text,
    created_at timestamptz default now()
);
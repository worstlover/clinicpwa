-- View موجودی
create or replace view v_drug_stock as
select
    d.id as drug_id, d.name as drug_name, d.generic_name,
    d.form, d.drug_code, d.reorder_point, d.min_stock_alert,
    coalesce(sum(b.quantity), 0)::int as total_quantity,
    count(b.id) filter (where b.quantity > 0) as active_batches,
    min(b.expiry_date) filter (where b.quantity > 0) as nearest_expiry
from drugs_drug d
left join drugs_drugbatch b on b.drug_id = d.id
group by d.id, d.name, d.generic_name, d.form, d.drug_code, d.reorder_point, d.min_stock_alert;

-- View سفارشات در راه
create or replace view v_drug_pending as
select drug_id, coalesce(sum(requested_quantity - received_quantity), 0)::int as pending_qty
from drugs_drugrequestitem
where is_closed = false
group by drug_id;

-- تولید کد جلسه انبارگردانی
create or replace function gen_inv_code() returns text as $$
declare today text; seq int;
begin
    today := to_char(now() at time zone 'Asia/Tehran', 'YYYYMMDD');
    select coalesce(max(substring(code from 14)::int), 0) + 1 into seq
      from inv_sessions where code like 'INV-' || today || '-%';
    return 'INV-' || today || '-' || lpad(seq::text, 4, '0');
end; $$ language plpgsql;

-- تولید کد تحویل
create or replace function gen_disp_code() returns text as $$
declare today text; seq int;
begin
    today := to_char(now() at time zone 'Asia/Tehran', 'YYYYMMDD');
    select coalesce(max(substring(code from 14)::int), 0) + 1 into seq
      from disp_orders where code like 'DSP-' || today || '-%';
    return 'DSP-' || today || '-' || lpad(seq::text, 4, '0');
end; $$ language plpgsql;

-- کسر FIFO
create or replace function deduct_stock_fifo(p_drug_id bigint, p_quantity integer)
returns table (batch_id bigint, batch_number text, expiry_date date, deducted integer) as $$
declare v_remaining integer := p_quantity; v_batch record;
begin
    for v_batch in
        select id, batch_number, expiry_date, quantity
        from drugs_drugbatch
        where drug_id = p_drug_id and quantity > 0
        order by expiry_date asc nulls last, id asc
        for update
    loop
        exit when v_remaining <= 0;
        if v_batch.quantity >= v_remaining then
            update drugs_drugbatch set quantity = quantity - v_remaining where id = v_batch.id;
            return query select v_batch.id, v_batch.batch_number, v_batch.expiry_date, v_remaining;
            v_remaining := 0;
        else
            update drugs_drugbatch set quantity = 0 where id = v_batch.id;
            return query select v_batch.id, v_batch.batch_number, v_batch.expiry_date, v_batch.quantity;
            v_remaining := v_remaining - v_batch.quantity;
        end if;
    end loop;
    if v_remaining > 0 then raise exception 'موجودی کافی نیست. کمبود: %', v_remaining; end if;
end; $$ language plpgsql;

-- تخصیص FIFO به سفارشات
create or replace function allocate_to_requests(
    p_drug_id bigint, p_quantity integer, p_force_close boolean default false
) returns jsonb as $$
declare v_remaining integer := p_quantity; v_req record; v_needed integer; v_allocated integer;
begin
    for v_req in
        select id, requested_quantity, received_quantity
        from drugs_drugrequestitem
        where drug_id = p_drug_id and is_closed = false
        order by id for update
    loop
        exit when v_remaining <= 0;
        v_needed := v_req.requested_quantity - v_req.received_quantity;
        if v_needed <= 0 then
            update drugs_drugrequestitem set is_closed = true where id = v_req.id;
            continue;
        end if;
        v_allocated := least(v_remaining, v_needed);
        update drugs_drugrequestitem
        set received_quantity = received_quantity + v_allocated,
            is_closed = (received_quantity + v_allocated >= requested_quantity) or p_force_close
        where id = v_req.id;
        v_remaining := v_remaining - v_allocated;
    end loop;
    return jsonb_build_object('ok', true, 'allocated', p_quantity - v_remaining);
end; $$ language plpgsql;

-- اعمال انبارگردانی (فقط ادمین)
create or replace function apply_inventory_count(p_session_id bigint)
returns jsonb as $$
declare
    v_email text; v_is_admin boolean; v_item record; v_batch_id bigint; v_applied integer := 0;
begin
    v_email := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '');
    select exists(select 1 from pwa_admins where email = v_email) into v_is_admin;
    if not v_is_admin then raise exception 'دسترسی ندارید'; end if;

    for v_item in select * from inv_count_items where session_id = p_session_id loop
        v_batch_id := null;
        if v_item.batch_number is not null and v_item.batch_number <> '' then
            select id into v_batch_id from drugs_drugbatch
            where drug_id = v_item.drug_id and batch_number = v_item.batch_number limit 1;
        end if;
        if v_batch_id is not null then
            update drugs_drugbatch set quantity = v_item.counted_quantity,
                expiry_date = coalesce(v_item.expiry_date, expiry_date)
            where id = v_batch_id;
        elsif v_item.counted_quantity > 0 then
            insert into drugs_drugbatch (drug_id, batch_number, expiry_date, quantity, is_active, notes)
            values (v_item.drug_id,
                coalesce(nullif(v_item.batch_number,''), 'INV-'||p_session_id::text||'-'||v_item.id::text),
                coalesce(v_item.expiry_date, current_date + interval '2 years'),
                v_item.counted_quantity, true, 'انبارگردانی جلسه '||p_session_id::text);
        end if;
        v_applied := v_applied + 1;
    end loop;

    update inv_sessions set status='applied', finished_at=now() where id=p_session_id;
    return jsonb_build_object('ok', true, 'applied', v_applied);
end; $$ language plpgsql security definer;

grant execute on function allocate_to_requests(bigint, integer, boolean) to authenticated;
grant execute on function apply_inventory_count(bigint) to authenticated;
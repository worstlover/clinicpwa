alter table pwa_admins enable row level security;
drop policy if exists "read_admins" on pwa_admins;
create policy "read_admins" on pwa_admins for select to authenticated using (true);

-- RLS برای جدول‌های جدید
do $$ declare t text;
begin
    for t in select unnest(array[
        'inv_sessions','inv_count_items','inv_discrepancies',
        'disp_orders','disp_items','disp_batch_allocations'
    ]) loop
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists "auth_all" on %I', t);
        execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
    end loop;
end $$;

-- کاربر تست را ادمین کن
insert into pwa_admins (email, full_name)
values ('scanner@clinic.local', 'اپراتور تست')
on conflict do nothing;
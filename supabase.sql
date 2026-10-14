-- Ejecuta este script en Supabase > SQL Editor.
-- Crea las tablas, roles, auditoría de inventario, permisos y publicación Realtime.
-- No expongas una clave service_role en la aplicación.

create table if not exists public.racks (
  id text primary key,
  code text not null,
  levels integer not null default 5,
  "disabledLevels" integer[] not null default '{}',
  "createdAt" timestamptz
);
alter table public.racks add column if not exists "disabledLevels" integer[] not null default '{}';

create table if not exists public.locations (
  id text primary key,
  code text not null unique,
  "rackId" text,
  level integer,
  "position" integer,
  capacity integer default 1,
  "createdAt" timestamptz
);

create table if not exists public.pallets (
  id text primary key,
  code text not null unique,
  "locationId" text,
  description text not null,
  brand text,
  boxes integer not null default 0,
  products jsonb not null default '[]'::jsonb,
  notes text,
  status text not null default 'active',
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  created_by uuid,
  created_by_email text,
  updated_by uuid,
  updated_by_email text
);

alter table public.pallets add column if not exists products jsonb not null default '[]'::jsonb;
alter table public.pallets add column if not exists created_by uuid;
alter table public.pallets add column if not exists created_by_email text;
alter table public.pallets add column if not exists updated_by uuid;
alter table public.pallets add column if not exists updated_by_email text;
alter table public.pallets add column if not exists placed_by uuid;
alter table public.pallets add column if not exists placed_by_email text;
alter table public.pallets add column if not exists placed_at timestamptz;
update public.pallets set placed_by = coalesce(placed_by, updated_by, created_by),
  placed_by_email = coalesce(placed_by_email, updated_by_email, created_by_email),
  placed_at = coalesce(placed_at, "updatedAt", "createdAt")
where placed_at is null;

create table if not exists public.moves (
  id text primary key,
  action text,
  "palletId" text,
  "from" text,
  "to" text,
  details text,
  at timestamptz,
  actor_id uuid,
  actor_email text
);

alter table public.moves add column if not exists actor_id uuid;
alter table public.moves add column if not exists actor_email text;
alter table public.moves add column if not exists products jsonb not null default '[]'::jsonb;
create index if not exists moves_at_idx on public.moves (at desc);
create index if not exists moves_action_idx on public.moves (action);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'operator' check (role in ('admin', 'operator')),
  permissions jsonb not null default '{"dashboard":false,"search":true,"locations":false,"pallets":true,"scan":false,"moves":false}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists permissions jsonb not null default '{"dashboard":false,"search":true,"locations":false,"pallets":true,"scan":false,"moves":false}'::jsonb;
alter table public.profiles alter column permissions set default '{"dashboard":false,"search":true,"locations":false,"pallets":true,"scan":false,"moves":false}'::jsonb;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.has_module_access(module_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and (role = 'admin' or coalesce(permissions ->> module_name, 'false') = 'true')
  );
$$;

create or replace function public.add_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, coalesce(new.email, ''), 'operator')
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.add_auth_profile();

insert into public.profiles (user_id, email, role)
select id, coalesce(email, ''), 'operator'
from auth.users
on conflict (user_id) do update set email = excluded.email;

create or replace function public.stamp_pallet_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.created_by_email := current_email;
    else
      new.created_by := old.created_by;
      new.created_by_email := old.created_by_email;
    end if;
    new.updated_by := auth.uid();
    new.updated_by_email := current_email;
    if tg_op = 'INSERT' or old."locationId" is distinct from new."locationId" then
      new.placed_by := auth.uid();
      new.placed_by_email := current_email;
      new.placed_at := now();
    else
      new.placed_by := old.placed_by;
      new.placed_by_email := old.placed_by_email;
      new.placed_at := old.placed_at;
    end if;
  end if;

  if new."locationId" is not null and not exists (
    select 1 from public.locations where id = new."locationId"
  ) then
    raise exception 'La ubicación seleccionada no existe.';
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_pallet_actor_before_write on public.pallets;
create trigger stamp_pallet_actor_before_write
before insert or update on public.pallets
for each row execute function public.stamp_pallet_actor();

create or replace function public.prevent_occupied_location_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pallets where "locationId" = old.id;
  return old;
end;
$$;

drop trigger if exists prevent_occupied_location_delete_before_delete on public.locations;
create trigger prevent_occupied_location_delete_before_delete
before delete on public.locations
for each row execute function public.prevent_occupied_location_delete();

create or replace function public.prevent_rack_delete_with_locations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.locations
  where "rackId" = old.code or code like old.code || '-%';
  return old;
end;
$$;

drop trigger if exists prevent_rack_delete_with_locations_before_delete on public.racks;
create trigger prevent_rack_delete_with_locations_before_delete
before delete on public.racks
for each row execute function public.prevent_rack_delete_with_locations();
create or replace function public.prevent_unsafe_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('warehouse-profile-role-change'));
  if old.role is distinct from new.role and old.user_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;
  if old.role = 'admin' and new.role <> 'admin' and (
    select count(*) from public.profiles where role = 'admin'
  ) <= 1 then
    raise exception 'Debe permanecer al menos un administrador.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_unsafe_role_change_before_update on public.profiles;
create trigger prevent_unsafe_role_change_before_update
before update of role on public.profiles
for each row execute function public.prevent_unsafe_role_change();

create or replace function public.record_pallet_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
  source_location text;
  destination_location text;
  pallet_code text;
  pallet_boxes integer;
  product_count integer;
  details_text text;
begin
  if tg_op = 'DELETE' then
    action_name := 'Baja de pallet';
    source_location := old."locationId";
    destination_location := null;
    pallet_code := old.code;
    pallet_boxes := old.boxes;
    product_count := case when jsonb_typeof(old.products) = 'array' then jsonb_array_length(old.products) else 0 end;
  else
    if tg_op = 'INSERT' then
      action_name := 'Alta de pallet';
      source_location := null;
    elsif old."locationId" is distinct from new."locationId" then
      action_name := 'Movimiento';
      source_location := old."locationId";
    else
      action_name := 'Actualización de stock';
      source_location := old."locationId";
    end if;
    destination_location := new."locationId";
    pallet_code := new.code;
    pallet_boxes := new.boxes;
    product_count := case when jsonb_typeof(new.products) = 'array' then jsonb_array_length(new.products) else 0 end;
  end if;

  if product_count > 0 then
    details_text := coalesce(pallet_boxes, 0)::text || ' unidades · ' || product_count::text || ' productos';
  else
    details_text := coalesce(pallet_boxes, 0)::text || ' cajas';
  end if;

  insert into public.moves (id, action, "palletId", "from", "to", details, at, actor_id, actor_email, products)
  values (
    'MOV-' || replace(gen_random_uuid()::text, '-', ''),
    action_name,
    pallet_code,
    coalesce(source_location, ''),
    coalesce(destination_location, ''),
    details_text,
    now(),
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'Migración administrativa'),
    case when tg_op = 'DELETE' then coalesce(old.products, '[]'::jsonb) else coalesce(new.products, '[]'::jsonb) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists record_pallet_activity_after_write on public.pallets;
create trigger record_pallet_activity_after_write
after insert or update or delete on public.pallets
for each row execute function public.record_pallet_activity();

alter table public.racks enable row level security;
alter table public.locations enable row level security;
alter table public.pallets enable row level security;
alter table public.moves enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "dev racks access" on public.racks;
drop policy if exists "dev locations access" on public.locations;
drop policy if exists "dev pallets access" on public.pallets;
drop policy if exists "dev moves access" on public.moves;
drop policy if exists "authenticated can read racks" on public.racks;
drop policy if exists "admins manage racks" on public.racks;
drop policy if exists "authenticated can read locations" on public.locations;
drop policy if exists "admins manage locations" on public.locations;
drop policy if exists "authenticated can read pallets" on public.pallets;
drop policy if exists "authenticated can write pallets" on public.pallets;
drop policy if exists "authenticated can update pallets" on public.pallets;
drop policy if exists "admins can delete pallets" on public.pallets;
drop policy if exists "authenticated can read moves" on public.moves;
drop policy if exists "users can read own profile or admins all" on public.profiles;
drop policy if exists "admins can update profiles" on public.profiles;

create policy "authenticated can read racks" on public.racks
for select to authenticated using (public.has_module_access('dashboard') or public.has_module_access('search') or public.has_module_access('locations') or public.has_module_access('pallets') or public.has_module_access('scan') or public.has_module_access('moves'));
create policy "admins manage racks" on public.racks
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated can read locations" on public.locations
for select to authenticated using (public.has_module_access('dashboard') or public.has_module_access('search') or public.has_module_access('locations') or public.has_module_access('pallets') or public.has_module_access('scan') or public.has_module_access('moves'));
create policy "admins manage locations" on public.locations
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated can read pallets" on public.pallets
for select to authenticated using (public.has_module_access('dashboard') or public.has_module_access('search') or public.has_module_access('pallets') or public.has_module_access('scan'));
create policy "authenticated can write pallets" on public.pallets
for insert to authenticated with check (public.has_module_access('pallets'));
create policy "authenticated can update pallets" on public.pallets
for update to authenticated using (public.has_module_access('pallets')) with check (public.has_module_access('pallets'));
create policy "admins can delete pallets" on public.pallets
for delete to authenticated using (public.is_admin());

create policy "authenticated can read moves" on public.moves
for select to authenticated using (public.has_module_access('moves'));

create policy "users can read own profile or admins all" on public.profiles
for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins can update profiles" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_module_access(text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['racks', 'locations', 'pallets', 'moves', 'profiles']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- Después de crear la primera cuenta en Authentication, asígnale el rol inicial una sola vez:
-- update public.profiles set role = 'admin' where lower(email) = lower('admin@tu-dominio.com');
-- Las cuentas creadas después reciben automáticamente el rol operator.

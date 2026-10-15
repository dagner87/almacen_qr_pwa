-- Mínimos/máximos por producto y configuración de alertas por correo.
-- Solo crea tablas nuevas; no toca perfiles ni políticas existentes.
create table if not exists public.stock_limits (
  product_code text primary key,
  description text,
  min_qty integer not null default 0 check (min_qty >= 0),
  max_qty integer check (max_qty is null or max_qty >= 0),
  updated_at timestamptz not null default now(),
  updated_by_email text
);

create table if not exists public.alert_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  emails text not null default '',
  warn_pct integer not null default 20 check (warn_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.alert_config (id) values (1) on conflict (id) do nothing;

-- Evita correos repetidos: solo la usa la Edge Function (service role).
create table if not exists public.stock_alert_state (
  product_code text primary key,
  level text not null,
  last_sent_at timestamptz not null default now()
);

alter table public.stock_limits enable row level security;
alter table public.alert_config enable row level security;
alter table public.stock_alert_state enable row level security;

drop policy if exists "authenticated can read stock limits" on public.stock_limits;
drop policy if exists "admins manage stock limits" on public.stock_limits;
drop policy if exists "admins manage alert config" on public.alert_config;

create policy "authenticated can read stock limits" on public.stock_limits
for select to authenticated using (true);
create policy "admins manage stock limits" on public.stock_limits
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage alert config" on public.alert_config
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.stock_limits to authenticated;
grant select, insert, update on public.alert_config to authenticated;

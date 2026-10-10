-- Ejecuta este script en Supabase > SQL Editor.
-- Para una primera prueba: habilita RLS y políticas para usuarios autenticados.
-- Estas políticas de desarrollo permiten acceso a cualquier cliente con la clave pública.
-- NO uses este esquema abierto para inventario sensible en producción sin añadir autenticación.
create table if not exists public.racks (
  id text primary key, code text not null, levels integer not null default 5, "createdAt" timestamptz
);
create table if not exists public.locations (
  id text primary key, code text not null unique, "rackId" text, level integer, "position" integer,
  capacity integer default 1, "createdAt" timestamptz
);
create table if not exists public.pallets (
  id text primary key, code text not null unique, "locationId" text, description text not null,
  brand text, boxes integer not null default 0, notes text, status text not null default 'active',
  "createdAt" timestamptz, "updatedAt" timestamptz
);
create table if not exists public.moves (
  id text primary key, action text, "palletId" text, "from" text, "to" text, details text, at timestamptz
);
alter table public.racks enable row level security;
alter table public.locations enable row level security;
alter table public.pallets enable row level security;
alter table public.moves enable row level security;
-- Para pruebas controladas solamente. Sustituye estas políticas por políticas autenticadas antes de uso real.
create policy "dev racks access" on public.racks for all to anon, authenticated using (true) with check (true);
create policy "dev locations access" on public.locations for all to anon, authenticated using (true) with check (true);
create policy "dev pallets access" on public.pallets for all to anon, authenticated using (true) with check (true);
create policy "dev moves access" on public.moves for all to anon, authenticated using (true) with check (true);

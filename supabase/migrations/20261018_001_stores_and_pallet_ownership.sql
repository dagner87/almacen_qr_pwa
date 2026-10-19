-- Tiendas propietarias y asignación de cada pallet.
create table if not exists public.stores (
  id text primary key,
  name text not null,
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create unique index if not exists stores_name_case_insensitive_idx on public.stores (lower(name));

alter table public.pallets add column if not exists "storeId" text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pallets_storeid_fkey' and conrelid = 'public.pallets'::regclass
  ) then
    alter table public.pallets add constraint pallets_storeid_fkey
      foreign key ("storeId") references public.stores(id) on delete restrict;
  end if;
end;
$$;

-- Recupera las tiendas que ya estaban registradas como origen de devoluciones.
insert into public.stores (id, name, active)
select 'LEGACY-' || substr(md5(lower(trim(product ->> 'returnStore'))), 1, 20),
  min(trim(product ->> 'returnStore')), true
from public.pallets pallet
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(pallet.products) = 'array' then pallet.products else '[]'::jsonb end
) product
where nullif(trim(product ->> 'returnStore'), '') is not null
group by lower(trim(product ->> 'returnStore'))
on conflict do nothing;

-- Asigna automáticamente pallets cuyas devoluciones tienen un único origen.
update public.pallets pallet
set "storeId" = store.id
from public.stores store
where pallet."storeId" is null
  and exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(pallet.products) = 'array' then pallet.products else '[]'::jsonb end
    ) product
    where nullif(trim(product ->> 'returnStore'), '') is not null
  )
  and store.id = 'LEGACY-' || substr(md5(lower(trim((
    select min(product ->> 'returnStore')
    from jsonb_array_elements(
      case when jsonb_typeof(pallet.products) = 'array' then pallet.products else '[]'::jsonb end
    ) product
    where nullif(trim(product ->> 'returnStore'), '') is not null
  )))), 1, 20)
  and 1 = (
    select count(distinct lower(trim(product ->> 'returnStore')))
    from jsonb_array_elements(
      case when jsonb_typeof(pallet.products) = 'array' then pallet.products else '[]'::jsonb end
    ) product
    where nullif(trim(product ->> 'returnStore'), '') is not null
  );

alter table public.stores enable row level security;
drop policy if exists "authenticated can read stores" on public.stores;
drop policy if exists "admins manage stores" on public.stores;
create policy "authenticated can read stores" on public.stores
  for select to authenticated using (true);
create policy "admins manage stores" on public.stores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.stores to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stores'
  ) then
    alter publication supabase_realtime add table public.stores;
  end if;
end;
$$;

-- Permite que los operadores creen pallets desde el acceso rápido del dashboard,
-- sin concederles permisos de edición, movimiento o baja de pallets.
create or replace function public.can_create_pallet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role in ('admin', 'operator')
  );
$$;

drop policy if exists "authenticated can write pallets" on public.pallets;
create policy "authenticated can write pallets" on public.pallets
for insert to authenticated
with check (public.has_module_access('pallets') or public.can_create_pallet());

grant execute on function public.can_create_pallet() to authenticated;

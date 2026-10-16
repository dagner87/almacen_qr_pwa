-- Permite que cualquier usuario autenticado mantenga descripciones de producto.
-- Los operadores solo pueden insertar c?digos y actualizar descripci?n; solo admins pueden borrar.
drop policy if exists "admins manage catalog" on public.product_catalog;
drop policy if exists "authenticated insert product catalog" on public.product_catalog;
drop policy if exists "authenticated update product descriptions" on public.product_catalog;
drop policy if exists "admins delete product catalog" on public.product_catalog;

create policy "authenticated insert product catalog" on public.product_catalog
for insert to authenticated with check (true);
create policy "authenticated update product descriptions" on public.product_catalog
for update to authenticated using (true) with check (true);
create policy "admins delete product catalog" on public.product_catalog
for delete to authenticated using (public.is_admin());

revoke update on public.product_catalog from authenticated;
grant select, insert, delete on public.product_catalog to authenticated;
grant update (description, updated_at) on public.product_catalog to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_catalog'
  ) then
    alter publication supabase_realtime add table public.product_catalog;
  end if;
end;
$$;
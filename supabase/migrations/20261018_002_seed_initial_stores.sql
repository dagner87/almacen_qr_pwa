-- Registra las tres tiendas iniciales sin duplicar nombres existentes.
insert into public.stores (id, name, active)
select seed.id, seed.name, true
from (values
  ('STORE-MANGO', 'Mango'),
  ('STORE-ZARA', 'Zara'),
  ('STORE-MASSIMO-DUTTY', 'Massimo Dutty')
) as seed(id, name)
where not exists (
  select 1
  from public.stores store
  where lower(trim(store.name)) = lower(trim(seed.name))
)
on conflict do nothing;
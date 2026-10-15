-- Movimientos de stock: el trigger calcula entradas y salidas por producto.
-- Solo reemplaza la función y el trigger; no toca políticas ni perfiles.
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
  diff_text text;
  stock_in numeric := 0;
  stock_out numeric := 0;
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

  if tg_op = 'UPDATE' and action_name = 'Actualización de stock' then
    select
      coalesce(sum(d) filter (where d > 0), 0),
      coalesce(sum(d) filter (where d < 0), 0),
      string_agg(code || ': ' || case when d > 0 then '+' else '' end || d::text || ' (' || o::text || ' → ' || n::text || ')', ', ' order by code)
    into stock_in, stock_out, diff_text
    from (
      select coalesce(nw.code, od.code) as code, coalesce(od.q, 0) as o, coalesce(nw.q, 0) as n, coalesce(nw.q, 0) - coalesce(od.q, 0) as d
      from (
        select upper(trim(e ->> 'productCode')) as code, sum(coalesce(nullif(e ->> 'quantity', '')::numeric, 0)) as q
        from jsonb_array_elements(case when jsonb_typeof(old.products) = 'array' then old.products else '[]'::jsonb end) e
        group by 1
      ) od
      full join (
        select upper(trim(e ->> 'productCode')) as code, sum(coalesce(nullif(e ->> 'quantity', '')::numeric, 0)) as q
        from jsonb_array_elements(case when jsonb_typeof(new.products) = 'array' then new.products else '[]'::jsonb end) e
        group by 1
      ) nw on nw.code = od.code
    ) diffs
    where d <> 0;
    if stock_in > 0 and stock_out = 0 then
      action_name := 'Entrada de stock';
    elsif stock_out < 0 and stock_in = 0 then
      action_name := 'Salida de stock';
    elsif stock_in > 0 and stock_out < 0 then
      action_name := 'Ajuste de stock';
    end if;
  end if;

  if diff_text is not null then
    details_text := diff_text;
  elsif product_count > 0 then
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

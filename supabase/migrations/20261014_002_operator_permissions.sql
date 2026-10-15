-- Permisos por defecto del operador: escanear y ver ubicaciones, además de buscar y crear pallets.
alter table public.profiles alter column permissions set default '{"dashboard":false,"search":true,"locations":true,"pallets":true,"scan":true,"moves":false}'::jsonb;

update public.profiles
set permissions = jsonb_set(jsonb_set(permissions, '{scan}', 'true'), '{locations}', 'true')
where role = 'operator';

-- Reparación de acceso: perfiles y política de lectura. Segura de ejecutar varias veces.
-- Ejecutar en Supabase > SQL Editor.

-- 1. Cada cuenta de Authentication debe tener un perfil.
insert into public.profiles (user_id, email, role)
select id, coalesce(email, ''), 'operator'
from auth.users
on conflict (user_id) do update set email = excluded.email;

-- 2. La política que permite a cada usuario leer su propio perfil.
alter table public.profiles enable row level security;
drop policy if exists "users can read own profile or admins all" on public.profiles;
create policy "users can read own profile or admins all" on public.profiles
for select to authenticated using (user_id = auth.uid() or public.is_admin());

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_module_access(text) to authenticated;

-- 3. Cuenta administradora.
update public.profiles set role = 'admin' where lower(email) = lower('dalenag87@gmail.com');

-- Comprobación: debe listar tu cuenta con role = admin.
select user_id, email, role, permissions from public.profiles order by created_at;

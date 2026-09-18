-- `is_admin()`: helper de RLS usado por todas as policies role-aware daqui pra frente.
-- `security definer` + `search_path` fixo é obrigatório aqui — se fosse `security invoker`
-- (padrão), a própria RLS de `profiles` bloquearia a consulta interna desta função pra qualquer
-- linha que o chamador não pudesse já ler sozinho (o clássico problema de RLS recursiva). Como
-- `security definer`, a função roda com os privilégios de quem a criou (ignora RLS só aqui
-- dentro), então sempre consegue checar o profile de qualquer usuário.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select exists (
    select 1 from public.profiles where user_id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Agora que `is_admin()` existe, a policy de leitura de `profiles` passa a valer também pra
-- admin ver o profile de qualquer um (ex.: resolver nome do operador no histórico).
drop policy "profiles_select_self" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Homola Field Cloud — sdílení projektů v rámci firmy
-- Spusť jednou v Supabase SQL editoru (až budeš chtít sdílení zapnout).
--
-- Řeší "infinite recursion detected in policy for relation projects",
-- kvůli které fix-rls-recursion.sql ořezal přístup na owner-only:
-- členství se ověřuje přes SECURITY DEFINER funkci, která nepodléhá RLS
-- na project_members, takže se politiky nezacyklí.
--
-- Skript je čistě ADITIVNÍ: stávající owner-only politiky ze schema.sql
-- (projects_select_own, projects_update_owner, …) nechává být — permisivní
-- politiky se sčítají (OR), takže vlastník funguje dál beze změny.

create or replace function public.is_project_member(pid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(pid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = pid and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.is_project_owner(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;

-- Člen projektu vidí projekt…
drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member"
on public.projects for select
using (public.is_project_member(id));

-- …a editor/viewer rozlišíme zatím jednoduše: editovat smí každý člen.
-- (Až bude potřeba rozlišit role, přidá se do funkce parametr role.)
drop policy if exists "projects_update_member" on public.projects;
create policy "projects_update_member"
on public.projects for update
using (public.is_project_member(id))
with check (public.is_project_member(id));

-- Mazání projektu zůstává jen vlastníkovi (projects_delete_owner ze schema.sql).

-- Vlastník projektu spravuje členy (přidání/odebrání kolegy):
drop policy if exists "members_owner_manage" on public.project_members;
create policy "members_owner_manage"
on public.project_members for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

-- members_select_own / members_self_manage ze schema.sql zůstávají:
-- člen svůj řádek vidí a může z projektu odejít.

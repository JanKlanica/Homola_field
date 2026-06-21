-- Fix for: infinite recursion detected in policy for relation "projects"
-- Run this once in Supabase SQL editor.
--
-- The first production version keeps projects private per user. The
-- project_members table stays available for a later sharing feature, but its
-- policies are not used to decide project visibility yet.

drop policy if exists "projects_select_own_or_member" on public.projects;
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
on public.projects for select
using (owner_id = auth.uid());

drop policy if exists "projects_update_owner_or_editor" on public.projects;
drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner"
on public.projects for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "members_select_related" on public.project_members;
drop policy if exists "members_select_own" on public.project_members;
create policy "members_select_own"
on public.project_members for select
using (user_id = auth.uid());

drop policy if exists "members_owner_manage" on public.project_members;
drop policy if exists "members_self_manage" on public.project_members;
create policy "members_self_manage"
on public.project_members for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

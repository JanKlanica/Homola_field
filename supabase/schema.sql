-- Homola Field Cloud
-- Run this in Supabase SQL editor after creating a new project.

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  description text not null default '',
  coordinate_system text not null default 'EPSG:5514',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists projects_owner_updated_idx on public.projects(owner_id, updated_at desc);
create index if not exists project_members_user_idx on public.project_members(user_id);

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

drop policy if exists "projects_select_own_or_member" on public.projects;
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
on public.projects for select
using (owner_id = auth.uid());

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
on public.projects for insert
with check (owner_id = auth.uid());

drop policy if exists "projects_update_owner_or_editor" on public.projects;
drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner"
on public.projects for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner"
on public.projects for delete
using (owner_id = auth.uid());

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

create or replace function public.touch_project_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_project_updated_at();

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "project_files_owner_read" on storage.objects;
create policy "project_files_owner_read"
on storage.objects for select
using (
  bucket_id = 'project-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "project_files_owner_write" on storage.objects;
create policy "project_files_owner_write"
on storage.objects for insert
with check (
  bucket_id = 'project-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "project_files_owner_update" on storage.objects;
create policy "project_files_owner_update"
on storage.objects for update
using (
  bucket_id = 'project-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "project_files_owner_delete" on storage.objects;
create policy "project_files_owner_delete"
on storage.objects for delete
using (
  bucket_id = 'project-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

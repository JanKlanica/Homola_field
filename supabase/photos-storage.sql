-- Homola Field Cloud — fotky bodů
-- Spusť jednou v Supabase SQL editoru.
--
-- Vytvoří privátní bucket `project-files` a RLS politiky tak, aby každý
-- přihlášený uživatel četl/zapisoval jen svou složku:
--   {user_id}/{project_id}/photos/{point_id}/{timestamp}.jpg
-- Web (uploadPointPhoto / resolvePhotoUrl) i budoucí sync fotek z Androidu
-- používají přesně tuto strukturu cest.

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "project_files_insert_own" on storage.objects;
create policy "project_files_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "project_files_select_own" on storage.objects;
create policy "project_files_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "project_files_update_own" on storage.objects;
create policy "project_files_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "project_files_delete_own" on storage.objects;
create policy "project_files_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Run in Supabase SQL Editor: inspect `projects` RLS, then apply the fix block.
--
-- 1) Check current policies:
--    SELECT schemaname, tablename, policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename = 'projects'
--    ORDER BY policyname;

-- 2) If authenticated users get zero rows, typical causes:
--    - RLS enabled but no policy for role `authenticated`
--    - Policy uses `auth.uid() = user_id` while legacy rows have NULL `user_id`
--    - Only `anon` policies exist; JWT is `authenticated` after login
--
-- 3) Fix: allow all authenticated users to read/write all projects (team tool).
--    Re-run `rls_authenticated.sql` from the repo, or execute the block below.

alter table public.projects enable row level security;

drop policy if exists "projects_select_all" on public.projects;
drop policy if exists "projects_insert_all" on public.projects;
drop policy if exists "projects_update_all" on public.projects;
drop policy if exists "projects_delete_all" on public.projects;
drop policy if exists "projects_select_auth" on public.projects;
drop policy if exists "projects_insert_auth" on public.projects;
drop policy if exists "projects_update_auth" on public.projects;
drop policy if exists "projects_delete_auth" on public.projects;

create policy "projects_select_auth" on public.projects
  for select to authenticated using (true);
create policy "projects_insert_auth" on public.projects
  for insert to authenticated with check (true);
create policy "projects_update_auth" on public.projects
  for update to authenticated using (true) with check (true);
create policy "projects_delete_auth" on public.projects
  for delete to authenticated using (true);

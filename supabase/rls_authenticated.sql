-- Replace permissive public policies with authenticated-only access.
-- Run in Supabase SQL Editor after your base schema exists.
-- Requires Supabase Auth: only signed-in users (JWT role `authenticated`) can read/write.
-- Service role (API routes) still bypasses RLS.

-- ── customers ───────────────────────────────────────────────────────────────
drop policy if exists "customers_select_all" on public.customers;
drop policy if exists "customers_insert_all" on public.customers;
drop policy if exists "customers_update_all" on public.customers;
drop policy if exists "customers_delete_all" on public.customers;

create policy "customers_select_auth" on public.customers
  for select to authenticated using (true);
create policy "customers_insert_auth" on public.customers
  for insert to authenticated with check (true);
create policy "customers_update_auth" on public.customers
  for update to authenticated using (true) with check (true);
create policy "customers_delete_auth" on public.customers
  for delete to authenticated using (true);

-- ── jobs ───────────────────────────────────────────────────────────────────
drop policy if exists "jobs_select_all" on public.jobs;
drop policy if exists "jobs_insert_all" on public.jobs;
drop policy if exists "jobs_update_all" on public.jobs;
drop policy if exists "jobs_delete_all" on public.jobs;

create policy "jobs_select_auth" on public.jobs
  for select to authenticated using (true);
create policy "jobs_insert_auth" on public.jobs
  for insert to authenticated with check (true);
create policy "jobs_update_auth" on public.jobs
  for update to authenticated using (true) with check (true);
create policy "jobs_delete_auth" on public.jobs
  for delete to authenticated using (true);

-- ── job_attachments ─────────────────────────────────────────────────────────
drop policy if exists "job_attachments_select_all" on public.job_attachments;
drop policy if exists "job_attachments_insert_all" on public.job_attachments;
drop policy if exists "job_attachments_delete_all" on public.job_attachments;

create policy "job_attachments_select_auth" on public.job_attachments
  for select to authenticated using (true);
create policy "job_attachments_insert_auth" on public.job_attachments
  for insert to authenticated with check (true);
create policy "job_attachments_delete_auth" on public.job_attachments
  for delete to authenticated using (true);

-- ── project_breakdowns ─────────────────────────────────────────────────────
drop policy if exists "project_breakdowns_select_all" on public.project_breakdowns;
drop policy if exists "project_breakdowns_insert_all" on public.project_breakdowns;
drop policy if exists "project_breakdowns_update_all" on public.project_breakdowns;
drop policy if exists "project_breakdowns_delete_all" on public.project_breakdowns;

create policy "project_breakdowns_select_auth" on public.project_breakdowns
  for select to authenticated using (true);
create policy "project_breakdowns_insert_auth" on public.project_breakdowns
  for insert to authenticated with check (true);
create policy "project_breakdowns_update_auth" on public.project_breakdowns
  for update to authenticated using (true) with check (true);
create policy "project_breakdowns_delete_auth" on public.project_breakdowns
  for delete to authenticated using (true);

-- ── wifi_calculations ─────────────────────────────────────────────────────
drop policy if exists "wifi_calculations_select_all" on public.wifi_calculations;
drop policy if exists "wifi_calculations_insert_all" on public.wifi_calculations;
drop policy if exists "wifi_calculations_update_all" on public.wifi_calculations;
drop policy if exists "wifi_calculations_delete_all" on public.wifi_calculations;

create policy "wifi_calculations_select_auth" on public.wifi_calculations
  for select to authenticated using (true);
create policy "wifi_calculations_insert_auth" on public.wifi_calculations
  for insert to authenticated with check (true);
create policy "wifi_calculations_update_auth" on public.wifi_calculations
  for update to authenticated using (true) with check (true);
create policy "wifi_calculations_delete_auth" on public.wifi_calculations
  for delete to authenticated using (true);

-- ── sheets (if created via projects_sheets_migration.sql) ─────────────────
drop policy if exists "sheets_select_all" on public.sheets;
drop policy if exists "sheets_insert_all" on public.sheets;
drop policy if exists "sheets_update_all" on public.sheets;
drop policy if exists "sheets_delete_all" on public.sheets;

create policy "sheets_select_auth" on public.sheets
  for select to authenticated using (true);
create policy "sheets_insert_auth" on public.sheets
  for insert to authenticated with check (true);
create policy "sheets_update_auth" on public.sheets
  for update to authenticated using (true) with check (true);
create policy "sheets_delete_auth" on public.sheets
  for delete to authenticated using (true);

-- Note: `api_usage` is written only via service-role API routes; leave RLS off or
-- add service-only policies as needed. `projects` / `electrical_items` / scan tables:
-- apply the same `to authenticated` pattern if they currently use `using (true)`.

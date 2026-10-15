-- CTM 2.0 v0.3 / Non-clinical occupational-risk register.
-- No EGN, diagnosis, health records, attachments or legacy imports.
create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  workplace text not null default '' check (length(workplace) <= 250),
  hazard text not null check (length(trim(hazard)) between 3 and 800),
  risk_level text not null check (risk_level in ('low','medium','high')),
  protective_measures text not null default '' check (length(protective_measures) <= 2000),
  assessment_date date not null,
  review_due date,
  status text not null default 'draft' check (status in ('draft','review','approved','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies(tenant_id,id),
  unique(tenant_id,id),
  check(review_due is null or review_due >= assessment_date)
);
create index if not exists risk_assessments_company_idx on public.risk_assessments(tenant_id,company_id,created_at desc);
create index if not exists risk_assessments_author_idx on public.risk_assessments(created_by);

revoke all on public.risk_assessments from anon,authenticated;
grant select,insert,update on public.risk_assessments to authenticated;
alter table public.risk_assessments enable row level security;

create policy risk_assessments_read on public.risk_assessments for select to authenticated using (
  (select private.has_role(tenant_id,array['admin','specialist','doctor','auditor']))
  or (select private.can_company(tenant_id,company_id))
);
create policy risk_assessments_insert on public.risk_assessments for insert to authenticated with check (
  (select private.has_role(tenant_id,array['admin','specialist']))
  and created_by=(select auth.uid())
);
create policy risk_assessments_update on public.risk_assessments for update to authenticated using (
  (select private.has_role(tenant_id,array['admin','specialist']))
) with check ((select private.has_role(tenant_id,array['admin','specialist'])));

create trigger risk_assessments_audit after insert or update on public.risk_assessments
for each row execute function private.record_audit();

-- Index foreign keys used by RLS and operations (no patient payload changes).
create index if not exists company_access_tenant_company_idx on public.company_access(tenant_id,company_id);
create index if not exists employees_tenant_idx on public.employees(tenant_id);
create index if not exists examinations_employee_idx on public.examinations(tenant_id,employee_id);
create index if not exists sick_leaves_employee_idx on public.sick_leaves(tenant_id,employee_id);
create index if not exists documents_company_idx on public.documents(tenant_id,company_id) where company_id is not null;
create index if not exists documents_employee_idx on public.documents(tenant_id,employee_id) where employee_id is not null;
create index if not exists migration_batches_tenant_idx on public.migration_batches(tenant_id);

-- CTM v0.4: non-medical company structure and employment chronology.
-- No real archives, EGN, diagnoses or health records are imported.
alter table public.employees
  add constraint employees_tenant_company_id_key unique (tenant_id, company_id, id);

create table public.worksites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 200),
  address text not null default '' check (length(address) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, company_id, id),
  foreign key (tenant_id, company_id) references public.companies(tenant_id, id)
);
create index worksites_company_created_idx on public.worksites(tenant_id, company_id, created_at desc);

create table public.job_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  worksite_id uuid,
  title text not null check(length(trim(title)) between 2 and 200),
  department text not null default '' check(length(department) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, company_id, id),
  foreign key (tenant_id, company_id) references public.companies(tenant_id, id),
  foreign key (tenant_id, company_id, worksite_id) references public.worksites(tenant_id, company_id, id)
);
create index job_positions_company_created_idx on public.job_positions(tenant_id,company_id,created_at desc);
create index job_positions_worksite_idx on public.job_positions(tenant_id,company_id,worksite_id);

create table public.employment_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  employee_id uuid not null,
  position_id uuid not null,
  started_on date not null,
  ended_on date,
  verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','conflict')),
  source_note text not null default '' check(length(source_note) <= 250),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies(tenant_id,id),
  foreign key (tenant_id, company_id, employee_id) references public.employees(tenant_id,company_id,id),
  foreign key (tenant_id, company_id, position_id) references public.job_positions(tenant_id,company_id,id),
  check (ended_on is null or ended_on >= started_on)
);
create index employment_periods_company_created_idx on public.employment_periods(tenant_id,company_id,created_at desc);
create index employment_periods_employee_history_idx on public.employment_periods(tenant_id,employee_id,started_on desc);
create index employment_periods_position_idx on public.employment_periods(tenant_id,company_id,position_id);

-- Default-deny visitors and restrict use of the exposed schema.
revoke all on public.worksites,public.job_positions,public.employment_periods from anon,authenticated;
grant select,insert,update on public.worksites,public.job_positions,public.employment_periods to authenticated;
alter table public.worksites enable row level security;
alter table public.job_positions enable row level security;
alter table public.employment_periods enable row level security;

create policy worksites_select on public.worksites for select to authenticated using(
  (select private.has_role(tenant_id, array['admin','specialist','doctor','auditor']))
  or (select private.can_company(tenant_id, company_id))
);
create policy worksites_insert on public.worksites for insert to authenticated with check(
  (select private.has_role(tenant_id, array['admin','specialist']))
);
create policy worksites_update on public.worksites for update to authenticated using(
  (select private.has_role(tenant_id, array['admin','specialist']))
) with check ((select private.has_role(tenant_id, array['admin','specialist'])));

create policy job_positions_select on public.job_positions for select to authenticated using(
  (select private.has_role(tenant_id, array['admin','specialist','doctor','auditor']))
  or (select private.can_company(tenant_id, company_id))
);
create policy job_positions_insert on public.job_positions for insert to authenticated with check(
  (select private.has_role(tenant_id, array['admin','specialist']))
);
create policy job_positions_update on public.job_positions for update to authenticated using(
  (select private.has_role(tenant_id, array['admin','specialist']))
) with check ((select private.has_role(tenant_id, array['admin','specialist'])));

create policy employment_periods_select on public.employment_periods for select to authenticated using(
  (select private.has_role(tenant_id, array['admin','specialist','doctor','auditor']))
  or (select private.can_company(tenant_id, company_id))
);
create policy employment_periods_insert on public.employment_periods for insert to authenticated with check(
  (select private.has_role(tenant_id, array['admin','specialist']))
);
create policy employment_periods_update on public.employment_periods for update to authenticated using(
  (select private.has_role(tenant_id, array['admin','specialist']))
) with check ((select private.has_role(tenant_id, array['admin','specialist'])));

create trigger worksites_audit after insert or update on public.worksites
  for each row execute function private.record_audit();
create trigger job_positions_audit after insert or update on public.job_positions
  for each row execute function private.record_audit();
create trigger employment_periods_audit after insert or update on public.employment_periods
  for each row execute function private.record_audit();
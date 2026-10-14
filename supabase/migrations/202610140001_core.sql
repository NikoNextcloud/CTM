-- CTM 2.0 / Stage 1: deliberately NO EGN, diagnosis, raw imports, attachments, or real patients.
-- Requires separate Supabase project; applied by an authorized project owner.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.tenants (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 200),
 created_at timestamptz not null default now()
);
create table public.tenant_members (
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','doctor','specialist','employer','auditor')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(tenant_id,user_id)
);
create index tenant_members_user_idx on public.tenant_members(user_id,tenant_id) where active;

create table public.companies (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 2 and 200),
 eik text not null check(eik ~ '^[0-9]{9,13}$'),
 address text not null default '',
 status text not null default 'active' check(status in ('active','inactive','archived')),
 created_at timestamptz not null default now(),
 unique(tenant_id,eik),
 unique(tenant_id,id)
);
create index companies_tenant_idx on public.companies(tenant_id,name);

create table public.company_access (
 tenant_id uuid not null,
 company_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(company_id,user_id),
 foreign key (tenant_id,company_id) references public.companies(tenant_id,id)
);
create index company_access_lookup_idx on public.company_access(user_id,tenant_id);

create table public.employees (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 company_id uuid not null,
 full_name text not null check(length(trim(full_name)) between 3 and 200),
 job_title text not null default '',
 reference_code text not null default '',
 current_status text not null default 'pending' check(current_status in ('pending','active','inactive')),
 created_at timestamptz not null default now(),
 foreign key (tenant_id,company_id) references public.companies(tenant_id,id),
 unique(tenant_id,id)
);
create index employees_company_idx on public.employees(tenant_id,company_id);

create table public.examinations (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 employee_id uuid not null,
 exam_date date,
 exam_type text not null default 'periodic' check(exam_type in ('initial','periodic','other')),
 fitness text not null default 'pending' check(fitness in ('pending','completed','requires_review')),
 created_at timestamptz not null default now(),
 foreign key (tenant_id,employee_id) references public.employees(tenant_id,id)
);
create index examinations_tenant_idx on public.examinations(tenant_id,exam_date);

-- The health-sensitive portion of sick leaves is NOT ingested during this phase.
create table public.sick_leaves (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 employee_id uuid,
 start_date date,
 end_date date,
 verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','conflict')),
 created_at timestamptz not null default now(),
 foreign key (tenant_id,employee_id) references public.employees(tenant_id,id),
 check(end_date is null or start_date is null or end_date>=start_date)
);

-- Metadata only, no public storage bucket and no public file URLs.
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 company_id uuid,
 employee_id uuid,
 title text not null,
 classification text not null check(classification in ('administrative','medical')),
 verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','conflict')),
 storage_path text,
 created_at timestamptz not null default now(),
 foreign key (tenant_id,company_id) references public.companies(tenant_id,id),
 foreign key (tenant_id,employee_id) references public.employees(tenant_id,id)
);

create table public.migration_batches (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 source_name text not null,
 status text not null default 'pending' check(status in ('pending','review','approved','rejected')),
 created_at timestamptz not null default now()
);

create table public.audit_events (
 id bigint generated always as identity primary key,
 tenant_id uuid,
 actor_id uuid,
 entity text not null,
 record_id uuid,
 action text not null,
 occurred_at timestamptz not null default now()
);
create index audit_tenant_time_idx on public.audit_events(tenant_id,occurred_at desc);

-- Security-definer helpers: only inspect memberships/access, never return medical payloads.
create or replace function private.has_tenant(p_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tenant_members m where m.tenant_id=p_tenant and m.user_id=(select auth.uid()) and m.active) $$;
create or replace function private.has_role(p_tenant uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.tenant_members m where m.tenant_id=p_tenant and m.user_id=(select auth.uid()) and m.active and m.role=any(p_roles)) $$;
create or replace function private.can_company(p_tenant uuid,p_company uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.company_access a join public.tenant_members m on m.tenant_id=a.tenant_id and m.user_id=a.user_id and m.active where a.tenant_id=p_tenant and a.company_id=p_company and a.user_id=(select auth.uid())) $$;
revoke all on function private.has_tenant(uuid) from public;
revoke all on function private.has_role(uuid,text[]) from public;
revoke all on function private.can_company(uuid,uuid) from public;
grant execute on function private.has_tenant(uuid),private.has_role(uuid,text[]),private.can_company(uuid,uuid) to authenticated;

-- Deny by default to visitors. RLS only works alongside restrictive grants.
revoke all on public.tenants,public.tenant_members,public.companies,public.company_access,public.employees,public.examinations,public.sick_leaves,public.documents,public.migration_batches,public.audit_events from anon;
revoke all on public.tenants,public.tenant_members,public.companies,public.company_access,public.employees,public.examinations,public.sick_leaves,public.documents,public.migration_batches,public.audit_events from authenticated;
grant select on public.tenants,public.tenant_members,public.companies,public.company_access,public.employees,public.examinations,public.sick_leaves,public.documents,public.migration_batches,public.audit_events to authenticated;
grant insert,update on public.companies,public.employees,public.examinations,public.sick_leaves,public.documents,public.migration_batches to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.company_access enable row level security;
alter table public.companies enable row level security;
alter table public.employees enable row level security;
alter table public.examinations enable row level security;
alter table public.sick_leaves enable row level security;
alter table public.documents enable row level security;
alter table public.migration_batches enable row level security;
alter table public.audit_events enable row level security;

create policy tenants_view on public.tenants for select to authenticated using ((select private.has_tenant(id)));
create policy members_view on public.tenant_members for select to authenticated using(user_id=(select auth.uid()) or (select private.has_role(tenant_id,array['admin'])));
create policy company_access_view on public.company_access for select to authenticated using(user_id=(select auth.uid()) or (select private.has_role(tenant_id,array['admin'])));
create policy companies_view on public.companies for select to authenticated using (
 (select private.has_role(tenant_id,array['admin','specialist','doctor','auditor'])) or (select private.can_company(tenant_id,id))
);
create policy companies_insert on public.companies for insert to authenticated with check ((select private.has_role(tenant_id,array['admin','specialist'])));
create policy companies_update on public.companies for update to authenticated using ((select private.has_role(tenant_id,array['admin','specialist']))) with check ((select private.has_role(tenant_id,array['admin','specialist'])));
create policy employees_view on public.employees for select to authenticated using (
 (select private.has_role(tenant_id,array['admin','specialist','doctor'])) or (select private.can_company(tenant_id,company_id))
);
create policy employees_insert on public.employees for insert to authenticated with check ((select private.has_role(tenant_id,array['admin','specialist'])));
create policy employees_update on public.employees for update to authenticated using ((select private.has_role(tenant_id,array['admin','specialist']))) with check ((select private.has_role(tenant_id,array['admin','specialist'])));
-- Clinical details are never exposed in this stage. Only staff can see scheduling/status.
create policy examinations_view on public.examinations for select to authenticated using ((select private.has_role(tenant_id,array['doctor','specialist'])));
create policy examinations_insert on public.examinations for insert to authenticated with check ((select private.has_role(tenant_id,array['doctor'])));
create policy examinations_update on public.examinations for update to authenticated using ((select private.has_role(tenant_id,array['doctor']))) with check ((select private.has_role(tenant_id,array['doctor'])));
create policy sick_view on public.sick_leaves for select to authenticated using ((select private.has_role(tenant_id,array['doctor'])));
create policy sick_insert on public.sick_leaves for insert to authenticated with check ((select private.has_role(tenant_id,array['doctor'])));
create policy sick_update on public.sick_leaves for update to authenticated using ((select private.has_role(tenant_id,array['doctor']))) with check ((select private.has_role(tenant_id,array['doctor'])));
create policy documents_view on public.documents for select to authenticated using (
 (classification='medical' and (select private.has_role(tenant_id,array['doctor']))) or
 (classification='administrative' and ((select private.has_role(tenant_id,array['admin','specialist','doctor'])) or (company_id is not null and (select private.can_company(tenant_id,company_id)))))
);
create policy documents_insert on public.documents for insert to authenticated with check (
 (classification='medical' and (select private.has_role(tenant_id,array['doctor']))) or (classification='administrative' and (select private.has_role(tenant_id,array['admin','specialist'])))
);
create policy documents_update on public.documents for update to authenticated using ((classification='medical' and (select private.has_role(tenant_id,array['doctor']))) or (classification='administrative' and (select private.has_role(tenant_id,array['admin','specialist','doctor'])))) with check ((classification='medical' and (select private.has_role(tenant_id,array['doctor']))) or (classification='administrative' and (select private.has_role(tenant_id,array['admin','specialist','doctor']))));
create policy migration_view on public.migration_batches for select to authenticated using ((select private.has_role(tenant_id,array['admin'])));
create policy migration_insert on public.migration_batches for insert to authenticated with check ((select private.has_role(tenant_id,array['admin'])));
create policy migration_update on public.migration_batches for update to authenticated using ((select private.has_role(tenant_id,array['admin']))) with check ((select private.has_role(tenant_id,array['admin'])));
create policy audit_view on public.audit_events for select to authenticated using ((select private.has_role(tenant_id,array['admin','auditor'])));

-- Field-metadata-only audit, immutable to regular users.
create or replace function private.record_audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP='INSERT' or TG_OP='UPDATE' then
   insert into public.audit_events(tenant_id,actor_id,entity,record_id,action)
   values(new.tenant_id,(select auth.uid()),TG_TABLE_NAME,new.id,TG_OP);
   return new;
 end if;
 return old;
end $$;
revoke all on function private.record_audit() from public;
create trigger companies_audit after insert or update on public.companies for each row execute function private.record_audit();
create trigger employees_audit after insert or update on public.employees for each row execute function private.record_audit();
create trigger examinations_audit after insert or update on public.examinations for each row execute function private.record_audit();
create trigger sick_audit after insert or update on public.sick_leaves for each row execute function private.record_audit();
create trigger documents_audit after insert or update on public.documents for each row execute function private.record_audit();
create trigger migration_audit after insert or update on public.migration_batches for each row execute function private.record_audit();

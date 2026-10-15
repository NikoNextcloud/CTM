-- CTM v0.5 / Public administrative RPCs use invoker wrappers around reviewed private functions.
-- Revision guards preserve tenant boundaries and prevent silent overwrite.
alter function public.ctm_find_auth_user(uuid,text) set schema private;
alter function public.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) set schema private;
revoke all on function private.ctm_find_auth_user(uuid,text) from public,anon;
revoke all on function private.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) from public,anon;
grant execute on function private.ctm_find_auth_user(uuid,text), private.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) to authenticated;
create function public.ctm_find_auth_user(p_tenant uuid,p_email text)
returns uuid language sql stable security invoker set search_path=''
as $$ select private.ctm_find_auth_user(p_tenant,p_email) $$;
create function public.ctm_manage_member(
p_tenant uuid,p_user uuid,p_role text,p_active boolean,p_company_ids uuid[])
returns void language sql volatile security invoker set search_path=''
as $$ select private.ctm_manage_member(p_tenant,p_user,p_role,p_active,p_company_ids) $$;
revoke all on function public.ctm_find_auth_user(uuid,text),public.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) from public,anon;
grant execute on function public.ctm_find_auth_user(uuid,text),public.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) to authenticated;
alter table public.companies
  add column activity text not null default '' check(length(activity)<=300),
  add column contact_email text not null default '' check(length(contact_email)<=254),
  add column contact_phone text not null default '' check(length(contact_phone)<=50),
  add column contract_reference text not null default '' check(length(contract_reference)<=100);
alter table public.companies add column revision bigint not null default 1, add column updated_at timestamptz not null default now();
alter table public.employees add column revision bigint not null default 1, add column updated_at timestamptz not null default now();
alter table public.worksites add column revision bigint not null default 1, add column updated_at timestamptz not null default now();
alter table public.job_positions add column revision bigint not null default 1, add column updated_at timestamptz not null default now();
alter table public.employment_periods add column revision bigint not null default 1, add column updated_at timestamptz not null default now();
alter table public.risk_assessments add column revision bigint not null default 1;
create function private.revision_and_scope_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Record identity and tenant are immutable' using errcode='42501';
 end if;
 if TG_TABLE_NAME <> 'companies' and
    (to_jsonb(new)->>'company_id') is distinct from (to_jsonb(old)->>'company_id') then
    raise exception 'Company linkage cannot be reassigned' using errcode='42501';
 end if;
 if TG_TABLE_NAME='employment_periods' and
    (new.employee_id is distinct from old.employee_id or new.position_id is distinct from old.position_id) then
    raise exception 'Employment links cannot be reassigned' using errcode='42501';
 end if;
 if TG_TABLE_NAME='risk_assessments' and
    (new.created_by is distinct from old.created_by or new.status not in ('draft','review')) then
    raise exception 'Risk author is immutable; approval workflow unavailable' using errcode='42501';
 end if;
 new.revision := old.revision+1;
 new.updated_at := now();
 return new;
end $$;
create trigger company_revision_guard before update on public.companies for each row execute function private.revision_and_scope_guard();
create trigger employee_revision_guard before update on public.employees for each row execute function private.revision_and_scope_guard();
create trigger worksite_revision_guard before update on public.worksites for each row execute function private.revision_and_scope_guard();
create trigger position_revision_guard before update on public.job_positions for each row execute function private.revision_and_scope_guard();
create trigger employment_revision_guard before update on public.employment_periods for each row execute function private.revision_and_scope_guard();
create trigger risk_revision_guard before update on public.risk_assessments for each row execute function private.revision_and_scope_guard();
alter table public.risk_assessments add constraint risk_approval_blocked_v05 check(status in ('draft','review'));
create index if not exists companies_tenant_created_id_idx on public.companies(tenant_id,created_at desc,id);
create index if not exists employees_tenant_created_id_idx on public.employees(tenant_id,created_at desc,id);
create index if not exists risks_tenant_created_id_idx on public.risk_assessments(tenant_id,created_at desc,id);

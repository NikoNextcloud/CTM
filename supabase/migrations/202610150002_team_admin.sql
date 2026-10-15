-- CTM 2.0: administrative membership API; no medical payloads or production patients.
alter table public.tenant_members add column if not exists email text;
update public.tenant_members m set email=lower(u.email)
from auth.users u where u.id=m.user_id and m.email is distinct from lower(u.email);

create or replace function public.ctm_find_auth_user(p_tenant uuid,p_email text)
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid;
begin
  if (select auth.uid()) is null or not exists(
    select 1 from public.tenant_members m where m.tenant_id=p_tenant
    and m.user_id=(select auth.uid()) and m.active and m.role='admin'
  ) then raise exception 'Access denied' using errcode='42501'; end if;
  select u.id into v_user from auth.users u
  where lower(u.email)=lower(trim(p_email)) limit 1;
  return v_user;
end $$;
revoke all on function public.ctm_find_auth_user(uuid,text) from public,anon;
grant execute on function public.ctm_find_auth_user(uuid,text) to authenticated;

create or replace function public.ctm_manage_member(
  p_tenant uuid,p_user uuid,p_role text,p_active boolean,p_company_ids uuid[]
) returns void language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid());
        v_email text;
        v_existing boolean;
        v_companies uuid[] := coalesce(p_company_ids,array[]::uuid[]);
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));
  if v_actor is null or not exists(
    select 1 from public.tenant_members m where m.tenant_id=p_tenant
    and m.user_id=v_actor and m.active and m.role='admin'
  ) then raise exception 'Administrator permissions required' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','doctor','specialist','employer','auditor')
    or p_active is null or p_user is null then
    raise exception 'Invalid team member arguments' using errcode='22023'; end if;
  if p_user=v_actor and (p_role<>'admin' or p_active=false) then
    raise exception 'Cannot deactivate or demote your own admin account' using errcode='42501'; end if;
  if (p_role<>'admin' or p_active=false) and exists(
    select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user
    and role='admin' and active=true
  ) and (
    select count(*) from public.tenant_members where tenant_id=p_tenant
    and role='admin' and active=true
  ) <= 1 then
    raise exception 'Cannot disable the last administrator' using errcode='42501'; end if;
  if p_role='employer' and p_active and coalesce(array_length(v_companies,1),0)=0 then
    raise exception 'Employers require a company' using errcode='22023'; end if;
  if exists(select 1 from unnest(v_companies) as x(company_id)
    where x.company_id is null or not exists(
      select 1 from public.companies c where c.tenant_id=p_tenant and c.id=x.company_id
    )) then raise exception 'Company outside organization' using errcode='22023'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=p_user;
  if v_email is null then
    raise exception 'User not found in Authentication' using errcode='22023'; end if;
  select exists(select 1 from public.tenant_members m where m.tenant_id=p_tenant
    and m.user_id=p_user) into v_existing;
  insert into public.tenant_members(tenant_id,user_id,email,role,active)
  values(p_tenant,p_user,v_email,p_role,p_active)
  on conflict(tenant_id,user_id) do update
  set email=excluded.email,role=excluded.role,active=excluded.active;
  delete from public.company_access a where a.tenant_id=p_tenant and a.user_id=p_user;
  if p_role='employer' and p_active then
    insert into public.company_access(tenant_id,company_id,user_id)
    select p_tenant,x.company_id,p_user
    from (select distinct unnest(v_companies) as company_id) x;
  end if;
  insert into public.audit_events(tenant_id,actor_id,entity,record_id,action)
  values(p_tenant,v_actor,'tenant_members',p_user,
    case when v_existing then 'MEMBER_ACCESS_UPDATED' else 'MEMBER_ACCESS_GRANTED' end);
end $$;
revoke all on function public.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) from public,anon;
grant execute on function public.ctm_manage_member(uuid,uuid,text,boolean,uuid[]) to authenticated;

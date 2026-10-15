-- v0.8 synthetic data only. Enforce reference integrity and prevent stale employer scope.
create unique index if not exists employees_tenant_company_reference_unique
 on public.employees(tenant_id,company_id,reference_code)
 where reference_code <> '';
create or replace function public.ctm_import_nonclinical(p_tenant uuid,p_resource text,p_rows jsonb,p_sha256 text)
returns integer language plpgsql security invoker set search_path=''
as $$
declare
 v_actor uuid:=(select auth.uid());v_allowed text[];
 v_count integer;v_row jsonb;v_company uuid;v_name text;v_eik text;v_n integer:=0;
begin
 if v_actor is null or p_tenant is null or not exists(
  select 1 from public.tenant_members m
  where m.tenant_id=p_tenant and m.user_id=v_actor and m.active
    and m.role in ('admin','specialist')
 ) then raise exception 'Import prohibited' using errcode='42501';end if;
 if p_resource='companies' then v_allowed:=array['name','eik','address','status'];
 elsif p_resource='employees' then v_allowed:=array['company_eik','full_name','job_title','reference_code'];
 elsif p_resource='worksites' then v_allowed:=array['company_eik','name','address','active'];
 elsif p_resource='job_positions' then v_allowed:=array['company_eik','title','department','active'];
 elsif p_resource='risk_assessments' then v_allowed:=array['company_eik','workplace','hazard','risk_level','protective_measures','assessment_date','review_due'];
 else raise exception 'Unsupported resource' using errcode='22023';end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
  or p_rows is null or pg_catalog.jsonb_typeof(p_rows)<>'array'
 then raise exception 'Invalid import payload' using errcode='22023';end if;
 v_count:=pg_catalog.jsonb_array_length(p_rows);
 if v_count<1 or v_count>100 then raise exception 'Max 100 records' using errcode='22023';end if;
 insert into public.ctm_import_batches(tenant_id,resource,payload_hash,row_count,created_by)
 values(p_tenant,p_resource,p_sha256,v_count,v_actor);
 for v_row in select value from pg_catalog.jsonb_array_elements(p_rows) loop
  if pg_catalog.jsonb_typeof(v_row)<>'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(v_row))<>array_length(v_allowed,1)
    or exists(select 1 from pg_catalog.jsonb_object_keys(v_row) as supplied(k) where supplied.k<>all(v_allowed))
    or exists(select 1 from unnest(v_allowed) as expected(k) where v_row->>expected.k is null)
  then raise exception 'Invalid columns' using errcode='22023';end if;
  v_n:=v_n+1;
  if p_resource='companies' then
   v_name:=pg_catalog.btrim(v_row->>'name');v_eik:=v_row->>'eik';
   if v_name !~* '^(test|тест)[ _-]' or length(v_name)<3 or length(v_name)>200
    or v_eik !~ '^000000[0-9]{3}$' or length(v_row->>'address')>300
    or (v_row->>'status') not in ('active','inactive','archived')
   then raise exception 'Only synthetic TEST companies allowed' using errcode='22023';end if;
   insert into public.companies(tenant_id,name,eik,address,status)
    values(p_tenant,v_name,v_eik,v_row->>'address',v_row->>'status');
  else
   v_eik:=v_row->>'company_eik';
   if v_eik !~ '^000000[0-9]{3}$' then raise exception 'Synthetic EIK required' using errcode='22023';end if;
   select c.id into v_company from public.companies c
    where c.tenant_id=p_tenant and c.eik=v_eik and c.name ~* '^(test|тест)[ _-]' limit 1;
   if v_company is null then raise exception 'Test company required' using errcode='23503';end if;
   if p_resource='employees' then
    v_name:=pg_catalog.btrim(v_row->>'full_name');
    if v_name !~* '^(test|тест)[ _-]' or length(v_name)<3 or length(v_name)>200
     or length(v_row->>'job_title')>150 or length(v_row->>'reference_code')>80 or pg_catalog.btrim(v_row->>'reference_code')=''
    then raise exception 'Only synthetic TEST employees allowed' using errcode='22023';end if;
    insert into public.employees(tenant_id,company_id,full_name,job_title,reference_code,current_status)
     values(p_tenant,v_company,v_name,v_row->>'job_title',v_row->>'reference_code','pending');
   elsif p_resource='worksites' then
    v_name:=pg_catalog.btrim(v_row->>'name');
    if length(v_name)<2 or length(v_name)>200 or length(v_row->>'address')>300
     or (v_row->>'active') not in ('true','false')
    then raise exception 'Invalid site' using errcode='22023';end if;
    insert into public.worksites(tenant_id,company_id,name,address,active)
    values(p_tenant,v_company,v_name,v_row->>'address',(v_row->>'active')::boolean);
   elsif p_resource='job_positions' then
    v_name:=pg_catalog.btrim(v_row->>'title');
    if length(v_name)<2 or length(v_name)>200 or length(v_row->>'department')>200
     or (v_row->>'active') not in ('true','false')
    then raise exception 'Invalid position' using errcode='22023';end if;
    insert into public.job_positions(tenant_id,company_id,title,department,active)
    values(p_tenant,v_company,v_name,v_row->>'department',(v_row->>'active')::boolean);
   elsif p_resource='risk_assessments' then
    if length(v_row->>'hazard')<3 or length(v_row->>'hazard')>800
     or length(v_row->>'workplace')>250 or length(v_row->>'protective_measures')>2000
     or (v_row->>'risk_level') not in ('low','medium','high')
     or (v_row->>'assessment_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or (v_row->>'review_due') !~ '^$|^\d{4}-\d{2}-\d{2}$'
     or (v_row->>'review_due')<>'' and (v_row->>'review_due')<(v_row->>'assessment_date')
    then raise exception 'Invalid risk assessment' using errcode='22023';end if;
    insert into public.risk_assessments(tenant_id,company_id,workplace,hazard,risk_level,
       protective_measures,assessment_date,review_due,status,created_by)
    values(p_tenant,v_company,v_row->>'workplace',v_row->>'hazard',v_row->>'risk_level',
      v_row->>'protective_measures',(v_row->>'assessment_date')::date,
      nullif(v_row->>'review_due','')::date,'draft',v_actor);
   end if;
  end if;
 end loop;
 return v_n;
end $$;
revoke all on function public.ctm_import_nonclinical(uuid,text,jsonb,text) from public,anon;
grant execute on function public.ctm_import_nonclinical(uuid,text,jsonb,text) to authenticated;

create or replace function private.can_company(p_tenant uuid, p_company uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists (
  select 1 from public.company_access a
  join public.tenant_members m on m.tenant_id=a.tenant_id and m.user_id=a.user_id
  where a.tenant_id=p_tenant and a.company_id=p_company
   and a.user_id=(select auth.uid()) and m.active and m.role='employer'
 );
$$;
revoke all on function private.can_company(uuid,uuid) from public,anon;
grant execute on function private.can_company(uuid,uuid) to authenticated;

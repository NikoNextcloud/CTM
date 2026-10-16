-- CTM v1.1: reviewed company promotion, atomic, idempotent and tenant-scoped.
-- No imported names, archival spreadsheets, medical data or keys are stored in this migration.
alter table public.ctm_company_candidates
 add column if not exists promoted_company_id uuid;

do $$
begin
 if not exists(
  select 1 from pg_constraint where conrelid='public.ctm_company_candidates'::regclass
   and conname='ctm_company_candidate_promoted_company_fk'
 ) then
  alter table public.ctm_company_candidates add constraint ctm_company_candidate_promoted_company_fk
   foreign key(tenant_id,promoted_company_id) references public.companies(tenant_id,id);
 end if;
 if not exists(
  select 1 from pg_constraint where conrelid='public.ctm_company_candidates'::regclass
   and conname='ctm_company_candidate_verified_link'
 ) then
  alter table public.ctm_company_candidates add constraint ctm_company_candidate_verified_link
   check(review_status <> 'verified' or promoted_company_id is not null);
 end if;
end $$;

-- Formal checksum verification is necessary but never sufficient proof of company identity.
-- 9-digit: weights 1..8, then 3..10 if remainder 10.
-- 13-digit: parent UIC plus branch weights [2,7,3,5], then [4,9,5,7].
create or replace function private.ctm_valid_company_eik(p_eik text)
returns boolean
language plpgsql immutable set search_path='' as $$
declare i integer; v_sum integer; v_digit integer; v_13 integer; v_weights int[];
begin
 if p_eik is null or p_eik !~ '^([0-9]{9}|[0-9]{13})$' then return false; end if;
 v_sum:=0;
 for i in 1..8 loop
  v_sum:=v_sum+(substr(p_eik,i,1)::int * i);
 end loop;
 v_digit:=mod(v_sum,11);
 if v_digit=10 then
  v_sum:=0;
  for i in 1..8 loop v_sum:=v_sum+substr(p_eik,i,1)::int*(i+2); end loop;
  v_digit:=mod(v_sum,11);
  if v_digit=10 then v_digit:=0; end if;
 end if;
 if v_digit<>substr(p_eik,9,1)::int then return false; end if;
 if length(p_eik)=9 then return true; end if;
 v_weights:=array[2,7,3,5]; v_sum:=0;
 for i in 1..4 loop
  v_sum:=v_sum+substr(p_eik,8+i,1)::int*v_weights[i];
 end loop;
 v_13:=mod(v_sum,11);
 if v_13=10 then
  v_weights:=array[4,9,5,7];v_sum:=0;
  for i in 1..4 loop
   v_sum:=v_sum+substr(p_eik,8+i,1)::int*v_weights[i];
  end loop;
  v_13:=mod(v_sum,11);
  if v_13=10 then v_13:=0; end if;
 end if;
 return v_13=substr(p_eik,13,1)::int;
end $$;
revoke all on function private.ctm_valid_company_eik(text) from public,anon;
grant execute on function private.ctm_valid_company_eik(text) to authenticated;

-- Harden the existing archive integrity trigger without changing immutable source evidence.
create or replace function private.ctm_company_candidate_integrity()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.tenant_id is distinct from old.tenant_id
   or new.source_kind is distinct from old.source_kind
   or new.source_hash is distinct from old.source_hash
   or new.source_label is distinct from old.source_label
   or new.name is distinct from old.name
   or new.confidence is distinct from old.confidence
   or new.created_at is distinct from old.created_at then
    raise exception 'Imported source evidence is immutable' using errcode='42501';
  end if;
  if old.review_status='verified' and (
   new.review_status is distinct from old.review_status
   or new.eik is distinct from old.eik
   or new.promoted_company_id is distinct from old.promoted_company_id
  ) then
   raise exception 'Verified company links are immutable; resolve via audited correction'
    using errcode='42501';
  end if;
  if new.review_status<>'pending' then
   if new.reviewed_by is distinct from (select auth.uid()) or new.reviewed_at is null
    or length(pg_catalog.btrim(new.review_note))<12 then
    raise exception 'Explicit reviewer and review note required' using errcode='42501';
   end if;
  end if;
  if new.promoted_company_id is not null then
   if new.review_status<>'verified' or new.eik is null
    or not exists(
     select 1 from public.companies c where c.id=new.promoted_company_id
      and c.tenant_id=new.tenant_id and c.eik=new.eik
    ) then
     raise exception 'Verified company link and EIK mismatch' using errcode='23514';
   end if;
  end if;
  new.updated_at:=now();
 end if;
 return new;
end $$;

create or replace function public.ctm_promote_company_candidate(
 p_candidate_id uuid,
 p_eik text,
 p_evidence_reference text,
 p_confirmed_name text
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 c public.ctm_company_candidates%rowtype;
 v_company_id uuid;
 v_existing_name text;
 v_created boolean:=false;
 v_eik text:=btrim(coalesce(p_eik,''));
 v_evidence text:=btrim(coalesce(p_evidence_reference,''));
begin
 if (select auth.uid()) is null then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 select * into c from public.ctm_company_candidates
  where id=p_candidate_id for update;
 if not found or not (select private.has_role(c.tenant_id,array['admin'::text])) then
  raise exception 'Candidate missing or unauthorized' using errcode='42501';
 end if;
 if btrim(coalesce(p_confirmed_name,''))<>btrim(c.name) then
  raise exception 'Company name confirmation does not match source' using errcode='22023';
 end if;
 if length(v_evidence)<24 or length(v_evidence)>500 then
  raise exception 'Evidence reference must contain 24-500 characters' using errcode='22023';
 end if;
 if not private.ctm_valid_company_eik(v_eik) then
  raise exception 'Invalid EIK check digit' using errcode='22023';
 end if;
 if c.review_status='excluded' then
  raise exception 'Excluded candidates must not be promoted' using errcode='23514';
 end if;
 if c.review_status='verified' then
  if c.eik=v_eik and c.promoted_company_id is not null then
   return jsonb_build_object('status','already_verified','company_id',c.promoted_company_id,'created',false);
  end if;
  raise exception 'Verified candidate cannot be changed' using errcode='23514';
 end if;
 if exists(
  select 1 from public.companies co
  where co.tenant_id=c.tenant_id and co.eik<>v_eik
   and lower(regexp_replace(btrim(co.name),'\s+',' ','g')) =
       lower(regexp_replace(btrim(c.name),'\s+',' ','g'))
 ) then
  raise exception 'Company name already belongs to another EIK; resolve conflict'
   using errcode='23505';
 end if;
 select id,name into v_company_id,v_existing_name
  from public.companies where tenant_id=c.tenant_id and eik=v_eik
  for update;
 if v_company_id is null then
  insert into public.companies(tenant_id,name,eik,address,status)
   values(c.tenant_id,c.name,v_eik,'','inactive')
   returning id into v_company_id;
  v_created:=true;
 elsif lower(regexp_replace(btrim(v_existing_name),'\s+',' ','g')) <>
        lower(regexp_replace(btrim(c.name),'\s+',' ','g')) then
  raise exception 'EIK is already registered to another company name'
   using errcode='23505';
 end if;
 update public.ctm_company_candidates
  set review_status='verified',eik=v_eik,review_note=v_evidence,
   reviewed_by=(select auth.uid()),reviewed_at=now(),
   promoted_company_id=v_company_id
  where id=c.id and tenant_id=c.tenant_id;
 if not found then raise exception 'Candidate update failed' using errcode='23514'; end if;
 return jsonb_build_object(
  'status','verified','company_id',v_company_id,
  'candidate_id',c.id,'created',v_created
 );
end $$;
revoke all on function public.ctm_promote_company_candidate(uuid,text,text,text) from public,anon;
grant execute on function public.ctm_promote_company_candidate(uuid,text,text,text) to authenticated;

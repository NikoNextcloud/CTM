-- CTM v1.0 reconstruction of migration already present in Supabase history:
-- 20261015141338 / v10_company_candidates_staging.
-- Baseline DDL is for clean installs and version-control reconciliation.
-- DO NOT include source file contents, names, medical data or secrets here.
create table if not exists public.ctm_company_candidates(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 source_kind text not null check(source_kind in ('mega_root','ems_xlsx','uploaded_companies')),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 source_label text not null check(length(source_label) between 1 and 160),
 name text not null check(length(btrim(name)) between 2 and 200),
 normalized_name text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
 confidence text not null default 'uncertain' check(confidence in ('likely','uncertain')),
 review_status text not null default 'pending' check(review_status in ('pending','verified','excluded','conflict')),
 eik text check(eik is null or eik ~ '^[0-9]{9}([0-9]{4})?$'),
 review_note text not null default '' check(length(review_note)<=500),
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint ctm_company_candidate_source_uniq unique(tenant_id,source_kind,source_hash),
 constraint ctm_company_candidate_verified_requires_review
  check(review_status <> 'verified' or (eik is not null and reviewed_by is not null
   and reviewed_at is not null and length(btrim(review_note))>=12))
);
create index if not exists ctm_company_candidates_tenant_normalized
 on public.ctm_company_candidates(tenant_id,normalized_name);
create index if not exists ctm_company_candidates_review
 on public.ctm_company_candidates(tenant_id,review_status,created_at);
alter table public.ctm_company_candidates enable row level security;
grant select,insert,update on public.ctm_company_candidates to authenticated;
revoke all on public.ctm_company_candidates from anon;

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
  if new.review_status<>'pending' then
   if new.reviewed_by is distinct from (select auth.uid()) or new.reviewed_at is null
    or length(pg_catalog.btrim(new.review_note)) < 12 then
    raise exception 'Explicit reviewer and review note required' using errcode='42501';
   end if;
  end if;
  new.updated_at:=now();
 end if;
 return new;
end $$;

do $$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.ctm_company_candidates'::regclass and tgname='ctm_company_candidate_integrity') then
  create trigger ctm_company_candidate_integrity before update on public.ctm_company_candidates
   for each row execute function private.ctm_company_candidate_integrity();
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.ctm_company_candidates'::regclass and tgname='ctm_company_candidate_audit') then
  create trigger ctm_company_candidate_audit after insert or update on public.ctm_company_candidates
   for each row execute function private.record_audit();
 end if;
end $$;

do $$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='ctm_company_candidates' and policyname='ctm_candidate_admin_read') then
  create policy ctm_candidate_admin_read on public.ctm_company_candidates for select to authenticated
   using ((select private.has_role(tenant_id,array['admin'::text])));
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='ctm_company_candidates' and policyname='ctm_candidate_admin_insert') then
  create policy ctm_candidate_admin_insert on public.ctm_company_candidates for insert to authenticated
   with check ((select private.has_role(tenant_id,array['admin'::text]))
    and review_status='pending' and eik is null and reviewed_by is null and reviewed_at is null);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='ctm_company_candidates' and policyname='ctm_candidate_admin_update') then
  create policy ctm_candidate_admin_update on public.ctm_company_candidates for update to authenticated
   using ((select private.has_role(tenant_id,array['admin'::text])))
   with check ((select private.has_role(tenant_id,array['admin'::text])));
 end if;
end $$;

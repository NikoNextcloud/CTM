-- CTM v0.5: reviewable non-clinical employment chronology.
-- No diagnoses, personal identification numbers, medical notes or file attachments.
alter table public.employment_periods
 add column verified_by uuid references auth.users(id),
 add column verified_at timestamptz,
 add column verification_note text not null default ''
  check (length(verification_note)<=300);

-- Reject exact duplicate employment rows; overlapping real-life assignments remain possible.
create unique index employment_periods_exact_unique_v05 on public.employment_periods(
  tenant_id,company_id,employee_id,position_id,started_on
);
create index employment_periods_review_status_v05 on public.employment_periods(
  tenant_id,verification_status,created_at desc
);

create or replace function private.ctm_employment_verification_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid());
begin
 if TG_OP='INSERT' then
   if NEW.verification_status<>'unverified' or NEW.verified_by is not null or NEW.verified_at is not null then
     raise exception 'New periods must start as unverified' using errcode='22023';
   end if;
   NEW.verification_note := '';
   return NEW;
 end if;
 if NEW.verification_status is distinct from OLD.verification_status then
   if v_actor is null or not exists (
     select 1 from public.tenant_members m where m.tenant_id=NEW.tenant_id
       and m.user_id=v_actor and m.active and m.role in ('admin','specialist')
   ) then
     raise exception 'Only authorized CTM staff may review employment history' using errcode='42501';
   end if;
   if NEW.verification_status not in ('verified','conflict','unverified') then
     raise exception 'Unsupported review status' using errcode='22023';
   end if;
   if NEW.verification_status in ('verified','conflict') then
     if length(trim(NEW.verification_note))<12 then
       raise exception 'Provide an evidence/review reference of at least 12 characters' using errcode='22023';
     end if;
     NEW.verified_by:=v_actor;
     NEW.verified_at:=now();
   else
     NEW.verified_by:=null;
     NEW.verified_at:=null;
     NEW.verification_note:='';
   end if;
 else
   NEW.verified_by:=OLD.verified_by;
   NEW.verified_at:=OLD.verified_at;
   NEW.verification_note:=OLD.verification_note;
 end if;
 return NEW;
end $$;

revoke all on function private.ctm_employment_verification_guard() from public,anon,authenticated;
create trigger ctm_employment_review_guard
  before insert or update on public.employment_periods
  for each row execute function private.ctm_employment_verification_guard();

alter table public.employment_periods
 add constraint employment_verified_reference_check
 check (verification_status<>'verified' or (
   verified_by is not null and verified_at is not null
   and length(trim(verification_note))>=12
 ));

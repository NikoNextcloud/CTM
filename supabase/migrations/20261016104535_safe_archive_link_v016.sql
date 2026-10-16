-- CTM v0.16: reviewed, tenant-scoped promotion of encrypted archival personnel.
-- The source remains immutable. No real personal data is included in this migration.

-- Archived is a reversible status, never a hard delete.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_current_status_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_current_status_check
 CHECK (current_status IN ('pending','active','inactive','archived'));

CREATE TABLE IF NOT EXISTS private.ctm_archive_employee_links(
 archive_id uuid PRIMARY KEY REFERENCES private.ctm_archive_rows(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 employee_id uuid NOT NULL REFERENCES public.employees(id),
 linked_by uuid NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,employee_id)
);
ALTER TABLE private.ctm_archive_employee_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ctm_archive_employee_links FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS ctm_archive_employee_links_tenant
 ON private.ctm_archive_employee_links(tenant_id,company_id);

CREATE OR REPLACE FUNCTION private.ctm_promote_archived_employee(
 p_archive_id uuid,p_company_id uuid,p_acknowledged boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_actor uuid:=(SELECT auth.uid());
 v_tenant uuid;v_archive private.ctm_archive_rows%rowtype;
 v_company_name text;v_key text;v_record jsonb;
 v_full_name text;v_archive_company text;v_job text;v_code text;
 v_egn text;v_telk text;v_diagnosis text;v_notes text;v_doctor text;
 v_employee_id uuid;v_old uuid;
BEGIN
 IF v_actor IS NULL OR p_acknowledged IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Explicit administrator confirmation required' USING errcode='42501';
 END IF;
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=v_actor AND m.active AND m.role='admin'
 ORDER BY m.created_at,m.tenant_id LIMIT 1;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'Administrator role required' USING errcode='42501';
 END IF;
 SELECT c.name INTO v_company_name FROM public.companies c
 WHERE c.id=p_company_id AND c.tenant_id=v_tenant AND c.status IN('active','inactive')
 AND EXISTS(SELECT 1 FROM public.ctm_company_candidates x
   WHERE x.tenant_id=v_tenant AND x.promoted_company_id=c.id AND x.review_status='verified');
 IF v_company_name IS NULL THEN
  RAISE EXCEPTION 'Company needs reviewed EIK and verified source' USING errcode='22023';
 END IF;
 SELECT * INTO v_archive FROM private.ctm_archive_rows a
 WHERE a.id=p_archive_id AND a.tenant_id=v_tenant AND a.record_kind='employee_sample'
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Archive source not found or forbidden' USING errcode='42501';
 END IF;
 SELECT l.employee_id INTO v_old FROM private.ctm_archive_employee_links l
 WHERE l.tenant_id=v_tenant AND l.archive_id=p_archive_id;
 IF FOUND THEN
  RETURN pg_catalog.jsonb_build_object('employee_id',v_old,'status','already_linked');
 END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
 WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL OR length(v_key)<32 THEN
  RAISE EXCEPTION 'Archive encryption key unavailable' USING errcode='55000';
 END IF;
 v_record:=(extensions.pgp_sym_decrypt(v_archive.encrypted_json,v_key))::jsonb;
 v_full_name:=pg_catalog.btrim(coalesce(v_record->>'Име Презиме Фамилия',''));
 v_archive_company:=pg_catalog.btrim(coalesce(v_record->>'Фирма',''));
 v_job:=pg_catalog.btrim(coalesce(v_record->>'Длъжност',''));
 v_code:=pg_catalog.btrim(coalesce(v_record->>'Раб No',''));
 v_egn:=pg_catalog.btrim(coalesce(v_record->>'ЕГН',''));
 v_telk:=pg_catalog.btrim(coalesce(v_record->>'ТЕЛК',''));
 v_diagnosis:=pg_catalog.btrim(coalesce(v_record->>'Диагноза',''));
 v_notes:=pg_catalog.btrim(coalesce(v_record->>'Медицински бележки',''));
 v_doctor:=pg_catalog.btrim(coalesce(v_record->>'Личен лекар',''));
 IF length(v_full_name) NOT BETWEEN 3 AND 200 OR length(v_job)>150 OR length(v_code)>80 THEN
  RAISE EXCEPTION 'Archive source has missing or oversized employee fields' USING errcode='22023';
 END IF;
 IF length(v_archive_company)<2 OR
 pg_catalog.upper(pg_catalog.regexp_replace(v_archive_company,'\s+',' ','g')) <>
 pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(v_company_name),'\s+',' ','g')) THEN
  RAISE EXCEPTION 'Archive company differs from verified company; review employer match' USING errcode='22023';
 END IF;
 IF length(v_egn)>0 AND NOT private.ctm_valid_egn(v_egn) THEN
  RAISE EXCEPTION 'Archive EGN invalid; resolve discrepancy before linking' USING errcode='22023';
 END IF;
 IF length(v_telk)>2000 OR length(v_diagnosis)>5000 OR
 length(v_notes)+length(v_doctor)+50>10000 THEN
  RAISE EXCEPTION 'Archive medical content exceeds protected dossier limits' USING errcode='22023';
 END IF;
 -- Name collisions require manual investigation: an automatic merge is never allowed.
 IF EXISTS(SELECT 1 FROM public.employees e
  WHERE e.tenant_id=v_tenant AND e.company_id=p_company_id
   AND pg_catalog.upper(pg_catalog.btrim(e.full_name))=pg_catalog.upper(v_full_name)) THEN
  RAISE EXCEPTION 'Possible existing employee with same name; review duplicate first' USING errcode='23505';
 END IF;
 INSERT INTO public.employees(tenant_id,company_id,full_name,job_title,reference_code,current_status)
 VALUES(v_tenant,p_company_id,v_full_name,v_job,v_code,'pending')
 RETURNING id INTO v_employee_id;
 IF v_egn<>'' OR v_telk<>'' OR v_diagnosis<>'' OR v_notes<>'' OR v_doctor<>'' THEN
  IF v_doctor<>'' THEN
   v_notes:=v_notes||CASE WHEN v_notes<>'' THEN E'\n' ELSE '' END||'Личен лекар (архив): '||v_doctor;
  END IF;
  PERFORM private.ctm_save_employee_clinical(v_employee_id,v_egn,v_telk,v_diagnosis,v_notes,0);
 END IF;
 INSERT INTO private.ctm_archive_employee_links
 (archive_id,tenant_id,company_id,employee_id,linked_by)
 VALUES(p_archive_id,v_tenant,p_company_id,v_employee_id,v_actor);
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'ctm_archive',p_archive_id,'PROMOTE_PENDING');
 RETURN pg_catalog.jsonb_build_object('employee_id',v_employee_id,'status','linked_pending');
END $fn$;

CREATE OR REPLACE FUNCTION private.ctm_archive_employee_link(p_archive_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=(SELECT auth.uid());v_tenant uuid;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=v_actor AND m.active AND m.role='admin'
 ORDER BY m.created_at,m.tenant_id LIMIT 1;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'Administrator role required' USING errcode='42501';
 END IF;
 RETURN (SELECT pg_catalog.jsonb_build_object('employee_id',l.employee_id,
    'company_id',l.company_id,'linked_at',l.linked_at)
 FROM private.ctm_archive_employee_links l
 WHERE l.archive_id=p_archive_id AND l.tenant_id=v_tenant);
END $fn$;

REVOKE ALL ON FUNCTION private.ctm_promote_archived_employee(uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_archive_employee_link(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_promote_archived_employee(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_archive_employee_link(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ctm_promote_archived_employee(
 p_archive_id uuid,p_company_id uuid,p_acknowledged boolean
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_promote_archived_employee(p_archive_id,p_company_id,p_acknowledged);
$fn$;
CREATE OR REPLACE FUNCTION public.ctm_archive_employee_link(p_archive_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_employee_link(p_archive_id);
$fn$;
REVOKE ALL ON FUNCTION public.ctm_promote_archived_employee(uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_employee_link(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ctm_promote_archived_employee(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_employee_link(uuid) TO authenticated;

-- CTM v0.12: confidential employee fields. No patient data or keys in source control.
-- The Vault secret is generated in the database at migration time and never returned.
DO $vault$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ctm_employee_clinical_key_v1') THEN
   PERFORM vault.create_secret(
     pg_catalog.encode(extensions.gen_random_bytes(32),'hex'),
     'ctm_employee_clinical_key_v1',
     'CTM v0.12 medical records encryption key. Include Vault in protected backups.'
   );
 END IF;
END $vault$;

CREATE TABLE IF NOT EXISTS private.ctm_employee_clinical (
 tenant_id uuid NOT NULL,
 company_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 encrypted_record bytea NOT NULL,
 egn_digest bytea,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ctm_employee_clinical_pkey PRIMARY KEY(tenant_id,employee_id),
 CONSTRAINT ctm_employee_clinical_employee_fk FOREIGN KEY(tenant_id,company_id,employee_id)
  REFERENCES public.employees(tenant_id,company_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS ctm_employee_clinical_duplicate_egn
 ON private.ctm_employee_clinical(tenant_id,company_id,egn_digest)
 WHERE egn_digest IS NOT NULL;
CREATE INDEX IF NOT EXISTS ctm_employee_clinical_company
 ON private.ctm_employee_clinical(tenant_id,company_id);

ALTER TABLE private.ctm_employee_clinical ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ctm_employee_clinical FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE vault.decrypted_secrets FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE vault.secrets FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.ctm_valid_egn(p_egn text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_month integer; v_year integer; v_day integer;
 v_weight integer[] := ARRAY[2,4,8,5,10,9,7,3,6];
 v_sum integer:=0; i integer;
BEGIN
 IF p_egn IS NULL OR p_egn !~ '^[0-9]{10}$' THEN RETURN false; END IF;
 v_year:=pg_catalog.substr(p_egn,1,2)::int;
 v_month:=pg_catalog.substr(p_egn,3,2)::int;
 v_day:=pg_catalog.substr(p_egn,5,2)::int;
 IF v_month BETWEEN 1 AND 12 THEN
  v_year:=1900+v_year;
 ELSIF v_month BETWEEN 21 AND 32 THEN
  v_year:=1800+v_year;v_month:=v_month-20;
 ELSIF v_month BETWEEN 41 AND 52 THEN
  v_year:=2000+v_year;v_month:=v_month-40;
 ELSE RETURN false;
 END IF;
 PERFORM pg_catalog.make_date(v_year,v_month,v_day);
 FOR i IN 1..9 LOOP
  v_sum:=v_sum+(pg_catalog.substr(p_egn,i,1)::int)*v_weight[i];
 END LOOP;
 RETURN (v_sum % 11) % 10 = pg_catalog.substr(p_egn,10,1)::int;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
 RETURN false;
END $fn$;

-- Privileged helpers are in a schema not exposed through the Data API.
-- Every call checks current Auth user, active tenant membership and employee tenant.
CREATE OR REPLACE FUNCTION private.ctm_save_employee_clinical(
 p_employee_id uuid,p_egn text,p_telk text,p_diagnosis text,p_notes text,
 p_expected_revision bigint
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;v_company uuid;v_key text;v_actor uuid;
 v_egn text;v_telk text;v_diagnosis text;v_notes text;v_digest bytea;
 v_revision bigint;v_current bigint;v_payload jsonb;
BEGIN
 v_actor:=(SELECT auth.uid());
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING errcode='42501';
 END IF;
 SELECT e.tenant_id,e.company_id INTO v_tenant,v_company
 FROM public.employees e WHERE e.id=p_employee_id;
 IF NOT FOUND OR NOT private.has_role(v_tenant,ARRAY['admin'::text,'doctor'::text]) THEN
  RAISE EXCEPTION 'Not authorized for confidential employee data' USING errcode='42501';
 END IF;
 v_egn:=pg_catalog.btrim(COALESCE(p_egn,''));
 v_telk:=pg_catalog.btrim(COALESCE(p_telk,''));
 v_diagnosis:=pg_catalog.btrim(COALESCE(p_diagnosis,''));
 v_notes:=pg_catalog.btrim(COALESCE(p_notes,''));
 IF length(v_egn)>0 AND NOT private.ctm_valid_egn(v_egn) THEN
  RAISE EXCEPTION 'EGN checksum or date invalid' USING errcode='22023';
 END IF;
 IF length(v_telk)>2000 OR length(v_diagnosis)>5000 OR length(v_notes)>10000
   OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
  RAISE EXCEPTION 'Invalid length or revision' USING errcode='22023';
 END IF;
 SELECT v.decrypted_secret INTO v_key FROM vault.decrypted_secrets v
 WHERE v.name='ctm_employee_clinical_key_v1';
 IF v_key IS NULL OR length(v_key)<32 THEN
  RAISE EXCEPTION 'Encryption key unavailable' USING errcode='55000';
 END IF;
 v_digest:=CASE WHEN length(v_egn)=0 THEN NULL ELSE
  extensions.hmac(pg_catalog.convert_to(v_egn,'UTF8'),pg_catalog.convert_to(v_key,'UTF8'),'sha256') END;
 v_payload:=pg_catalog.jsonb_build_object('egn',v_egn,'telk',v_telk,
  'diagnosis',v_diagnosis,'notes',v_notes);
 SELECT c.revision INTO v_current
 FROM private.ctm_employee_clinical c
 WHERE c.tenant_id=v_tenant AND c.employee_id=p_employee_id
 FOR UPDATE;
 IF FOUND THEN
  IF v_current<>p_expected_revision THEN
   RAISE EXCEPTION 'Concurrent confidential record modification' USING errcode='40001';
  END IF;
 ELSE
  IF p_expected_revision<>0 THEN
   RAISE EXCEPTION 'Confidential record no longer matches the form' USING errcode='40001';
  END IF;
 END IF;
 INSERT INTO private.ctm_employee_clinical
  (tenant_id,company_id,employee_id,encrypted_record,egn_digest,updated_by)
 VALUES
  (v_tenant,v_company,p_employee_id,
   extensions.pgp_sym_encrypt(v_payload::text,v_key,'cipher-algo=aes256'),
   v_digest,v_actor)
 ON CONFLICT (tenant_id,employee_id) DO UPDATE SET
  encrypted_record=EXCLUDED.encrypted_record,
  egn_digest=EXCLUDED.egn_digest,
  updated_by=EXCLUDED.updated_by,
  updated_at=now(),
  revision=private.ctm_employee_clinical.revision+1
 RETURNING revision INTO v_revision;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'employee_clinical',p_employee_id,'UPDATE');
 RETURN pg_catalog.jsonb_build_object('saved',true,'revision',v_revision);
END $fn$;

CREATE OR REPLACE FUNCTION private.ctm_read_employee_clinical(p_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;v_actor uuid;v_key text;v_blob bytea;
 v_revision bigint;v_date timestamptz;v_json jsonb;
BEGIN
 v_actor:=(SELECT auth.uid());
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING errcode='42501';
 END IF;
 SELECT e.tenant_id INTO v_tenant FROM public.employees e WHERE e.id=p_employee_id;
 IF NOT FOUND OR NOT private.has_role(v_tenant,ARRAY['admin'::text,'doctor'::text]) THEN
  RAISE EXCEPTION 'Not authorized for confidential employee data' USING errcode='42501';
 END IF;
 SELECT encrypted_record,revision,updated_at INTO v_blob,v_revision,v_date
 FROM private.ctm_employee_clinical WHERE tenant_id=v_tenant AND employee_id=p_employee_id;
 IF v_blob IS NULL THEN
  v_json:=pg_catalog.jsonb_build_object('egn','','telk','','diagnosis','','notes','',
   'revision',0,'has_record',false);
 ELSE
  SELECT v.decrypted_secret INTO v_key FROM vault.decrypted_secrets v
   WHERE v.name='ctm_employee_clinical_key_v1';
  IF v_key IS NULL THEN RAISE EXCEPTION 'Encryption key unavailable' USING errcode='55000'; END IF;
  v_json:=(extensions.pgp_sym_decrypt(v_blob,v_key))::jsonb ||
   pg_catalog.jsonb_build_object('revision',v_revision,'has_record',true,'updated_at',v_date);
 END IF;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'employee_clinical',p_employee_id,'READ');
 RETURN v_json;
END $fn$;

REVOKE ALL ON FUNCTION private.ctm_save_employee_clinical(uuid,text,text,text,text,bigint)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_read_employee_clinical(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_save_employee_clinical(uuid,text,text,text,text,bigint)
 TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_read_employee_clinical(uuid)
 TO authenticated;

-- Public wrappers remain invoker functions. Authorization remains in private helpers.
CREATE OR REPLACE FUNCTION public.ctm_save_employee_clinical(
 p_employee_id uuid,p_egn text,p_telk text,p_diagnosis text,p_notes text,
 p_expected_revision bigint
)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_save_employee_clinical(
  p_employee_id,p_egn,p_telk,p_diagnosis,p_notes,p_expected_revision);
$fn$;

CREATE OR REPLACE FUNCTION public.ctm_read_employee_clinical(p_employee_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_read_employee_clinical(p_employee_id);
$fn$;
REVOKE ALL ON FUNCTION public.ctm_save_employee_clinical(uuid,text,text,text,text,bigint)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_read_employee_clinical(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ctm_save_employee_clinical(uuid,text,text,text,text,bigint)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_read_employee_clinical(uuid)
 TO authenticated;

-- Auditors can see administrative audit events, not the identities or metadata
-- of confidential medical dossier access.
DROP POLICY IF EXISTS audit_view ON public.audit_events;
CREATE POLICY audit_view ON public.audit_events FOR SELECT TO authenticated
 USING (
  (SELECT private.has_role(audit_events.tenant_id,ARRAY['admin'::text]))
  OR (
   audit_events.entity <> 'employee_clinical'
   AND (SELECT private.has_role(audit_events.tenant_id,ARRAY['auditor'::text]))
  )
 );

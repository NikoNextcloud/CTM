-- CTM v0.17: reversible corrections to immutable encrypted EMS-STM employee archive.
-- No personal records or keys are included in this migration.
CREATE TABLE IF NOT EXISTS private.ctm_archive_employee_changes (
  archive_id uuid NOT NULL REFERENCES private.ctm_archive_rows(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  revision bigint NOT NULL CHECK (revision > 0),
  encrypted_data bytea NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (archive_id, revision)
);
CREATE INDEX IF NOT EXISTS ctm_archive_employee_changes_tenant
ON private.ctm_archive_employee_changes (tenant_id, archive_id, revision DESC);
ALTER TABLE private.ctm_archive_employee_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_archive_employee_changes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.ctm_archive_employee_current(p_record uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=(SELECT auth.uid());v_tenant uuid;v_original jsonb;
 v_payload jsonb;v_revision bigint:=0;v_key text;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
  WHERE m.user_id=v_actor AND m.role='admin' AND m.active
  ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';
 END IF;
 v_original:=private.ctm_archive_get(p_record);
 IF v_original->>'kind'<>'employee_sample' THEN
  RAISE EXCEPTION 'Not an employee archive record' USING ERRCODE='22023';
 END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
 WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Encryption key missing' USING ERRCODE='55000'; END IF;
 SELECT (extensions.pgp_sym_decrypt(c.encrypted_data,v_key))::jsonb,c.revision
 INTO v_payload,v_revision
 FROM private.ctm_archive_employee_changes c
 WHERE c.archive_id=p_record AND c.tenant_id=v_tenant
 ORDER BY c.revision DESC LIMIT 1;
 RETURN (v_original-'data') || jsonb_build_object(
  'data',coalesce(v_payload,v_original->'data'),
  'revision',coalesce(v_revision,0),
  'has_correction',v_payload IS NOT NULL);
END $fn$;

CREATE OR REPLACE FUNCTION private.ctm_archive_employee_save(
 p_archive_id uuid,p_data jsonb,p_expected_revision bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=(SELECT auth.uid());v_tenant uuid;
 v_record private.ctm_archive_rows%rowtype; v_original jsonb;v_current bigint;
 v_key text;v_col record;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
  WHERE m.user_id=v_actor AND m.role='admin' AND m.active
  ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0
 OR p_data IS NULL OR pg_catalog.jsonb_typeof(p_data)<>'object'
 OR pg_catalog.octet_length(p_data::text)>65536 THEN
  RAISE EXCEPTION 'Invalid archive correction payload' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_record FROM private.ctm_archive_rows
 WHERE id=p_archive_id AND tenant_id=v_tenant AND record_kind='employee_sample'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Archive record not found' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.ctm_archive_employee_links
   WHERE archive_id=p_archive_id AND tenant_id=v_tenant) THEN
   RAISE EXCEPTION 'Linked archive is immutable; edit the active dossier instead' USING ERRCODE='22023';
 END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
 WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Encryption key missing' USING ERRCODE='55000'; END IF;
 v_original:=(extensions.pgp_sym_decrypt(v_record.encrypted_json,v_key))::jsonb;
 IF (SELECT count(*) FROM jsonb_object_keys(p_data))<>
    (SELECT count(*) FROM jsonb_object_keys(v_original))
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) AS x(k) WHERE NOT v_original ? x.k)
 OR EXISTS(SELECT 1 FROM jsonb_each(p_data) AS x(k,v)
           WHERE jsonb_typeof(x.v)<>'string' OR length(x.v #>> '{}')>10000)
 THEN RAISE EXCEPTION 'Archive columns are missing, added or oversized' USING ERRCODE='22023'; END IF;
 -- Preserve immutable source identifiers, including the Excel row and source sheet.
 IF (SELECT jsonb_object_agg(k,p_data->k) FROM unnest(ARRAY['Източник','Изходен лист','Ред в Excel']) AS k WHERE v_original ? k)
    IS DISTINCT FROM
    (SELECT jsonb_object_agg(k,v_original->k) FROM unnest(ARRAY['Източник','Изходен лист','Ред в Excel']) AS k WHERE v_original ? k)
 THEN RAISE EXCEPTION 'Source provenance cannot be edited' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_data->>'Име Презиме Фамилия',''))) NOT BETWEEN 3 AND 200
 OR length(p_data->>'Фирма')>200 OR length(p_data->>'Длъжност')>150
 OR length(p_data->>'Раб No')>80 THEN
  RAISE EXCEPTION 'Invalid employee name or company fields' USING ERRCODE='22023';
 END IF;
 IF coalesce(p_data->>'ЕГН','')<>coalesce(v_original->>'ЕГН','')
 AND coalesce(p_data->>'ЕГН','')<>'' AND NOT private.ctm_valid_egn(p_data->>'ЕГН')
 THEN RAISE EXCEPTION 'Corrected EGN fails check digit or date' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(revision),0) INTO v_current
 FROM private.ctm_archive_employee_changes WHERE archive_id=p_archive_id AND tenant_id=v_tenant;
 IF v_current<>p_expected_revision THEN
  RAISE EXCEPTION 'Stale archive revision; refresh before saving' USING ERRCODE='40001';
 END IF;
 INSERT INTO private.ctm_archive_employee_changes
 (archive_id,tenant_id,revision,encrypted_data,changed_by)
 VALUES(p_archive_id,v_tenant,v_current+1,
  extensions.pgp_sym_encrypt(p_data::text,v_key,'cipher-algo=aes256'),v_actor);
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'ctm_archive',p_archive_id,'EDIT_CORRECTION');
 RETURN jsonb_build_object('saved',true,'revision',v_current+1);
END $fn$;

CREATE OR REPLACE FUNCTION public.ctm_archive_employee_current(p_record uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_employee_current(p_record)
$fn$;
CREATE OR REPLACE FUNCTION public.ctm_archive_employee_save(
 p_archive_id uuid,p_data jsonb,p_expected_revision bigint
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_employee_save(p_archive_id,p_data,p_expected_revision)
$fn$;
REVOKE ALL ON FUNCTION private.ctm_archive_employee_current(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_archive_employee_save(uuid,jsonb,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_employee_current(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_employee_save(uuid,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_archive_employee_current(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_archive_employee_save(uuid,jsonb,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_employee_current(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_employee_save(uuid,jsonb,bigint) TO authenticated;

-- Future promotion must use corrected values if a revision exists; the original
-- archive row remains untouched and all corrections retain append-only history.
DO $patch_promote$
DECLARE v_body text;v_old text;v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='ctm_promote_archived_employee';
 v_old:='v_record:=(extensions.pgp_sym_decrypt(v_archive.encrypted_json,v_key))::jsonb;';
 v_new:=v_old||E'\n'||$q$
 v_record:=coalesce((
  SELECT (extensions.pgp_sym_decrypt(ch.encrypted_data,v_key))::jsonb
  FROM private.ctm_archive_employee_changes ch
  WHERE ch.archive_id=p_archive_id AND ch.tenant_id=v_tenant
  ORDER BY ch.revision DESC LIMIT 1
 ),v_record);
 $q$;
 IF v_body IS NULL OR strpos(v_body,v_old)=0 THEN
  RAISE EXCEPTION 'Existing promotion function differs: refusing untested update';
 END IF;
 EXECUTE replace(v_body,v_old,v_new);
END $patch_promote$;

DO $patch_list$
DECLARE v_body text;v_old text;v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_body
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='ctm_archive_list';
 v_old:='v_data:=(extensions.pgp_sym_decrypt(v_record.encrypted_json,v_key))::jsonb;';
 v_new:=v_old||E'\n'||$q$
 IF p_kind='employee_sample' THEN
  v_data:=coalesce((
   SELECT (extensions.pgp_sym_decrypt(ch.encrypted_data,v_key))::jsonb
   FROM private.ctm_archive_employee_changes ch
   WHERE ch.archive_id=v_record.id AND ch.tenant_id=v_tenant
   ORDER BY ch.revision DESC LIMIT 1
  ),v_data);
 END IF;
 $q$;
 IF v_body IS NULL OR strpos(v_body,v_old)=0 THEN
  RAISE EXCEPTION 'Existing archive list differs: refusing untested update';
 END IF;
 EXECUTE replace(v_body,v_old,v_new);
END $patch_list$;

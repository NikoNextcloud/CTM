-- CTM v0.13: archive-source staging without inventing employer/employee identity.
-- No source personal data or secret values in this migration.
DO $do$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='ctm_archive_key_v1') THEN
  PERFORM vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32),'hex'),
   'ctm_archive_key_v1','Archive staging key; preserve Vault in backup and restore drills');
 END IF;
END $do$;

CREATE TABLE IF NOT EXISTS private.ctm_archive_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 source_code text NOT NULL CHECK (source_code ~ '^[A-Za-z0-9._:-]{3,100}$'),
 record_kind text NOT NULL CHECK(record_kind IN
  ('employee_sample','file_manifest','person_candidate','contract_person',
   'identifier','date_reference','folder_summary','source_issue','source_company')),
 source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 120),
 row_index int NOT NULL CHECK(row_index>0),
 row_mac text NOT NULL CHECK(row_mac ~ '^[0-9a-f]{64}$'),
 encrypted_json bytea NOT NULL,
 staged_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ctm_archive_source_key_unique UNIQUE(tenant_id,source_code,record_kind,source_key)
);
CREATE INDEX IF NOT EXISTS ctm_archive_kind_listing
 ON private.ctm_archive_rows(tenant_id,record_kind,source_code,row_index);
ALTER TABLE private.ctm_archive_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_archive_rows FROM PUBLIC,anon,authenticated;

-- Privileged ingestion, not an exposed API. The caller must be the database
-- owner/maintenance role; no authenticated or anonymous access to this function.
CREATE OR REPLACE FUNCTION private.ctm_archive_ingest_batch(
 p_tenant uuid,p_source text,p_kind text,p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_key text; v_item jsonb; v_payload jsonb;
 v_source_key text;v_row_index int;v_mac text;v_existing text;
 v_inserted int:=0;v_already int:=0;
BEGIN
 IF p_tenant IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=p_tenant)
  THEN RAISE EXCEPTION 'Unknown tenant' USING errcode='22023'; END IF;
 IF p_source !~ '^[A-Za-z0-9._:-]{3,100}$' OR
    p_kind NOT IN ('employee_sample','file_manifest','person_candidate','contract_person',
                  'identifier','date_reference','folder_summary','source_issue','source_company') THEN
  RAISE EXCEPTION 'Invalid source or category' USING errcode='22023';
 END IF;
 IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows)<>'array' OR
   pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Batch must contain 1-200 entries' USING errcode='22023'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
  WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL OR length(v_key)<32 THEN
  RAISE EXCEPTION 'Archive encryption key missing' USING errcode='55000'; END IF;
 FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
  v_source_key:=v_item->>'source_key';
  v_row_index:=(v_item->>'row_index')::int;
  v_payload:=v_item->'data';
  IF v_source_key IS NULL OR length(v_source_key) NOT BETWEEN 1 AND 120 OR
   v_row_index<1 OR v_payload IS NULL OR pg_catalog.jsonb_typeof(v_payload)<>'object' OR
   pg_catalog.octet_length(v_payload::text)>30000 THEN
   RAISE EXCEPTION 'Invalid source row' USING errcode='22023'; END IF;
  v_mac:=pg_catalog.encode(extensions.hmac(
   pg_catalog.convert_to(v_payload::text,'UTF8'),pg_catalog.convert_to(v_key,'UTF8'),'sha256'),'hex');
  SELECT row_mac INTO v_existing FROM private.ctm_archive_rows
   WHERE tenant_id=p_tenant AND source_code=p_source AND
     record_kind=p_kind AND source_key=v_source_key;
  IF FOUND THEN
   IF v_existing<>v_mac THEN
    RAISE EXCEPTION 'Source row checksum changed, refusing overwrite' USING errcode='23505';
   END IF;
   v_already:=v_already+1;
  ELSE
   INSERT INTO private.ctm_archive_rows
    (tenant_id,source_code,record_kind,source_key,row_index,row_mac,encrypted_json)
   VALUES(p_tenant,p_source,p_kind,v_source_key,v_row_index,v_mac,
    extensions.pgp_sym_encrypt(v_payload::text,v_key,'cipher-algo=aes256'))
   ON CONFLICT(tenant_id,source_code,record_kind,source_key) DO NOTHING;
   IF FOUND THEN v_inserted:=v_inserted+1;ELSE v_already:=v_already+1;END IF;
  END IF;
 END LOOP;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(p_tenant,NULL,'ctm_archive',NULL,'STAGE');
 RETURN pg_catalog.jsonb_build_object('inserted',v_inserted,'existing',v_already,
   'source',p_source,'kind',p_kind);
END $fn$;
REVOKE ALL ON FUNCTION private.ctm_archive_ingest_batch(uuid,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;

-- Read helpers decrypt only after checking a real, active administrator in the tenant.
CREATE OR REPLACE FUNCTION private.ctm_archive_list(p_kind text,p_limit int,p_offset int)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;v_tenant uuid;v_key text;v_total bigint;v_rows jsonb:='[]'::jsonb;
 v_record record;v_data jsonb;v_label text;v_secondary text;
BEGIN
 v_actor:=(SELECT auth.uid());
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501'; END IF;
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
  WHERE m.user_id=v_actor AND m.active AND m.role='admin'
  ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Admin role required' USING errcode='42501'; END IF;
 IF p_kind NOT IN('employee_sample','file_manifest','person_candidate','contract_person',
     'identifier','date_reference','folder_summary','source_issue','source_company') OR
    p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 1000000 THEN
  RAISE EXCEPTION 'Invalid list arguments' USING errcode='22023'; END IF;
 SELECT count(*) INTO v_total FROM private.ctm_archive_rows
  WHERE tenant_id=v_tenant AND record_kind=p_kind;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
  WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Archive decryption key missing' USING errcode='55000'; END IF;
 FOR v_record IN SELECT id,source_code,source_key,row_index,encrypted_json
  FROM private.ctm_archive_rows WHERE tenant_id=v_tenant AND record_kind=p_kind
  ORDER BY source_code,row_index,id LIMIT p_limit OFFSET p_offset LOOP
  v_data:=(extensions.pgp_sym_decrypt(v_record.encrypted_json,v_key))::jsonb;
  v_label:=CASE p_kind
   WHEN 'employee_sample' THEN coalesce(v_data->>'Име Презиме Фамилия','Без име')
   WHEN 'file_manifest' THEN coalesce(v_data->>'path',v_data->>'name','Без име')
   WHEN 'person_candidate' THEN coalesce(v_data->>'Имена (от файл)','За проверка')
   WHEN 'contract_person' THEN coalesce(v_data->>'Имена от трудов договор','За проверка')
   WHEN 'source_company' THEN coalesce(v_data->>'Фирма',v_data->>'Име на фирма (от папка)','За проверка')
   ELSE coalesce(v_data->>'Фирма',v_data->>'Тип',v_data->>'Източник','Архивен запис') END;
  v_secondary:=CASE p_kind
   WHEN 'employee_sample' THEN coalesce(v_data->>'Фирма','')
   WHEN 'file_manifest' THEN coalesce(v_data->>'category',v_data->>'Категория (ориентировъчно)','')
   ELSE coalesce(v_data->>'Фирма (папка)',v_data->>'Фирма','') END;
  v_rows:=v_rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'id',v_record.id,'source',v_record.source_code,'row',v_record.row_index,
   'label',pg_catalog.left(v_label,250),'secondary',pg_catalog.left(v_secondary,200)));
 END LOOP;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'ctm_archive',NULL,'LIST');
 RETURN pg_catalog.jsonb_build_object('total',v_total,'rows',v_rows,'kind',p_kind);
END $fn$;

CREATE OR REPLACE FUNCTION private.ctm_archive_get(p_record uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;v_tenant uuid;v_key text;v_record private.ctm_archive_rows%rowtype;
BEGIN
 v_actor:=(SELECT auth.uid());
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501'; END IF;
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=v_actor AND m.active AND m.role='admin'
 ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Admin role required' USING errcode='42501'; END IF;
 SELECT * INTO v_record FROM private.ctm_archive_rows
  WHERE id=p_record AND tenant_id=v_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'No authorized archive record' USING errcode='42501'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets
  WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Archive decryption key missing' USING errcode='55000'; END IF;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'ctm_archive',p_record,'READ');
 RETURN pg_catalog.jsonb_build_object('id',v_record.id,'kind',v_record.record_kind,
 'source',v_record.source_code,'row',v_record.row_index,
 'data',(extensions.pgp_sym_decrypt(v_record.encrypted_json,v_key))::jsonb);
END $fn$;

CREATE OR REPLACE FUNCTION private.ctm_archive_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;v_tenant uuid;
BEGIN
 v_actor:=(SELECT auth.uid());
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501'; END IF;
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=v_actor AND m.active AND m.role='admin'
 ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Admin role required' USING errcode='42501'; END IF;
 RETURN coalesce((
  SELECT pg_catalog.jsonb_object_agg(kind,num)
  FROM (SELECT record_kind AS kind,count(*) AS num
   FROM private.ctm_archive_rows WHERE tenant_id=v_tenant GROUP BY record_kind) s
 ),'{}'::jsonb);
END $fn$;

REVOKE ALL ON FUNCTION private.ctm_archive_list(text,int,int) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_archive_get(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_archive_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_archive_list(text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_archive_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_archive_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.ctm_archive_list(p_kind text,p_limit int,p_offset int)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_list(p_kind,p_limit,p_offset); $fn$;
CREATE OR REPLACE FUNCTION public.ctm_archive_get(p_record uuid)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_get(p_record); $fn$;
CREATE OR REPLACE FUNCTION public.ctm_archive_stats()
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_stats(); $fn$;
REVOKE ALL ON FUNCTION public.ctm_archive_list(text,int,int) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_get(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ctm_archive_list(text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_stats() TO authenticated;

DROP POLICY IF EXISTS audit_view ON public.audit_events;
CREATE POLICY audit_view ON public.audit_events FOR SELECT TO authenticated
 USING (
  (SELECT private.has_role(audit_events.tenant_id,ARRAY['admin'::text]))
  OR (audit_events.entity NOT IN ('ctm_archive','employee_clinical')
    AND (SELECT private.has_role(audit_events.tenant_id,ARRAY['auditor'::text])))
 );

-- CTM v0.14: authenticated import into previously deployed encrypted archive staging.
-- Data is supplied by the administrator through the protected CTM browser UI.
-- No personnel, diagnoses, source spreadsheets or credentials live in this migration.
CREATE OR REPLACE FUNCTION private.ctm_archive_ingest_admin(
 p_source text, p_kind text, p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_actor uuid:=(SELECT auth.uid());
 v_tenant uuid;
 v_result jsonb;
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING errcode='42501';
 END IF;
 SELECT m.tenant_id INTO v_tenant
 FROM public.tenant_members m
 WHERE m.user_id=v_actor AND m.active AND m.role='admin'
 ORDER BY m.created_at, m.tenant_id LIMIT 1;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'Administrator membership required' USING errcode='42501';
 END IF;
 IF p_source IS NULL OR p_source !~ '^UPLOAD_[a-f0-9]{64}$'
  OR p_kind NOT IN ('employee_sample','person_candidate','contract_person',
                    'source_company','file_manifest','source_issue') THEN
  RAISE EXCEPTION 'Unsupported archive source or record type' USING errcode='22023';
 END IF;
 IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows)<>'array'
   OR pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Invalid archive batch' USING errcode='22023';
 END IF;
 -- Invokes the existing v0.13 encrypted, HMAC-deduplicated archive writer
 -- with the actor's DB-verified tenant. This call is one transaction.
 v_result:=private.ctm_archive_ingest_batch(v_tenant,p_source,p_kind,p_rows);
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(v_tenant,v_actor,'ctm_archive',NULL,'USER_UPLOAD');
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION private.ctm_archive_ingest_admin(text,text,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_archive_ingest_admin(text,text,jsonb)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.ctm_archive_ingest_admin(
 p_source text, p_kind text, p_rows jsonb
) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_ingest_admin(p_source,p_kind,p_rows);
$fn$;
REVOKE ALL ON FUNCTION public.ctm_archive_ingest_admin(text,text,jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ctm_archive_ingest_admin(text,text,jsonb)
 TO authenticated;

-- Record source status without disclosing personal values, for comparing
-- expected source rows against the encrypted staging table.
CREATE OR REPLACE FUNCTION private.ctm_archive_source_status(p_source text,p_kind text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;v_actor uuid:=(SELECT auth.uid());
BEGIN
 IF v_actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING errcode='42501';
 END IF;
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=v_actor AND active AND role='admin'
 ORDER BY created_at,tenant_id LIMIT 1;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'Admin membership required' USING errcode='42501';
 END IF;
 IF p_source IS NULL OR p_source !~ '^UPLOAD_[a-f0-9]{64}$'
   OR p_kind NOT IN ('employee_sample','person_candidate','contract_person',
                    'source_company','file_manifest','source_issue') THEN
  RAISE EXCEPTION 'Invalid source' USING errcode='22023';
 END IF;
 RETURN (SELECT pg_catalog.jsonb_build_object(
  'source',p_source,'kind',p_kind,'count',count(*),
  'lowest_row',min(row_index),'highest_row',max(row_index))
 FROM private.ctm_archive_rows
 WHERE tenant_id=v_tenant AND source_code=p_source AND record_kind=p_kind);
END $fn$;

CREATE OR REPLACE FUNCTION public.ctm_archive_source_status(p_source text,p_kind text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_archive_source_status(p_source,p_kind);
$fn$;
REVOKE ALL ON FUNCTION private.ctm_archive_source_status(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_source_status(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_archive_source_status(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_source_status(text,text) TO authenticated;

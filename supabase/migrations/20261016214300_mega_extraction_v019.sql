-- CTM v0.19 encrypted source extraction. Sensitive document text is never committed.
CREATE TABLE IF NOT EXISTS private.ctm_mega_extractions (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 source_id text NOT NULL,
 mega_handle text NOT NULL,
 content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
 content_bytes bigint NOT NULL CHECK (content_bytes>=0),
 extractor text NOT NULL,
 encrypted_text bytea,
 extract_state text NOT NULL CHECK(extract_state IN ('parsed','unsupported','error','empty','truncated')),
 extracted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_id,mega_handle),
 FOREIGN KEY(tenant_id,source_id,mega_handle)
 REFERENCES private.ctm_mega_files(tenant_id,source_id,mega_handle)
);
ALTER TABLE private.ctm_mega_extractions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_mega_extractions FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.ctm_mega_extract_ingest(p_job_token text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_job private.ctm_mega_import_jobs%rowtype;v_key text;v_row jsonb;v_added integer:=0;v_n integer;
BEGIN
 IF p_job_token !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_rows)<>'array'
 OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 25
 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 SELECT * INTO v_job FROM private.ctm_mega_import_jobs
 WHERE token_hash=encode(extensions.digest(p_job_token,'sha256'),'hex')
 AND NOT revoked AND expires_at>now() AND source_id='Lz50mLTT' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized job' USING ERRCODE='42501';END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Encryption unavailable' USING ERRCODE='55000';END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) e(value) LOOP
  IF (v_row->>'handle') !~ '^[A-Za-z0-9_-]{8,32}$'
  OR (v_row->>'sha256') !~ '^[0-9a-f]{64}$'
  OR (v_row->>'bytes') !~ '^[0-9]{1,13}$'
  OR (v_row->>'state') NOT IN ('parsed','unsupported','error','empty','truncated')
  OR (v_row->>'extractor') !~ '^[a-z0-9_-]{2,40}$'
  OR length(coalesce(v_row->>'text',''))>100000
  THEN RAISE EXCEPTION 'Invalid extraction row' USING ERRCODE='22023';END IF;
  INSERT INTO private.ctm_mega_extractions
  (tenant_id,source_id,mega_handle,content_sha256,content_bytes,extractor,encrypted_text,extract_state)
  VALUES(v_job.tenant_id,'Lz50mLTT',v_row->>'handle',v_row->>'sha256',(v_row->>'bytes')::bigint,
   v_row->>'extractor',CASE WHEN length(coalesce(v_row->>'text',''))>0
   THEN extensions.pgp_sym_encrypt(v_row->>'text',v_key,'cipher-algo=aes256') ELSE NULL END,v_row->>'state')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n=ROW_COUNT;v_added:=v_added+v_n;
 END LOOP;
 RETURN jsonb_build_object('added',v_added,'received',jsonb_array_length(p_rows));
END $fn$;
CREATE OR REPLACE FUNCTION public.ctm_mega_extract_ingest(p_job_token text,p_rows jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.ctm_mega_extract_ingest(p_job_token,p_rows)
$fn$;
REVOKE ALL ON FUNCTION private.ctm_mega_extract_ingest(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ctm_mega_extract_ingest(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_mega_extract_ingest(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ctm_mega_extract_ingest(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION private.ctm_mega_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_tenant uuid;
BEGIN
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=(SELECT auth.uid()) AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object(
  'total_files',(SELECT count(*) FROM private.ctm_mega_files f WHERE f.tenant_id=v_tenant),
  'total_bytes',(SELECT coalesce(sum(f.bytes),0) FROM private.ctm_mega_files f WHERE f.tenant_id=v_tenant),
  'root_groups',(SELECT count(DISTINCT f.root_handle) FROM private.ctm_mega_files f WHERE f.tenant_id=v_tenant),
  'stored_files',(SELECT count(*) FROM private.ctm_mega_files f WHERE f.tenant_id=v_tenant AND f.storage_path IS NOT NULL),
  'extracted_files',(SELECT count(*) FROM private.ctm_mega_extractions x WHERE x.tenant_id=v_tenant),
  'readable_files',(SELECT count(*) FROM private.ctm_mega_extractions x WHERE x.tenant_id=v_tenant AND x.extract_state IN ('parsed','truncated')),
  'unsupported_files',(SELECT count(*) FROM private.ctm_mega_extractions x WHERE x.tenant_id=v_tenant AND x.extract_state='unsupported'),
  'error_files',(SELECT count(*) FROM private.ctm_mega_extractions x WHERE x.tenant_id=v_tenant AND x.extract_state='error'),
  'needs_review',(SELECT count(*) FROM private.ctm_mega_files f WHERE f.tenant_id=v_tenant)-(SELECT count(*) FROM private.ctm_mega_extractions x WHERE x.tenant_id=v_tenant),
  'medical_verified',0));
END $fn$;

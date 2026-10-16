-- Reproducible, private CTM v0.18 catalogue. No personal data or keys.
CREATE TABLE IF NOT EXISTS private.ctm_mega_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 source_id text NOT NULL DEFAULT 'Lz50mLTT',token_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS private.ctm_mega_files (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),source_id text NOT NULL DEFAULT 'Lz50mLTT',
 mega_handle text NOT NULL CHECK(mega_handle ~ '^[A-Za-z0-9_-]{8,32}$'),
 root_handle text NOT NULL CHECK(root_handle ~ '^[A-Za-z0-9_-]{8,32}$'),
 encrypted_root_name bytea NOT NULL,encrypted_path bytea NOT NULL,encrypted_filename bytea NOT NULL,
 extension text NOT NULL DEFAULT '',bytes bigint NOT NULL CHECK(bytes>=0),mime_type text NOT NULL DEFAULT '',
 migration_state text NOT NULL DEFAULT 'indexed' CHECK(migration_state IN ('indexed','stored','extracted','review_required','verified')),
 classification text NOT NULL DEFAULT 'unknown' CHECK(classification IN ('unknown','administrative','medical')),
 storage_path text,sha256 text,added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_id,mega_handle),
 CONSTRAINT ctm_mega_store_pair CHECK ((storage_path IS NULL AND sha256 IS NULL) OR (storage_path IS NOT NULL AND sha256 IS NOT NULL)));
CREATE INDEX IF NOT EXISTS ctm_mega_tenant_root_idx ON private.ctm_mega_files(tenant_id,source_id,root_handle);
CREATE INDEX IF NOT EXISTS ctm_mega_state_idx ON private.ctm_mega_files(tenant_id,migration_state);
ALTER TABLE private.ctm_mega_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ctm_mega_import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_mega_files,private.ctm_mega_import_jobs FROM PUBLIC,anon,authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES ('ctm-private-originals','ctm-private-originals',false,52428800) ON CONFLICT(id) DO NOTHING;
DO $pol$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ctm_originals_admin_read') THEN
  CREATE POLICY ctm_originals_admin_read ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='ctm-private-originals' AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role='admin' AND m.tenant_id::text=split_part(name,'/',1)));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ctm_originals_admin_upload') THEN
  CREATE POLICY ctm_originals_admin_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='ctm-private-originals' AND EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role='admin' AND m.tenant_id::text=split_part(name,'/',1)));
 END IF;
END $pol$;

CREATE OR REPLACE FUNCTION private.ctm_mega_ingest_internal(p_job_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_job private.ctm_mega_import_jobs%rowtype;v_row jsonb;v_key text;
 v_name text;v_path text;v_root text;v_handle text;v_root_handle text;
 v_ext text;v_bytes bigint;v_inserted integer:=0;v_added integer;
BEGIN
 IF p_job_token IS NULL OR p_job_token !~ '^[a-f0-9]{64}$'
 OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
 OR jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>100 THEN
   RAISE EXCEPTION 'Invalid ingestion request' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_job FROM private.ctm_mega_import_jobs
 WHERE token_hash=pg_catalog.encode(extensions.digest(p_job_token,'sha256'),'hex')
 AND NOT revoked AND expires_at>now() AND source_id='Lz50mLTT'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import authorization denied' USING ERRCODE='42501'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Archive key is unavailable' USING ERRCODE='55000'; END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) AS z(value) LOOP
   v_name:=v_row->>'name';v_path:=v_row->>'path';v_root:=v_row->>'root';
   v_handle:=v_row->>'handle';v_root_handle:=v_row->>'root_handle';
   v_ext:=lower(coalesce(v_row->>'ext',''));
   IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 300
   OR v_path IS NULL OR length(v_path) NOT BETWEEN 1 AND 2200
   OR v_root IS NULL OR length(v_root) NOT BETWEEN 1 AND 300
   OR v_handle IS NULL OR v_handle !~ '^[A-Za-z0-9_-]{8,32}$'
   OR v_root_handle IS NULL OR v_root_handle !~ '^[A-Za-z0-9_-]{8,32}$'
   OR v_ext !~ '^[a-z0-9]{0,15}$'
   OR (v_row->>'bytes') IS NULL OR (v_row->>'bytes') !~ '^[0-9]{1,13}$'
   THEN RAISE EXCEPTION 'Invalid MEGA file metadata' USING ERRCODE='22023'; END IF;
   v_bytes:=(v_row->>'bytes')::bigint;
   INSERT INTO private.ctm_mega_files
   (tenant_id,source_id,mega_handle,root_handle,encrypted_root_name,encrypted_path,encrypted_filename,extension,bytes)
   VALUES (v_job.tenant_id,'Lz50mLTT',v_handle,v_root_handle,
      extensions.pgp_sym_encrypt(v_root,v_key,'cipher-algo=aes256'),
      extensions.pgp_sym_encrypt(v_path,v_key,'cipher-algo=aes256'),
      extensions.pgp_sym_encrypt(v_name,v_key,'cipher-algo=aes256'),v_ext,v_bytes)
   ON CONFLICT (tenant_id,source_id,mega_handle) DO NOTHING;
   GET DIAGNOSTICS v_added=ROW_COUNT;
   v_inserted:=v_inserted+v_added;
 END LOOP;
 RETURN jsonb_build_object('added',v_inserted,'received',jsonb_array_length(p_rows));
END $function$


CREATE OR REPLACE FUNCTION private.ctm_mega_issue_token(p_tenant uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_token text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id=p_tenant) THEN
  RAISE EXCEPTION 'Tenant not found' USING ERRCODE='22023';
 END IF;
 v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO private.ctm_mega_import_jobs(tenant_id,token_hash,expires_at)
 VALUES(p_tenant,pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '1 hour');
 RETURN v_token;
END $function$


CREATE OR REPLACE FUNCTION private.ctm_mega_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;
BEGIN
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=(SELECT auth.uid()) AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object(
  'total_files',count(*),'total_bytes',coalesce(sum(bytes),0),
  'root_groups',count(DISTINCT root_handle),
  'stored_files',count(*) FILTER (WHERE storage_path IS NOT NULL),
  'extracted_files',count(*) FILTER (WHERE migration_state IN ('extracted','review_required','verified')),
  'needs_review',count(*) FILTER (WHERE migration_state IN ('indexed','review_required')),
  'medical_verified',count(*) FILTER (WHERE classification='medical' AND migration_state='verified')
 ) FROM private.ctm_mega_files WHERE tenant_id=v_tenant AND source_id='Lz50mLTT');
END $function$


CREATE OR REPLACE FUNCTION public.ctm_mega_ingest_internal(p_job_token text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_mega_ingest_internal(p_job_token,p_rows)
$function$


CREATE OR REPLACE FUNCTION public.ctm_mega_summary()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_mega_summary()
$function$


CREATE OR REPLACE FUNCTION private.ctm_mega_file_detail(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;v_key text;v_file private.ctm_mega_files%rowtype;
BEGIN
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=(SELECT auth.uid()) AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_handle IS NULL OR p_handle !~ '^[A-Za-z0-9_-]{8,32}$'
 THEN RAISE EXCEPTION 'Invalid handle' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_file FROM private.ctm_mega_files
 WHERE tenant_id=v_tenant AND source_id='Lz50mLTT' AND mega_handle=p_handle;
 IF NOT FOUND THEN RAISE EXCEPTION 'File does not exist' USING ERRCODE='42501'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Archive key missing' USING ERRCODE='55000'; END IF;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,action)
 VALUES(v_tenant,(SELECT auth.uid()),'ctm_mega','DOWNLOAD_REQUESTED');
 RETURN jsonb_build_object(
  'handle',v_file.mega_handle,
  'filename',extensions.pgp_sym_decrypt(v_file.encrypted_filename,v_key),
  'bytes',v_file.bytes,'extension',v_file.extension,
  'storage_path',v_file.storage_path,'sha256',v_file.sha256
 );
END $function$


CREATE OR REPLACE FUNCTION private.ctm_mega_root_files(p_root_handle text, p_limit integer DEFAULT 40, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;v_key text;v_count bigint;v_rows jsonb;
BEGIN
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=(SELECT auth.uid()) AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_root_handle IS NULL OR p_root_handle !~ '^[A-Za-z0-9_-]{8,32}$'
 OR p_limit<1 OR p_limit>100 OR p_offset<0 OR p_offset>100000
 THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Archive key missing' USING ERRCODE='55000'; END IF;
 SELECT count(*) INTO v_count FROM private.ctm_mega_files
 WHERE tenant_id=v_tenant AND source_id='Lz50mLTT' AND root_handle=p_root_handle;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'handle',f.mega_handle,
  'name',extensions.pgp_sym_decrypt(f.encrypted_filename,v_key),
  'path',extensions.pgp_sym_decrypt(f.encrypted_path,v_key),
  'extension',f.extension,'bytes',f.bytes,
  'status',f.migration_state,'classification',f.classification,
  'stored',f.storage_path IS NOT NULL
 ) ORDER BY f.mega_handle),'[]'::jsonb) INTO v_rows FROM (
  SELECT * FROM private.ctm_mega_files
  WHERE tenant_id=v_tenant AND source_id='Lz50mLTT'
  AND root_handle=p_root_handle ORDER BY mega_handle LIMIT p_limit OFFSET p_offset
 ) f;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,action)
 VALUES(v_tenant,(SELECT auth.uid()),'ctm_mega','VIEW_FILE_CATALOG');
 RETURN jsonb_build_object('total',v_count,'files',v_rows);
END $function$


CREATE OR REPLACE FUNCTION private.ctm_mega_roots()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;v_key text;v_rows jsonb;
BEGIN
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=(SELECT auth.uid()) AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL THEN RAISE EXCEPTION 'Archive key missing' USING ERRCODE='55000'; END IF;
 WITH groups AS (
  SELECT root_handle,count(*) files,coalesce(sum(bytes),0) size_bytes,
   count(*) FILTER(WHERE storage_path IS NOT NULL) stored
  FROM private.ctm_mega_files
  WHERE tenant_id=v_tenant AND source_id='Lz50mLTT'
  GROUP BY root_handle
 ), labels AS (
  SELECT DISTINCT ON (root_handle) root_handle,encrypted_root_name
  FROM private.ctm_mega_files
  WHERE tenant_id=v_tenant AND source_id='Lz50mLTT'
  ORDER BY root_handle,mega_handle
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'handle',g.root_handle,'name',extensions.pgp_sym_decrypt(l.encrypted_root_name,v_key),
  'files',g.files,'bytes',g.size_bytes,'stored',g.stored
 ) ORDER BY g.files DESC,g.root_handle),'[]'::jsonb)
 INTO v_rows FROM groups g JOIN labels l ON l.root_handle=g.root_handle;
 RETURN v_rows;
END $function$


CREATE OR REPLACE FUNCTION public.ctm_mega_file_detail(p_handle text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_mega_file_detail(p_handle)
$function$


CREATE OR REPLACE FUNCTION public.ctm_mega_root_files(p_root_handle text, p_limit integer DEFAULT 40, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_mega_root_files(p_root_handle,p_limit,p_offset)
$function$


CREATE OR REPLACE FUNCTION public.ctm_mega_roots()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_mega_roots()
$function$


REVOKE ALL ON FUNCTION private.ctm_mega_issue_token(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.ctm_mega_ingest_internal(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ctm_mega_ingest_internal(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.ctm_mega_ingest_internal(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ctm_mega_ingest_internal(text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION private.ctm_mega_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_mega_roots() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_mega_root_files(text,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_mega_file_detail(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_mega_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_mega_roots() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_mega_root_files(text,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_mega_file_detail(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_mega_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_mega_roots() TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_mega_root_files(text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_mega_file_detail(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_mega_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_mega_roots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_mega_root_files(text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_mega_file_detail(text) TO authenticated;

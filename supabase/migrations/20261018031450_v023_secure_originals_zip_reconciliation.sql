-- CTM v0.23: evidence-only protected original copying, ZIP staging and safe pending links.
-- Contains no personal records, medical conclusions, private keys or MEGA links.
-- Compatibility for deployments bootstrapped from the committed v0.22 schema.
CREATE TABLE IF NOT EXISTS private.ctm_mega_embedded_xlsx (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 source_id text NOT NULL DEFAULT 'Lz50mLTT' CHECK(source_id='Lz50mLTT'),
 parent_mega_handle text NOT NULL,
 parent_sha256 text NOT NULL CHECK(parent_sha256 ~ '^[0-9a-f]{64}$'),
 child_sha256 text NOT NULL CHECK(child_sha256 ~ '^[0-9a-f]{64}$'),
 parsed_rows integer NOT NULL CHECK(parsed_rows BETWEEN 1 AND 250),
 encrypted_rows bytea NOT NULL,
 extracted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_id,parent_mega_handle,child_sha256),
 FOREIGN KEY(tenant_id,source_id,parent_mega_handle)
 REFERENCES private.ctm_mega_files(tenant_id,source_id,mega_handle)
);
ALTER TABLE private.ctm_mega_embedded_xlsx ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_mega_embedded_xlsx FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS private.ctm_original_copy_log (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 source_id text NOT NULL DEFAULT 'Lz50mLTT' CHECK(source_id='Lz50mLTT'),
 mega_handle text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 bytes bigint NOT NULL CHECK(bytes BETWEEN 1 AND 52428800),
 storage_path text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 verified_by uuid NOT NULL,
 verification_method text NOT NULL DEFAULT 'sha256_upload_download_roundtrip'
 CHECK(verification_method='sha256_upload_download_roundtrip'),
 PRIMARY KEY(tenant_id,source_id,mega_handle),
 UNIQUE(tenant_id,storage_path),
 FOREIGN KEY(tenant_id,source_id,mega_handle)
 REFERENCES private.ctm_mega_files(tenant_id,source_id,mega_handle)
);
ALTER TABLE private.ctm_original_copy_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_original_copy_log FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.ctm_admin_confirm_original(
 p_handle text,p_sha text,p_bytes bigint,p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $ctm$
DECLARE actor uuid:=(SELECT auth.uid());tenant uuid;item private.ctm_mega_files%rowtype;size_meta bigint;
BEGIN
 SELECT m.tenant_id INTO tenant FROM public.tenant_members m
 WHERE m.user_id=actor AND m.active AND m.role='admin' ORDER BY m.created_at LIMIT 1;
 IF tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 IF p_handle !~ '^[A-Za-z0-9_-]{8,32}$' OR p_sha !~ '^[0-9a-f]{64}$'
 OR p_bytes NOT BETWEEN 1 AND 52428800 OR
 p_path IS DISTINCT FROM tenant::text||'/mega/'||p_handle||'-'||p_sha||'.bin'
 THEN RAISE EXCEPTION 'Invalid archive source metadata' USING ERRCODE='22023';END IF;
 SELECT * INTO item FROM private.ctm_mega_files f
 WHERE f.tenant_id=tenant AND f.source_id='Lz50mLTT' AND f.mega_handle=p_handle FOR UPDATE;
 IF NOT FOUND OR item.bytes<>p_bytes
 THEN RAISE EXCEPTION 'Original source differs from indexed copy' USING ERRCODE='22023';END IF;
 IF item.sha256 IS NOT NULL AND item.sha256<>p_sha THEN
  RAISE EXCEPTION 'Archive original checksum conflict' USING ERRCODE='23505';END IF;
 IF EXISTS(SELECT 1 FROM private.ctm_mega_extractions e
  WHERE e.tenant_id=tenant AND e.mega_handle=p_handle AND e.source_id='Lz50mLTT'
  AND e.extract_state IN('parsed','truncated','empty') AND e.content_sha256<>p_sha)
 THEN RAISE EXCEPTION 'Archive source fingerprint mismatch' USING ERRCODE='23505';END IF;
 SELECT nullif(o.metadata->>'size','')::bigint INTO size_meta FROM storage.objects o
 WHERE o.bucket_id='ctm-private-originals' AND o.name=p_path;
 IF size_meta IS DISTINCT FROM p_bytes THEN
  RAISE EXCEPTION 'Private storage object not found or size mismatch' USING ERRCODE='22023';END IF;
 UPDATE private.ctm_mega_files SET storage_path=p_path,sha256=p_sha,migration_state='stored'
 WHERE tenant_id=tenant AND source_id='Lz50mLTT' AND mega_handle=p_handle
 AND (storage_path IS NULL OR storage_path=p_path);
 IF NOT FOUND THEN RAISE EXCEPTION 'Original copy conflicts with existing path' USING ERRCODE='23505';END IF;
 INSERT INTO private.ctm_original_copy_log
  (tenant_id,source_id,mega_handle,sha256,bytes,storage_path,verified_by)
 VALUES(tenant,'Lz50mLTT',p_handle,p_sha,p_bytes,p_path,actor)
 ON CONFLICT (tenant_id,source_id,mega_handle) DO NOTHING;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,action)
 VALUES(tenant,actor,'ctm_mega','ORIGINAL_SHA256_VERIFIED_STORED');
 RETURN pg_catalog.jsonb_build_object('stored',true,'bytes',p_bytes,'sha256',p_sha);
END $ctm$;
CREATE OR REPLACE FUNCTION public.ctm_admin_confirm_original(
 p_handle text,p_sha text,p_bytes bigint,p_path text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $ctm$
 SELECT private.ctm_admin_confirm_original(p_handle,p_sha,p_bytes,p_path)
$ctm$;
REVOKE ALL ON FUNCTION private.ctm_admin_confirm_original(text,text,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_admin_confirm_original(text,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_admin_confirm_original(text,text,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_admin_confirm_original(text,text,bigint,text) TO authenticated;

-- Existing encrypted ZIP evidence table is retained; only a logged-in admin can add rows.
CREATE OR REPLACE FUNCTION private.ctm_admin_add_zip_sheet(
 p_handle text,p_parent_sha text,p_child_sha text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $ctm$
DECLARE actor uuid:=(SELECT auth.uid());tenant uuid;source private.ctm_mega_files%rowtype;
 secret text;newrows integer;sheet_rows integer;
BEGIN
 SELECT m.tenant_id INTO tenant FROM public.tenant_members m
 WHERE m.user_id=actor AND m.active AND m.role='admin' ORDER BY m.created_at LIMIT 1;
 IF tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 IF p_handle !~ '^[A-Za-z0-9_-]{8,32}$'
 OR p_parent_sha !~ '^[0-9a-f]{64}$' OR p_child_sha !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(p_rows)<>'array'
 THEN RAISE EXCEPTION 'Invalid spreadsheet evidence' USING ERRCODE='22023';END IF;
 sheet_rows:=jsonb_array_length(p_rows);
 IF sheet_rows NOT BETWEEN 1 AND 250 OR length(p_rows::text)>200000
 THEN RAISE EXCEPTION 'Spreadsheet limits exceeded' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r(value)
 WHERE jsonb_typeof(r.value)<>'array' OR jsonb_array_length(r.value)>50)
 THEN RAISE EXCEPTION 'Invalid spreadsheet row shape' USING ERRCODE='22023';END IF;
 SELECT * INTO source FROM private.ctm_mega_files f
 WHERE f.tenant_id=tenant AND f.source_id='Lz50mLTT'
 AND f.mega_handle=p_handle AND f.extension='zip'
 AND f.root_handle='2z5x3JCL' AND f.bytes BETWEEN 1000 AND 20000000
 AND f.sha256=p_parent_sha AND f.storage_path IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original ZIP must be SHA256-verified in private Storage first'
 USING ERRCODE='42501';END IF;
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF secret IS NULL OR length(secret)<32 THEN RAISE EXCEPTION 'Archive encryption unavailable';END IF;
 INSERT INTO private.ctm_mega_embedded_xlsx(tenant_id,source_id,parent_mega_handle,
 parent_sha256,child_sha256,parsed_rows,encrypted_rows)
 VALUES(tenant,'Lz50mLTT',p_handle,p_parent_sha,p_child_sha,sheet_rows,
 extensions.pgp_sym_encrypt(p_rows::text,secret,'cipher-algo=aes256'))
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS newrows=ROW_COUNT;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,action)
 VALUES(tenant,actor,'ctm_mega','EMBEDDED_ZIP_XLSX_ENCRYPTED');
 RETURN pg_catalog.jsonb_build_object('stored',newrows=1,'rows',sheet_rows);
END $ctm$;
CREATE OR REPLACE FUNCTION public.ctm_admin_add_zip_sheet(
 p_handle text,p_parent_sha text,p_child_sha text,p_rows jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $ctm$
 SELECT private.ctm_admin_add_zip_sheet(p_handle,p_parent_sha,p_child_sha,p_rows)
$ctm$;
REVOKE ALL ON FUNCTION private.ctm_admin_add_zip_sheet(text,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_admin_add_zip_sheet(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_admin_add_zip_sheet(text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_admin_add_zip_sheet(text,text,text,jsonb) TO authenticated;

-- Source provenance for each verified employee (no diagnoses, no plain EGN).
ALTER TABLE private.ctm_employee_document_evidence
 ADD COLUMN IF NOT EXISTS embedded_child_sha256 text;
ALTER TABLE private.ctm_employee_document_evidence
 DROP CONSTRAINT IF EXISTS ctm_employee_document_evidence_method_check;
ALTER TABLE private.ctm_employee_document_evidence
 ADD CONSTRAINT ctm_employee_document_evidence_method_check
 CHECK(method IN('full_document_egn_and_full_name','embedded_zip_xlsx_row_full_name_egn'));
ALTER TABLE private.ctm_employee_document_evidence
 DROP CONSTRAINT IF EXISTS ctm_employee_evidence_embedded_child_check;
ALTER TABLE private.ctm_employee_document_evidence
 ADD CONSTRAINT ctm_employee_evidence_embedded_child_check
 CHECK (
 (method='full_document_egn_and_full_name' AND embedded_child_sha256 IS NULL)
 OR (method='embedded_zip_xlsx_row_full_name_egn' AND
 embedded_child_sha256 ~ '^[0-9a-f]{64}$')
 );

-- This function exposes only UUID document references internally, never EGN or medical text.
CREATE OR REPLACE FUNCTION private.ctm_zip_exact_matches(p_tenant uuid)
RETURNS TABLE(archive_id uuid,tenant_id uuid,mega_handle text,parent_sha text,
 child_sha text,document_row_no integer)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $ctm$
 WITH secret AS (SELECT decrypted_secret k FROM vault.decrypted_secrets
 WHERE name='ctm_archive_key_v1'),
 archival AS (
 SELECT a.id,a.tenant_id,
 coalesce(
 (SELECT (extensions.pgp_sym_decrypt(ch.encrypted_data,s.k))::jsonb
 FROM private.ctm_archive_employee_changes ch WHERE ch.tenant_id=a.tenant_id
 AND ch.archive_id=a.id ORDER BY ch.revision DESC LIMIT 1),
 (extensions.pgp_sym_decrypt(a.encrypted_json,s.k))::jsonb) data
 FROM private.ctm_archive_rows a CROSS JOIN secret s
 WHERE a.tenant_id=p_tenant AND a.record_kind='employee_sample'
 AND NOT EXISTS(SELECT 1 FROM private.ctm_archive_employee_links l
 WHERE l.tenant_id=a.tenant_id AND l.archive_id=a.id)
 ),
 cells AS (
 SELECT z.tenant_id,z.parent_mega_handle,z.parent_sha256,z.child_sha256,
 rowno.ordinality::integer row_no,
 (SELECT pg_catalog.string_agg(value,' ' ORDER BY n)
  FROM jsonb_array_elements_text(rowno.value) WITH ORDINALITY cell(value,n)) text_value
 FROM private.ctm_mega_embedded_xlsx z CROSS JOIN secret k
 CROSS JOIN LATERAL jsonb_array_elements(
 (extensions.pgp_sym_decrypt(z.encrypted_rows,k.k))::jsonb)
 WITH ORDINALITY rowno(value,ordinality)
 WHERE z.tenant_id=p_tenant AND z.source_id='Lz50mLTT'
 AND EXISTS(SELECT 1 FROM private.ctm_mega_files f
 WHERE f.tenant_id=z.tenant_id AND f.mega_handle=z.parent_mega_handle
 AND f.storage_path IS NOT NULL AND f.sha256=z.parent_sha256 AND f.root_handle='2z5x3JCL')
 )
 SELECT DISTINCT a.id,a.tenant_id,c.parent_mega_handle,c.parent_sha256,
 c.child_sha256,c.row_no
 FROM archival a JOIN cells c ON c.tenant_id=a.tenant_id
 WHERE private.ctm_valid_egn(pg_catalog.btrim(coalesce(a.data->>'ЕГН','')))
 AND pg_catalog.upper(pg_catalog.btrim(coalesce(a.data->>'Фирма','')))='ПЛ ПРОДЖЕКТ ООД'
 AND pg_catalog.length(pg_catalog.btrim(coalesce(a.data->>'Име Презиме Фамилия',''))) BETWEEN 5 AND 200
 AND c.text_value ~ ('(^|[^0-9])'||pg_catalog.btrim(a.data->>'ЕГН')||'([^0-9]|$)')
 AND pg_catalog.strpos(
 pg_catalog.regexp_replace(pg_catalog.upper(coalesce(c.text_value,'')),'[^А-ЯA-Z]','','g'),
 pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.btrim(a.data->>'Име Презиме Фамилия')),'[^А-ЯA-Z]','','g')
 )>0
$ctm$;
REVOKE ALL ON FUNCTION private.ctm_zip_exact_matches(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ctm_archive_completion_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $ctm$
DECLARE actor uuid:=(SELECT auth.uid());tenant uuid;res jsonb;
BEGIN
 SELECT tenant_id INTO tenant FROM public.tenant_members
 WHERE user_id=actor AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 RETURN (SELECT pg_catalog.jsonb_build_object(
 'source_files',(SELECT count(*) FROM private.ctm_mega_files WHERE tenant_id=tenant),
 'source_bytes',(SELECT coalesce(sum(bytes),0) FROM private.ctm_mega_files WHERE tenant_id=tenant),
 'stored_files',(SELECT count(*) FROM private.ctm_original_copy_log WHERE tenant_id=tenant),
 'stored_bytes',(SELECT coalesce(sum(bytes),0) FROM private.ctm_original_copy_log WHERE tenant_id=tenant),
 'source_xlsx_in_zip',(SELECT count(*) FROM private.ctm_mega_embedded_xlsx WHERE tenant_id=tenant),
 'archived_employees',(SELECT count(*) FROM private.ctm_archive_rows WHERE tenant_id=tenant AND record_kind='employee_sample'),
 'linked_pending',(SELECT count(*) FROM private.ctm_archive_employee_links l
 JOIN public.employees e ON e.id=l.employee_id WHERE l.tenant_id=tenant AND e.current_status='pending'),
 'unresolved',(SELECT count(*) FROM private.ctm_migration_review_queue
 WHERE tenant_id=tenant AND item_kind='archived_employee' AND review_state='requires_evidence'),
 'potential_zip_matches',(SELECT count(DISTINCT archive_id)
 FROM private.ctm_zip_exact_matches(tenant)),
 'clinical_promoted',(SELECT count(*) FROM private.ctm_employee_clinical c JOIN private.ctm_archive_employee_links l ON l.employee_id=c.employee_id WHERE l.tenant_id=tenant)
 ));
END $ctm$;
CREATE OR REPLACE FUNCTION public.ctm_archive_completion_summary()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $ctm$
 SELECT private.ctm_archive_completion_summary()
$ctm$;
REVOKE ALL ON FUNCTION private.ctm_archive_completion_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_archive_completion_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_archive_completion_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_archive_completion_summary() TO authenticated;



CREATE OR REPLACE FUNCTION private.ctm_employee_archive_sources(p_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $ctm$
DECLARE actor uuid:=(SELECT auth.uid());tenant uuid;result jsonb;
BEGIN
 SELECT tenant_id INTO tenant FROM public.tenant_members
 WHERE user_id=actor AND active AND role='admin' ORDER BY created_at LIMIT 1;
 IF tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees e
 WHERE e.id=p_employee_id AND e.tenant_id=tenant)
 THEN RAISE EXCEPTION 'Employee not found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'mega_handle',e.mega_handle,'source_type',e.method,'checked_at',e.checked_at,
 'document_sha256',e.document_sha256,
 'storage_verified',f.storage_path IS NOT NULL,
 'medical_import_state',e.medical_import_state,
 'document_row_no',e.document_row_no
 ) ORDER BY e.checked_at),'[]'::jsonb) INTO result
 FROM private.ctm_employee_document_evidence e
 JOIN private.ctm_mega_files f ON f.tenant_id=e.tenant_id
 AND f.source_id=e.source_id AND f.mega_handle=e.mega_handle
 WHERE e.tenant_id=tenant AND e.employee_id=p_employee_id;
 INSERT INTO public.audit_events(tenant_id,actor_id,entity,record_id,action)
 VALUES(tenant,actor,'ctm_archive',p_employee_id,'VIEW_EMPLOYEE_ARCHIVE_SOURCES');
 RETURN result;
END $ctm$;
CREATE OR REPLACE FUNCTION public.ctm_employee_archive_sources(p_employee_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $ctm$
 SELECT private.ctm_employee_archive_sources(p_employee_id)
$ctm$;
REVOKE ALL ON FUNCTION private.ctm_employee_archive_sources(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_employee_archive_sources(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_employee_archive_sources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_employee_archive_sources(uuid) TO authenticated;


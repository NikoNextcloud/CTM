-- CTM v0.21 reproducible security schema. Contains no client medical data, source names, or credentials.
CREATE TABLE IF NOT EXISTS private.ctm_company_public_checks (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 candidate_id uuid NOT NULL REFERENCES public.ctm_company_candidates(id),
 proposed_eik text,
 checked_at timestamptz NOT NULL DEFAULT now(),
 source_1_url text,source_1_http integer,
 source_1_name_match boolean NOT NULL DEFAULT false,
 source_1_eik_found boolean NOT NULL DEFAULT false,
 source_2_url text,source_2_http integer,
 source_2_name_match boolean NOT NULL DEFAULT false,
 source_2_eik_found boolean NOT NULL DEFAULT false,
 result_code text NOT NULL CHECK(result_code IN
 ('two_secondary_exact','one_secondary_exact','eik_found_name_mismatch','not_accessible','no_eik')),
 govt_eik_source text,govt_eik_match boolean NOT NULL DEFAULT false,
 comments text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,candidate_id)
);
CREATE TABLE IF NOT EXISTS private.ctm_mega_full_text (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 source_id text NOT NULL,mega_handle text NOT NULL,
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
 text_length integer NOT NULL CHECK(text_length BETWEEN 1 AND 200000),
 encrypted_text bytea NOT NULL,
 extracted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_id,mega_handle),
 FOREIGN KEY(tenant_id,source_id,mega_handle)
 REFERENCES private.ctm_mega_files(tenant_id,source_id,mega_handle)
);
CREATE TABLE IF NOT EXISTS private.ctm_migration_system_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 operation text NOT NULL,method text NOT NULL,evidence_url text,
 started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 completed_count integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'running' CHECK(state IN('running','success','failed')),
 notes text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS private.ctm_employee_document_evidence (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 archive_id uuid NOT NULL REFERENCES private.ctm_archive_rows(id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 employee_id uuid NOT NULL REFERENCES public.employees(id),
 source_id text NOT NULL DEFAULT 'Lz50mLTT' CHECK(source_id='Lz50mLTT'),
 mega_handle text NOT NULL,
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
 method text NOT NULL CHECK(method='full_document_egn_and_full_name'),
 imported_by_job uuid NOT NULL REFERENCES private.ctm_migration_system_jobs(id),
 medical_import_state text NOT NULL DEFAULT 'archive_only'
 CHECK(medical_import_state='archive_only'),
 checked_at timestamptz NOT NULL DEFAULT now(),
 document_row_no integer CHECK(document_row_no BETWEEN 1 AND 1000000),
 PRIMARY KEY(tenant_id,archive_id),UNIQUE(tenant_id,employee_id),
 FOREIGN KEY(tenant_id,source_id,mega_handle)
 REFERENCES private.ctm_mega_files(tenant_id,source_id,mega_handle)
);
ALTER TABLE private.ctm_company_public_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ctm_mega_full_text ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ctm_migration_system_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ctm_employee_document_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_company_public_checks,private.ctm_mega_full_text,
 private.ctm_migration_system_jobs,private.ctm_employee_document_evidence FROM PUBLIC,anon,authenticated;

-- Employers see only active employees; pending evidence-linked workers stay protected.
DROP POLICY IF EXISTS employees_view ON public.employees;
CREATE POLICY employees_view ON public.employees FOR SELECT TO authenticated
USING (
 private.has_role(tenant_id,ARRAY['admin'::text,'specialist'::text,'doctor'::text])
 OR (current_status='active' AND private.can_company(tenant_id,company_id))
);

CREATE OR REPLACE FUNCTION private.ctm_company_public_checks_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role='admin'
 ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';END IF;
 RETURN (
 SELECT jsonb_build_object(
  'total',count(*),
  'two_secondary_exact',count(*) FILTER(WHERE result_code='two_secondary_exact'),
  'one_secondary_exact',count(*) FILTER(WHERE result_code='one_secondary_exact'),
  'name_mismatch',count(*) FILTER(WHERE result_code='eik_found_name_mismatch'),
  'no_eik',count(*) FILTER(WHERE result_code='no_eik'),
  'source_unavailable',count(*) FILTER(WHERE result_code='not_accessible'),
  'government_eik_corroborated',count(*) FILTER(WHERE govt_eik_match))
 FROM private.ctm_company_public_checks WHERE tenant_id=v_tenant);
END $function$
;

CREATE OR REPLACE FUNCTION public.ctm_company_public_checks_summary()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_company_public_checks_summary()
$function$
;

CREATE OR REPLACE FUNCTION private.ctm_company_public_checks_list(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;v_items jsonb;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role='admin'
 ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';END IF;
 IF p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 5000
 THEN RAISE EXCEPTION 'Invalid paging' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'name',c.name,
  'candidate_id',w.candidate_id,
  'proposed_eik',w.proposed_eik,
  'result_code',w.result_code,
  'source_1_url',w.source_1_url,
  'source_2_url',w.source_2_url,
  'source_1_name_match',w.source_1_name_match,
  'source_2_name_match',w.source_2_name_match,
  'govt_eik_match',w.govt_eik_match,
  'govt_eik_source',w.govt_eik_source,
  'review_status',c.review_status,
  'checked_at',w.checked_at,
  'duplicate_eik_candidates',(SELECT count(*) FROM public.ctm_company_research r
    WHERE r.tenant_id=v_tenant AND r.proposed_eik=w.proposed_eik AND r.proposed_eik IS NOT NULL)
 ) ORDER BY c.name,w.candidate_id),'[]'::jsonb)
 INTO v_items FROM (
 SELECT * FROM private.ctm_company_public_checks
 WHERE tenant_id=v_tenant ORDER BY candidate_id LIMIT p_limit OFFSET p_offset
 ) w JOIN public.ctm_company_candidates c ON c.id=w.candidate_id AND c.tenant_id=v_tenant;
 RETURN v_items;
END $function$
;

CREATE OR REPLACE FUNCTION public.ctm_company_public_checks_list(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_company_public_checks_list(p_limit,p_offset)
$function$
;

CREATE OR REPLACE FUNCTION private.ctm_migration_employee_match_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;v_result jsonb;
BEGIN
 SELECT tenant_id INTO v_tenant FROM public.tenant_members
 WHERE user_id=(SELECT auth.uid()) AND active AND role='admin'
 ORDER BY created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'archive_id',s.archive_id,
 'candidate_id',s.candidate_id,
 'match_status',CASE
 WHEN l.archive_id IS NOT NULL THEN 'linked_pending'
 WHEN q.issue_code='missing_egn_document_verification' THEN 'missing_egn'
 WHEN q.issue_code='invalid_egn_document_verification' THEN 'invalid_egn'
 WHEN q.issue_code='not_in_secondary_employee_document' THEN 'secondary_document_missing'
 ELSE s.match_status END,
 'candidate_count',s.candidate_count,
 'linked_employee_id',l.employee_id,
 'linked_company_id',l.company_id
 ) ORDER BY s.archive_id),'[]'::jsonb)
 INTO v_result FROM private.ctm_employer_match_suggestions s
 LEFT JOIN private.ctm_archive_employee_links l ON l.archive_id=s.archive_id AND l.tenant_id=s.tenant_id
 LEFT JOIN private.ctm_migration_review_queue q ON q.archive_id=s.archive_id
 AND q.tenant_id=s.tenant_id AND q.item_kind='archived_employee'
 WHERE s.tenant_id=v_tenant;
 RETURN v_result;
END $function$
;

CREATE OR REPLACE FUNCTION private.ctm_migration_evidence_summary()
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
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 RETURN (SELECT jsonb_build_object(
 'archive_employee_rows',(SELECT count(*) FROM private.ctm_archive_rows a WHERE a.tenant_id=v_tenant AND a.record_kind='employee_sample'),
 'matches_staged',(SELECT count(*) FROM private.ctm_employer_match_suggestions s WHERE s.tenant_id=v_tenant),
 'ambiguous',(SELECT count(*) FROM private.ctm_migration_review_queue q WHERE q.tenant_id=v_tenant AND q.item_kind='archived_employee' AND q.issue_code='employer_and_identity_unverified'),
 'needs_company_review',(SELECT count(*) FROM private.ctm_migration_review_queue q WHERE q.tenant_id=v_tenant AND q.item_kind='company_candidate' AND q.review_state='requires_evidence'),
 'needs_person_review',(SELECT count(*) FROM private.ctm_migration_review_queue q WHERE q.tenant_id=v_tenant AND q.item_kind='archived_employee' AND q.review_state='requires_evidence'),
 'invalid_egn',(SELECT count(*) FROM private.ctm_migration_review_queue q WHERE q.tenant_id=v_tenant AND q.issue_code='invalid_egn_document_verification'),
 'missing_egn',(SELECT count(*) FROM private.ctm_migration_review_queue q WHERE q.tenant_id=v_tenant AND q.issue_code='missing_egn_document_verification'),
 'needs_secondary_document',(SELECT count(*) FROM private.ctm_migration_review_queue q WHERE q.tenant_id=v_tenant AND q.issue_code='not_in_secondary_employee_document'),
 'firm_document_folder_suggestions',(SELECT count(*) FROM private.ctm_firm_document_suggestions s WHERE s.tenant_id=v_tenant),
 'linked_to_main',(SELECT count(*) FROM private.ctm_archive_employee_links l WHERE l.tenant_id=v_tenant),
 'linked_pending_verified_evidence',(SELECT count(*) FROM private.ctm_employee_document_evidence e JOIN public.employees p ON p.tenant_id=e.tenant_id AND p.id=e.employee_id
 WHERE e.tenant_id=v_tenant AND p.current_status='pending')
 ));
END $function$
;

CREATE OR REPLACE FUNCTION private.ctm_mega_ingest_full_xlsx(p_token text, p_handle text, p_sha text, p_bytes bigint, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE job private.ctm_mega_import_jobs%rowtype;v_source private.ctm_mega_extractions%rowtype;
 v_key text;v_added integer;
BEGIN
 IF p_token !~ '^[a-f0-9]{64}$' OR p_handle !~ '^[A-Za-z0-9_-]{8,32}$'
 OR p_sha !~ '^[0-9a-f]{64}$' OR length(p_text) NOT BETWEEN 1 AND 200000
 OR p_bytes NOT BETWEEN 1 AND 20000000
 THEN RAISE EXCEPTION 'Invalid restricted xlsx request' USING ERRCODE='22023'; END IF;
 SELECT * INTO job FROM private.ctm_mega_import_jobs
 WHERE token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
  AND NOT revoked AND expires_at>now() AND source_id='Lz50mLTT'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import token expired or forbidden' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO v_source FROM private.ctm_mega_extractions x
 JOIN private.ctm_mega_files f ON f.tenant_id=x.tenant_id AND f.source_id=x.source_id AND f.mega_handle=x.mega_handle
 WHERE x.tenant_id=job.tenant_id AND x.source_id='Lz50mLTT'
 AND x.mega_handle=p_handle AND f.extension='xlsx'
 AND f.bytes=p_bytes AND x.content_sha256=p_sha
 AND x.extract_state='truncated';
 IF NOT FOUND THEN RAISE EXCEPTION 'Document identity or source fingerprint mismatch' USING ERRCODE='22023'; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='ctm_archive_key_v1';
 IF v_key IS NULL OR length(v_key)<32 THEN RAISE EXCEPTION 'Encryption key missing' USING ERRCODE='55000';END IF;
 INSERT INTO private.ctm_mega_full_text(tenant_id,source_id,mega_handle,content_sha256,text_length,encrypted_text)
 VALUES(job.tenant_id,'Lz50mLTT',p_handle,p_sha,length(p_text),
 extensions.pgp_sym_encrypt(p_text,v_key,'cipher-algo=aes256'))
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 RETURN jsonb_build_object('stored',v_added,'bytes',p_bytes,'characters',length(p_text));
END $function$
;

CREATE OR REPLACE FUNCTION public.ctm_mega_ingest_full_xlsx(p_token text, p_handle text, p_sha text, p_bytes bigint, p_text text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_mega_ingest_full_xlsx(p_token,p_handle,p_sha,p_bytes,p_text)
$function$
;

REVOKE ALL ON FUNCTION private.ctm_company_public_checks_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_company_public_checks_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_company_public_checks_list(integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_company_public_checks_list(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_company_public_checks_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_company_public_checks_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_company_public_checks_list(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_company_public_checks_list(integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION private.ctm_mega_ingest_full_xlsx(text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ctm_mega_ingest_full_xlsx(text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_mega_ingest_full_xlsx(text,text,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ctm_mega_ingest_full_xlsx(text,text,text,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION private.ctm_migration_employee_match_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_migration_evidence_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_migration_employee_match_list() TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_migration_evidence_summary() TO authenticated;


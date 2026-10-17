-- CTM v0.22: evidence-backed EIK discovery, not legal approval.
-- No employee or medical data and no MEGA decryption URL are stored in this migration.
CREATE TABLE IF NOT EXISTS private.ctm_candidate_doc_eik_evidence (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 candidate_id uuid NOT NULL REFERENCES public.ctm_company_candidates(id),
 eik text NOT NULL CHECK(eik ~ '^[0-9]{9}$'),
 root_handle text NOT NULL CHECK(root_handle ~ '^[A-Za-z0-9_-]{8,32}$'),
 supporting_documents integer NOT NULL CHECK(supporting_documents BETWEEN 1 AND 9999),
 documents_with_candidate_name integer NOT NULL CHECK(documents_with_candidate_name BETWEEN 0 AND 9999),
 provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
 secondary_registry_names jsonb NOT NULL DEFAULT '{}'::jsonb,
 secondary_match_count integer NOT NULL DEFAULT 0 CHECK(secondary_match_count BETWEEN 0 AND 2),
 review_state text NOT NULL DEFAULT 'requires_registry_review'
  CHECK(review_state IN('requires_registry_review','conflicting_identity','requires_original_check','approved_by_reviewer')),
 examined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,candidate_id,eik)
);
ALTER TABLE private.ctm_candidate_doc_eik_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_candidate_doc_eik_evidence FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.ctm_candidate_doc_eik_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.role='admin' AND m.active
 ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 RETURN (SELECT jsonb_build_object(
  'proposals',count(*),
  'candidates',count(DISTINCT candidate_id),
  'secondary_two',count(*) FILTER(WHERE secondary_match_count=2),
  'secondary_one',count(*) FILTER(WHERE secondary_match_count=1),
  'same_document_name',count(*) FILTER(WHERE documents_with_candidate_name>0),
  'needs_review',count(*) FILTER(WHERE review_state<>'approved_by_reviewer')
 ) FROM private.ctm_candidate_doc_eik_evidence WHERE tenant_id=v_tenant);
END $function$
;

CREATE OR REPLACE FUNCTION private.ctm_candidate_doc_eik_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;v_rows jsonb;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.role='admin' AND m.active
 ORDER BY m.created_at LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'candidate_id',d.candidate_id,'name',c.name,'eik',d.eik,
 'source_root',d.root_handle,'supporting_documents',d.supporting_documents,
 'name_matches',d.documents_with_candidate_name,
 'secondary_match_count',d.secondary_match_count,
 'secondary_registry_names',d.secondary_registry_names,
 'review_state',d.review_state,
 'already_proposed_elsewhere',(SELECT count(*) FROM public.ctm_company_research r
 WHERE r.tenant_id=v_tenant AND r.candidate_id<>d.candidate_id AND r.proposed_eik=d.eik),
 'checked_at',d.examined_at
 ) ORDER BY c.name,d.eik),'[]'::jsonb) INTO v_rows
 FROM private.ctm_candidate_doc_eik_evidence d
 JOIN public.ctm_company_candidates c ON c.id=d.candidate_id AND c.tenant_id=v_tenant
 WHERE d.tenant_id=v_tenant;
 RETURN v_rows;
END $function$
;

CREATE OR REPLACE FUNCTION public.ctm_candidate_doc_eik_summary()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_candidate_doc_eik_summary()
$function$
;

CREATE OR REPLACE FUNCTION public.ctm_candidate_doc_eik_list()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT private.ctm_candidate_doc_eik_list()
$function$
;

REVOKE ALL ON FUNCTION private.ctm_candidate_doc_eik_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.ctm_candidate_doc_eik_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_candidate_doc_eik_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_candidate_doc_eik_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_candidate_doc_eik_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION private.ctm_candidate_doc_eik_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_candidate_doc_eik_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_candidate_doc_eik_list() TO authenticated;


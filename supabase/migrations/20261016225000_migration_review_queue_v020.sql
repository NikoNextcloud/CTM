-- CTM v0.20 migration review: no personal names or document content is stored in this migration.
CREATE TABLE IF NOT EXISTS private.ctm_migration_review_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 item_kind text NOT NULL CHECK(item_kind IN('company_candidate','archived_employee')),
 candidate_id uuid REFERENCES public.ctm_company_candidates(id),
 archive_id uuid,
 review_state text NOT NULL DEFAULT 'requires_evidence'
 CHECK(review_state IN('requires_evidence','evidence_checked','conflict','approved')),
 issue_code text NOT NULL,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ctm_review_one_source CHECK(
 (item_kind='company_candidate' AND candidate_id IS NOT NULL AND archive_id IS NULL)
 OR (item_kind='archived_employee' AND archive_id IS NOT NULL AND candidate_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ctm_review_company_unique
 ON private.ctm_migration_review_queue(tenant_id,candidate_id) WHERE candidate_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ctm_review_employee_unique
 ON private.ctm_migration_review_queue(tenant_id,archive_id) WHERE archive_id IS NOT NULL;
ALTER TABLE private.ctm_migration_review_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ctm_migration_review_queue FROM PUBLIC,anon,authenticated;
INSERT INTO private.ctm_migration_review_queue(tenant_id,item_kind,candidate_id,issue_code)
SELECT c.tenant_id,'company_candidate',c.id,
 CASE WHEN r.research_state='ambiguous' THEN 'ambiguous_legal_identity'
 WHEN r.research_state='unresolved' OR r.candidate_id IS NULL THEN 'missing_eik_evidence'
 ELSE 'unverified_eik_or_employer' END
FROM public.ctm_company_candidates c
LEFT JOIN public.ctm_company_research r ON r.candidate_id=c.id
WHERE c.review_status='pending'
ON CONFLICT DO NOTHING;
INSERT INTO private.ctm_migration_review_queue(tenant_id,item_kind,archive_id,issue_code)
SELECT a.tenant_id,'archived_employee',a.id,'employer_and_identity_unverified'
FROM private.ctm_archive_rows a
WHERE a.record_kind='employee_sample'
 AND NOT EXISTS(SELECT 1 FROM private.ctm_archive_employee_links l WHERE l.archive_id=a.id)
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION private.ctm_migration_review_queue_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE v_tenant uuid;v_total integer;v_groups jsonb;
BEGIN
 SELECT m.tenant_id INTO v_tenant FROM public.tenant_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role='admin'
 ORDER BY m.created_at,m.tenant_id LIMIT 1;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_total FROM private.ctm_migration_review_queue WHERE tenant_id=v_tenant;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',item_kind,'reason',issue_code,
 'state',review_state,'count',n) ORDER BY item_kind,issue_code),'[]'::jsonb)
 INTO v_groups FROM (
 SELECT item_kind,issue_code,review_state,count(*) n FROM private.ctm_migration_review_queue
 WHERE tenant_id=v_tenant GROUP BY item_kind,issue_code,review_state
 ) v;
 RETURN jsonb_build_object('total',v_total,'groups',v_groups);
END $body$;
CREATE OR REPLACE FUNCTION public.ctm_migration_review_queue_summary()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $body$
 SELECT private.ctm_migration_review_queue_summary()
$body$;
REVOKE ALL ON FUNCTION private.ctm_migration_review_queue_summary() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ctm_migration_review_queue_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ctm_migration_review_queue_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_migration_review_queue_summary() TO authenticated;

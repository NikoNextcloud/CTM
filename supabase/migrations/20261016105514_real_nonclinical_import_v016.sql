-- CTM v0.16: real administrative CSV/XLSX import, never a direct clinical import.
-- Companies enter candidate review. Other resources require a verified EIK and
-- are written transactionally with duplicate, tenant and role safeguards.
CREATE OR REPLACE FUNCTION public.ctm_import_nonclinical(
 p_tenant uuid,p_resource text,p_rows jsonb,p_sha256 text
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_actor uuid:=(SELECT auth.uid());
 v_role text;v_allowed text[];v_count int;v_row jsonb;
 v_company uuid;v_name text;v_eik text;v_i int:=0;v_company_status text;
BEGIN
 SELECT m.role INTO v_role FROM public.tenant_members m
 WHERE m.tenant_id=p_tenant AND m.user_id=v_actor AND m.active
 AND m.role IN('admin','specialist') LIMIT 1;
 IF v_actor IS NULL OR v_role IS NULL THEN
  RAISE EXCEPTION 'Administrative import forbidden' USING errcode='42501';
 END IF;
 IF p_resource='companies' THEN
  IF v_role<>'admin' THEN
   RAISE EXCEPTION 'Only admins stage company identities' USING errcode='42501';
  END IF;
  v_allowed:=ARRAY['name','eik','address','status'];
 ELSIF p_resource='employees' THEN
  v_allowed:=ARRAY['company_eik','full_name','job_title','reference_code'];
 ELSIF p_resource='worksites' THEN
  v_allowed:=ARRAY['company_eik','name','address','active'];
 ELSIF p_resource='job_positions' THEN
  v_allowed:=ARRAY['company_eik','title','department','active'];
 ELSIF p_resource='risk_assessments' THEN
  v_allowed:=ARRAY['company_eik','workplace','hazard','risk_level','protective_measures','assessment_date','review_due'];
 ELSE
  RAISE EXCEPTION 'Unsupported import resource' USING errcode='22023';
 END IF;
 IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR
  p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows)<>'array' THEN
  RAISE EXCEPTION 'Invalid source hash or rows' USING errcode='22023';
 END IF;
 v_count:=pg_catalog.jsonb_array_length(p_rows);
 IF v_count NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'The archive import must have 1 to 100 rows' USING errcode='22023';
 END IF;
 INSERT INTO public.ctm_import_batches(tenant_id,resource,payload_hash,row_count,created_by)
 VALUES(p_tenant,p_resource,p_sha256,v_count,v_actor);
 FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
  IF pg_catalog.jsonb_typeof(v_row)<>'object' OR
   (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_row))<>pg_catalog.array_length(v_allowed,1) OR
   EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_row) AS supplied(k) WHERE supplied.k<>ALL(v_allowed)) OR
   EXISTS(SELECT 1 FROM pg_catalog.unnest(v_allowed) AS expected(k) WHERE v_row->>expected.k IS NULL) THEN
   RAISE EXCEPTION 'Unknown or missing import columns' USING errcode='22023';
  END IF;
  v_i:=v_i+1;
  IF p_resource='companies' THEN
   v_name:=pg_catalog.btrim(v_row->>'name');
   v_eik:=pg_catalog.btrim(v_row->>'eik');
   IF length(v_name) NOT BETWEEN 2 AND 200 OR v_eik !~ '^[0-9]{9}([0-9]{4})?$' OR
    length(v_row->>'address')>300 OR
    (v_row->>'status') NOT IN('active','inactive','archived') THEN
    RAISE EXCEPTION 'Invalid company name, EIK or status' USING errcode='22023';
   END IF;
   -- EIK in the file is only a suggestion until independently verified.
   INSERT INTO public.ctm_company_candidates(tenant_id,source_kind,source_hash,
      source_label,name,confidence,review_status,eik,review_note)
   VALUES(p_tenant,'uploaded_companies',
    pg_catalog.encode(extensions.digest(p_sha256||E'\n'||v_eik||E'\n'||v_name,'sha256'),'hex'),
    'CSV/XLSX административен импорт',v_name,'uncertain','pending',NULL,
    'ЕИК от CSV (непотвърден): '||v_eik)
   ON CONFLICT(tenant_id,source_kind,source_hash) DO NOTHING;
  ELSE
   v_eik:=pg_catalog.btrim(v_row->>'company_eik');
   IF v_eik !~ '^[0-9]{9}([0-9]{4})?$' THEN
    RAISE EXCEPTION 'Invalid company EIK' USING errcode='22023';
   END IF;
   SELECT c.id,c.status INTO v_company,v_company_status FROM public.companies c
   WHERE c.tenant_id=p_tenant AND c.eik=v_eik
    AND c.status IN('active','inactive') AND EXISTS(
     SELECT 1 FROM public.ctm_company_candidates cc
      WHERE cc.tenant_id=p_tenant AND cc.review_status='verified'
       AND cc.promoted_company_id=c.id)
   LIMIT 1;
   IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company EIK must be verified before importing related records' USING errcode='23503';
   END IF;
   IF p_resource='employees' THEN
    v_name:=pg_catalog.btrim(v_row->>'full_name');
    IF length(v_name) NOT BETWEEN 3 AND 200 OR length(v_row->>'job_title')>150
     OR length(v_row->>'reference_code')>80 THEN
     RAISE EXCEPTION 'Invalid employee fields' USING errcode='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.employees e
     WHERE e.tenant_id=p_tenant AND e.company_id=v_company
      AND pg_catalog.upper(e.full_name)=pg_catalog.upper(v_name)) THEN
     RAISE EXCEPTION 'Possible duplicate employee; review first' USING errcode='23505';
    END IF;
    INSERT INTO public.employees(tenant_id,company_id,full_name,job_title,reference_code,current_status)
    VALUES(p_tenant,v_company,v_name,v_row->>'job_title',v_row->>'reference_code','pending');
   ELSIF p_resource='worksites' THEN
    v_name:=pg_catalog.btrim(v_row->>'name');
    IF length(v_name) NOT BETWEEN 2 AND 200 OR length(v_row->>'address')>300 OR
     (v_row->>'active') NOT IN('true','false') THEN
     RAISE EXCEPTION 'Invalid worksite fields' USING errcode='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.worksites w
     WHERE w.tenant_id=p_tenant AND w.company_id=v_company AND pg_catalog.upper(w.name)=pg_catalog.upper(v_name)) THEN
     RAISE EXCEPTION 'Possible duplicate worksite' USING errcode='23505';
    END IF;
    INSERT INTO public.worksites(tenant_id,company_id,name,address,active)
    VALUES(p_tenant,v_company,v_name,v_row->>'address',(v_row->>'active')::boolean);
   ELSIF p_resource='job_positions' THEN
    v_name:=pg_catalog.btrim(v_row->>'title');
    IF length(v_name) NOT BETWEEN 2 AND 200 OR length(v_row->>'department')>200 OR
      (v_row->>'active') NOT IN('true','false') THEN
     RAISE EXCEPTION 'Invalid job position fields' USING errcode='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.job_positions p
     WHERE p.tenant_id=p_tenant AND p.company_id=v_company AND
      pg_catalog.upper(p.title)=pg_catalog.upper(v_name) AND
      pg_catalog.upper(p.department)=pg_catalog.upper(v_row->>'department')) THEN
     RAISE EXCEPTION 'Possible duplicate job position' USING errcode='23505';
    END IF;
    INSERT INTO public.job_positions(tenant_id,company_id,title,department,active)
    VALUES(p_tenant,v_company,v_name,v_row->>'department',(v_row->>'active')::boolean);
   ELSIF p_resource='risk_assessments' THEN
    IF length(v_row->>'hazard') NOT BETWEEN 3 AND 800 OR
      length(v_row->>'workplace')>250 OR length(v_row->>'protective_measures')>2000 OR
      (v_row->>'risk_level') NOT IN('low','medium','high') OR
      (v_row->>'assessment_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
      (v_row->>'review_due') !~ '^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
      ((v_row->>'review_due')<>'' AND (v_row->>'review_due')<(v_row->>'assessment_date')) THEN
     RAISE EXCEPTION 'Invalid risk assessment fields' USING errcode='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.risk_assessments r
     WHERE r.tenant_id=p_tenant AND r.company_id=v_company
      AND r.workplace=v_row->>'workplace' AND r.hazard=v_row->>'hazard'
      AND r.assessment_date=(v_row->>'assessment_date')::date) THEN
     RAISE EXCEPTION 'Possible duplicate risk assessment' USING errcode='23505';
    END IF;
    INSERT INTO public.risk_assessments(tenant_id,company_id,workplace,hazard,risk_level,
      protective_measures,assessment_date,review_due,status,created_by)
    VALUES(p_tenant,v_company,v_row->>'workplace',v_row->>'hazard',v_row->>'risk_level',
      v_row->>'protective_measures',(v_row->>'assessment_date')::date,
      NULLIF(v_row->>'review_due','')::date,'draft',v_actor);
   END IF;
  END IF;
 END LOOP;
 RETURN v_i;
END $fn$;
REVOKE ALL ON FUNCTION public.ctm_import_nonclinical(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ctm_import_nonclinical(uuid,text,jsonb,text) TO authenticated;

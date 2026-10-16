import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261016104535_safe_archive_link_v016.sql');
const csvMigration=read('supabase/migrations/20261016105514_real_nonclinical_import_v016.sql');
const csvSource=read('src/lib/import-csv.ts');
const actions=read('src/lib/archive-link-actions.ts');
const link=read('src/components/archive-employee-linker.tsx');
const detail=read('src/app/(protected)/app/migration/archive/[id]/page.tsx');
const lifecycle=read('src/lib/lifecycle-actions.ts');
const controls=read('src/components/lifecycle-controls.tsx');
const team=read('src/lib/team-actions.ts');
const teamUI=read('src/components/team-manager.tsx');
const importer=read('src/components/archive-personnel-importer.tsx');
const sidebar=read('src/components/sidebar.tsx');
const archive=read('src/app/(protected)/app/migration/archive/page.tsx');
const modulePage=read('src/app/(protected)/app/[module]/page.tsx');
const companyReview=read('src/components/company-candidate-review.tsx');

for(const s of [
 'ENABLE ROW LEVEL SECURITY','REVOKE ALL ON TABLE private.ctm_archive_employee_links',
 'SECURITY DEFINER SET search_path=', 'SECURITY INVOKER SET search_path=',
 "m.active AND m.role='admin'", "x.review_status='verified'",
 "a.record_kind='employee_sample'",'FOR UPDATE',
 'private.ctm_valid_egn','private.ctm_save_employee_clinical',
 "current_status IN ('pending','active','inactive','archived')",
 "VALUES(v_tenant,p_company_id,v_full_name,v_job,v_code,'pending')",
 'Possible existing employee with same name',
 'REVOKE ALL ON FUNCTION public.ctm_promote_archived_employee',
 "p_acknowledged IS DISTINCT FROM true"
])assert.ok(migration.includes(s),'Missing security protection: '+s);
assert.match(actions,/ctx\.role!=='admin'/);
assert.match(actions,/ctm_promote_archived_employee/);
assert.match(link,/type="checkbox" name="acknowledged"/);
assert.match(detail,/ctm_archive_employee_link/);
assert.match(detail,/folder_summary/);
assert.match(lifecycle,/ctx\.role!=='admin'/);
assert.match(lifecycle,/current_status:target/);
assert.match(lifecycle,/revision/);
assert.doesNotMatch(lifecycle,/\.delete\(/);
assert.match(controls,/Премести служителя в архив/);
assert.match(team,/p_active: false/);
assert.match(team,/changeMemberApproval/);
assert.match(teamUI,/Потвърди достъпа/);
assert.match(teamUI,/Изтрий достъпа/);
assert.match(importer,/ctm-advanced-mapping/);
assert.match(importer,/ctm-import-steps/);
assert.doesNotMatch(sidebar,/Архивен опис/);
assert.doesNotMatch(archive,/MEGA — файлове по тип/);
assert.match(modulePage,/neq\('current_status','archived'\)/);
assert.match(companyReview,/ctm-review-trigger/);
assert.doesNotMatch(migration+actions+team,/SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_.*SECRET/);

for(const token of [
 "v_role<>'admin'","m.role IN('admin','specialist')",
 "cc.review_status='verified'", "'uncertain','pending',NULL",
 "ctm_import_batches","Possible duplicate employee",
 "REVOKE ALL ON FUNCTION public.ctm_import_nonclinical",
 "p_resource='risk_assessments'"
])assert.ok(csvMigration.includes(token),'Missing nonclinical real import safeguard: '+token);
assert.ok(!csvMigration.includes('Only synthetic TEST'),'Synthetic-only backend still present');
assert.ok(!csvSource.includes('Само синтетични'),'Synthetic-only parser still present');

console.log('CTM v0.16 restricted archive linking, lifecycle, user approval and real import: PASS');

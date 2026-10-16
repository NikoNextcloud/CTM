import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const corrections=read('supabase/migrations/20261016113734_archive_employee_corrections_v017.sql');
const research=read('supabase/migrations/20261016113749_firm_research_eik_candidates_v017.sql');
const action=read('src/lib/archive-employee-edit-actions.ts');
const editor=read('src/components/archive-employee-editor.tsx');
const archivePage=read('src/app/(protected)/app/migration/archive/[id]/page.tsx');
const mainPage=read('src/app/(protected)/app/employees/[id]/page.tsx');
const mainEdit=read('src/components/edit-panels.tsx');
const firmPage=read('src/app/(protected)/app/migration/companies/page.tsx');
const firmReview=read('src/components/company-candidate-review.tsx');

for(const p of [
 'private.ctm_archive_employee_changes',
 'ENABLE ROW LEVEL SECURITY',
 'REVOKE ALL ON private.ctm_archive_employee_changes',
 "m.role='admin' AND m.active",
 'ctm_archive_employee_current',
 'ctm_archive_employee_save',
 "p_expected_revision",
 'FOR UPDATE',
 "private.ctm_valid_egn",
 'ctm_archive_employee_links',
 "Source provenance cannot be edited",
 "Stale archive revision",
 "EDIT_CORRECTION",
 "v_record:=coalesce((",
 "v_data:=coalesce((",
 "IF p_kind='employee_sample'",
 "public.ctm_archive_employee_current",
 "public.ctm_archive_employee_save",
 "FROM PUBLIC,anon"
])assert.ok(corrections.includes(p),'Missing protected archive-edit gate '+p);
for(const p of [
 'ctm_company_research',
 'ENABLE ROW LEVEL SECURITY',
 'REVOKE ALL ON public.ctm_company_research FROM PUBLIC,anon,authenticated',
 'GRANT SELECT ON public.ctm_company_research TO authenticated',
 "private.has_role(tenant_id,ARRAY['admin'::text])",
 "VALUES",
 "research_state='suggested'",
 "review_status",
 "research_state='ambiguous'",
 "ON CONFLICT(candidate_id) DO NOTHING"
])if(p!=="review_status")assert.ok(research.includes(p),'Missing researched company gate '+p);
assert.ok(!research.includes("UPDATE public.ctm_company_candidates SET review_status='verified'"),
 'Public suggestions must not confirm firms');
assert.ok(!research.includes('INSERT INTO public.companies('),
 'Research must never promote companies');
assert.ok(!research.includes('private.ctm_employee_clinical'),
 'Research must never touch medical data');

assert.match(action,/ctx\.role!=='admin'/);
assert.match(action,/ctm_archive_employee_current/);
assert.match(action,/ctm_archive_employee_save/);
assert.match(action,/input\.data\.revision/);
assert.match(editor,/Редактирай данните/);
assert.match(editor,/Запази редакцията/);
assert.match(editor,/name="confirmed"/);
assert.match(editor,/immutable\.has\(key\)/);
assert.match(editor,/clinical\.test\(key\)/);
assert.match(archivePage,/ArchiveEmployeeEditor/);
assert.match(archivePage,/ctm_archive_employee_current/);
assert.match(archivePage,/href="#archive-edit"/);
assert.match(mainPage,/href="#employee-edit"/);
assert.match(mainEdit,/id="employee-edit" open/);
assert.match(firmPage,/researchById/);
assert.match(firmPage,/ctm_company_research/);
assert.match(firmReview,/proposed_eik/);
assert.match(firmReview,/portal\.registryagency\.bg/);
assert.match(firmReview,/Не е потвърдено/);
assert.ok(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(action+corrections+editor),
 'No elevated secrets in code');
console.log('CTM v0.17: archive employee edit history, admin gates, firm EIK source review PASS');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=file('supabase/migrations/20261017082957_v021_firm_public_checks_and_employee_evidence.sql');
const firms=file('src/app/(protected)/app/migration/checks/page.tsx');
const personnel=file('src/app/(protected)/app/migration/personnel/page.tsx');
const review=file('src/app/(protected)/app/migration/review/page.tsx');
for(const s of ['ctm_company_public_checks','ctm_mega_full_text','ctm_employee_document_evidence',
 'ctm_migration_system_jobs','ENABLE ROW LEVEL SECURITY','REVOKE ALL',
 'ctm_company_public_checks_list','ctm_company_public_checks_summary',
 'ctm_migration_employee_match_list','ctm_migration_evidence_summary',
 "current_status='active'","medical_import_state"])assert.ok(sql.includes(s),'Missing security rule '+s);
assert.match(firms,/ctx\.role!=='admin'/);
assert.match(firms,/ctm_company_public_checks_list/);
assert.match(firms,/не е равнозначно на актуална справка/);
for(const status of ['linked_pending','invalid_egn','missing_egn','secondary_document_missing'])
 assert.ok(personnel.includes(status),'Missing worker status '+status);
assert.match(review,/item\.state==='approved'/);
assert.doesNotMatch(sql+firms+personnel,/xAtx_INwUWvR08TwiA6yAw/);
console.log('CTM v0.21 evidence dashboard, medical protection and employer-scoped permissions PASS');


import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261017202009_v022_documentary_company_eik.sql');
const ui=read('src/app/(protected)/app/migration/doc-eik/page.tsx');
const reviews=read('src/app/(protected)/app/migration/review/page.tsx');
const checks=read('src/app/(protected)/app/migration/checks/page.tsx');
for(const clause of ['ctm_candidate_doc_eik_evidence','ENABLE ROW LEVEL SECURITY',
 'REVOKE ALL','private.ctm_candidate_doc_eik_summary','private.ctm_candidate_doc_eik_list',
 "m.role='admin'","auth.uid()"])
 assert.ok(sql.includes(clause),'Missing security condition '+clause);
assert.match(ui,/ctx\.role!=='admin'/);
assert.match(ui,/ctm_candidate_doc_eik_summary/);
assert.match(ui,/ctm_candidate_doc_eik_list/);
assert.match(ui,/portal\.registryagency\.bg/);
assert.match(ui,/не потвърждение/);
assert.match(reviews,/archived_eik_proposed_requires_registry/);
assert.match(checks,/\/app\/migration\/doc-eik/);
assert.doesNotMatch(sql+ui,/xAtx_INwUWvR08TwiA6yAw|SUPABASE_SERVICE_ROLE_KEY\s*=/);
console.log('CTM v0.22 secure documentary company EIK review PASS');


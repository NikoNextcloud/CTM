import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261016040700_v011_verified_company_reconciliation.sql',import.meta.url),'utf8');
const baseline=readFileSync(new URL('../supabase/migrations/20261015141338_v10_company_candidates_staging.sql',import.meta.url),'utf8');
const action=readFileSync(new URL('../src/lib/candidate-actions.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/app/(protected)/app/migration/companies/page.tsx',import.meta.url),'utf8');
const form=readFileSync(new URL('../src/components/company-candidate-review.tsx',import.meta.url),'utf8');

const requiredSql=[
 'security invoker','set search_path=',"private.has_role(c.tenant_id,array['admin'::text])",
 'ctm_valid_company_eik','for update','from public.ctm_company_candidates',
 "review_status='verified'","'inactive'","promoted_company_id",
 'Imported source evidence is immutable',
 'revoke all on function public.ctm_promote_company_candidate',
 'grant execute on function public.ctm_promote_company_candidate'
];
for(const token of requiredSql){
 assert.ok(sql.toLowerCase().includes(token.toLowerCase()),'Missing SQL guard: '+token);
}
assert.match(sql,/ctm_company_candidate_verified_link/);
assert.match(sql,/v_existing_name/);
assert.match(sql,/company name.*different|another company name/i);
assert.match(baseline,/ctm_company_candidate_integrity/);
assert.match(baseline,/ctm_candidate_admin_read/);
assert.match(action,/ctx\.role!=='admin'/);
assert.match(action,/form\.get\('confirmation'\)!=='yes'/);
assert.match(action,/\.eq\('tenant_id',ctx\.tenant\)/);
assert.match(page,/ctx\.role!=='admin'/);
assert.match(page,/ctm_company_candidates/);
assert.match(page,/count:'exact'/);
assert.match(form,/useActionState\(promoteCandidate/);
assert.match(form,/minLength=\{24\}/);
assert.match(form,/target="_blank" rel="noopener noreferrer"/);
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|process\.env\.SECRET|createUser\(/.test(action+page+form));
console.log('Candidate review, SQL idempotency and tenant authorization static gates passed');

import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,base),'utf8');
const reviewSQL=read('supabase/migrations/202610150006_employment_review.sql');
const adminSQL=read('supabase/migrations/202610150005_admin_and_revisions.sql');
const reviewAction=read('src/lib/employment-review-actions.ts');
const company=read('src/app/(protected)/app/companies/[id]/page.tsx');
const audit=read('src/app/(protected)/app/audit/page.tsx');
const nav=read('src/components/sidebar.tsx');
const dash=read('src/app/(protected)/app/page.tsx');
const csv=read('src/app/api/export/route.ts');
const safeCsv=read('src/lib/import-csv.ts');
const team=read('src/lib/team-actions.ts');
const checks=[
 ['Review evidence text column',/verification_note text/.test(reviewSQL)],
 ['Review actor recorded',/NEW\.verified_by:=v_actor/.test(reviewSQL)],
 ['Review time recorded',/NEW\.verified_at:=now\(\)/.test(reviewSQL)],
 ['No automatic verified insert',/New periods must start as unverified/.test(reviewSQL)],
 ['Evidence minimum length',/length\(trim\(NEW\.verification_note\)\)<12/.test(reviewSQL)],
 ['Exact duplicate employment index',/employment_periods_exact_unique_v05/.test(reviewSQL)],
 ['Review requires CTM role',/m\.role in \('admin','specialist'\)/.test(reviewSQL)],
 ['Review uses optimistic revision guard',/\.eq\('revision',row\.revision\)/.test(reviewAction)],
 ['Review action tenant scoped',/\.eq\('tenant_id',ctx\.tenant\)/.test(reviewAction)],
 ['UI shows evidence check',/reviewEmploymentPeriod/.test(company)],
 ['UI sends revision',/name="revision" value=\{p\.revision\}/.test(company)],
 ['No automatic user creation',!/inviteUserByEmail|createServiceClient|auth\.signUp/.test(team)],
 ['Privileged SQL functions in private schema',/alter function public\.ctm_manage_member[\s\S]*set schema private/.test(adminSQL)],
 ['Audit admin/auditor restriction',/\['admin','auditor'\]/.test(audit)],
 ['Audit records tenant filtered',/\.eq\('tenant_id',ctx\.tenant\)/.test(audit)],
 ['Audit navigation restricted',/\['admin','auditor'\]\.includes\(role\)/.test(nav)],
 ['Audit dashboard restricted',/\['admin','auditor'\]\.includes\(c\.role\)/.test(dash)],
 ['CSV formula escape',/csvEscape/.test(csv)&&/\[=\+@-\]/.test(safeCsv)],
 ['CSV limited to 5000 records',/const LIMIT=5000/.test(csv)],
 ['No diagnosis or EGN columns in migration',!/\b(?:diagnosis|egn)\s+(?:text|varchar|jsonb)\b/i.test(reviewSQL)]
];
for(const [name,ok] of checks)assert.ok(ok,'CTM v0.6 FAILED: '+name);
console.log('CTM v0.6 STATIC AUDIT: '+checks.length+'/'+checks.length+' checks passed. Live multi-role and legal verification remain required.');

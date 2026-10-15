import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const sql=read('supabase/migrations/202610150004_company_structure.sql');
const actions=read('src/lib/organization-actions.ts');
const dossier=read('src/app/(protected)/app/companies/[id]/page.tsx');
const report=read('src/app/(protected)/app/reports/page.tsx');
const listing=read('src/app/(protected)/app/[module]/page.tsx');
for(const table of ['worksites','job_positions','employment_periods']){
  assert.match(sql,new RegExp('create table public\\.'+table+' \\('));
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(sql,/revoke all on public\.worksites/);
  assert.match(sql,new RegExp('create trigger '+table+'_audit'));
}
assert.match(sql,/foreign key \(tenant_id, company_id, employee_id\) references public\.employees\(tenant_id,company_id,id\)/);
assert.match(sql,/foreign key \(tenant_id, company_id, position_id\) references public\.job_positions\(tenant_id,company_id,id\)/);
assert.match(sql,/foreign key \(tenant_id, company_id, worksite_id\) references public\.worksites\(tenant_id, company_id, id\)/);
assert.doesNotMatch(sql,/\b(egn|diagnosis)\s+(text|varchar|jsonb)\b/i);
assert.doesNotMatch(sql,/using\s*\(\s*true\s*\)/i);
for(const fn of ['createWorksite','createJobPosition','createEmploymentPeriod'])
  assert.match(actions,new RegExp('export async function '+fn));
assert.match(actions,/verification_status:'unverified'/);
assert.match(actions,/ctx\.tenant/);
assert.match(actions,/company_id.*input\.company_id/s);
assert.match(dossier,/firmResult\.error\s*\|\|\s*!firmResult\.data/);
assert.match(dossier,/getContext\(\)/);
assert.match(listing,/company-link/);
assert.match(report,/admin','specialist/);
assert.doesNotMatch(report,/from\('examinations'\)|from\('sick_leaves'\)|from\('documents'\)/);
assert.match(read('vercel.json'),/"fra1"/);
assert.doesNotMatch(read('src/lib/team-actions.ts'),/inviteUserByEmail|createServiceClient/);
console.log('STRUCTURE SECURITY STATIC AUDIT: checked cross-company keys, RLS and EU region');

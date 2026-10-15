import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const migration = read('supabase/migrations/202610150005_admin_and_revisions.sql');
const actions = read('src/lib/edit-actions.ts');
const panels = read('src/components/edit-panels.tsx');
const dossier = read('src/app/(protected)/app/companies/[id]/page.tsx');
const listing = read('src/app/(protected)/app/[module]/page.tsx');
const risk = read('src/app/(protected)/app/risks/[id]/page.tsx');
const employee = read('src/app/(protected)/app/employees/[id]/page.tsx');
const yes = (source, phrase) => assert.ok(source.includes(phrase), 'Missing protection: ' + phrase);
const no = (source, phrase) => assert.ok(!source.includes(phrase), 'Forbidden pattern: ' + phrase);

for (const name of ['ctm_find_auth_user', 'ctm_manage_member']) {
  yes(migration, 'alter function public.' + name + '(');
  yes(migration, 'create function public.' + name + '(');
}
yes(migration, 'security invoker');
yes(migration, 'create function private.revision_and_scope_guard');
yes(migration, 'new.revision := old.revision+1');
yes(migration, 'Record identity and tenant are immutable');
yes(migration, 'Company linkage cannot be reassigned');
yes(migration, 'Employment links cannot be reassigned');
yes(migration, 'Risk author is immutable');
yes(migration, 'risk_approval_blocked_v05');
for (const name of ['company','employee','worksite','position','employment','risk'])
  yes(migration, 'create trigger ' + name + '_revision_guard');
for (const name of ['Company','Employee','Worksite','Position','EmploymentPeriod','Risk']) {
  yes(actions, 'export async function edit' + name + '(');
  yes(panels, 'edit' + name);
}
yes(actions, ".eq('revision',revision)");
yes(actions, ".eq('tenant_id',ctx.tenant)");
yes(actions, "['admin','specialist']");
yes(actions, "verification_status:'unverified'");
no(actions, 'SUPABASE_SERVICE_ROLE_KEY');
no(actions, 'inviteUserByEmail');
for (const name of ['sites','positions','employees','periods']) {
  yes(dossier, "pager('" + name + "'");
  yes(dossier, 'pages.' + name);
}
yes(dossier, 'findEmployee');
yes(dossier, 'findPosition');
yes(dossier, 'EditCompanyPanel');
yes(risk, 'EditRiskPanel');
yes(employee, 'EditEmployeePanel');
yes(listing, '/app/employees/');
yes(listing, '/app/risks/');
no(migration, 'egn text');
no(migration, 'diagnosis text');
console.log('CTM v0.5 assertions passed. Live multi-role integration tests remain open.');

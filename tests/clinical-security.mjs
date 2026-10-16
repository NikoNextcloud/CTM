import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261016063340_clinical_employee_fields_v012.sql');
const actions=read('src/lib/clinical-actions.ts');
const panel=read('src/components/employee-clinical-panel.tsx');
const detail=read('src/app/(protected)/app/employees/[id]/page.tsx');
const employeeForm=read('src/components/employee-form.tsx');

for(const guard of [
 'CREATE TABLE IF NOT EXISTS private.ctm_employee_clinical',
 'encrypted_record bytea NOT NULL',
 'extensions.pgp_sym_encrypt',
 'extensions.pgp_sym_decrypt',
 'vault.decrypted_secrets',
 'vault.create_secret',
 'ctm_employee_clinical_duplicate_egn',
 'private.has_role(v_tenant,ARRAY[\'admin\'::text,\'doctor\'::text])',
 'SECURITY DEFINER SET search_path=',
 'SECURITY INVOKER SET search_path=',
 'REVOKE ALL ON FUNCTION public.ctm_read_employee_clinical(uuid)',
 'REVOKE ALL ON TABLE private.ctm_employee_clinical FROM PUBLIC,anon,authenticated',
 'audit_events.entity <> \'employee_clinical\'',
 'p_expected_revision',
 "errcode='40001'",
 "errcode='42501'",
 'pg_catalog.make_date',
 'private.ctm_valid_egn'
 ])assert.ok(sql.includes(guard),'Missing clinical protection: '+guard);
assert.match(actions,/ctx\.role\)/);
assert.match(actions,/!\['admin','doctor'\]\.includes\(ctx\.role\)/);
assert.match(actions,/getContext\(\)/);
assert.match(actions,/\.eq\('tenant_id',ctx\.tenant\)/);
assert.match(actions,/ctm_save_employee_clinical/);
assert.match(actions,/revalidatePath/);
assert.match(panel,/useActionState\(saveEmployeeClinical/);
for(const field of ['egn','telk','diagnosis','notes'])
 assert.ok(panel.includes('name="'+field+'"'),'Missing editable field '+field);
assert.match(panel,/type=\{showEgn\?'text':'password'\}/);
assert.match(panel,/revision:\s*record\.revision\|\|0/);
assert.match(detail,/canClinical=\['admin','doctor'\]/);
assert.match(detail,/canClinical\?await ctx\.supabase\.rpc\('ctm_read_employee_clinical'/);
assert.match(detail,/<EmployeeClinicalPanel employeeId=\{id\}/);
assert.doesNotMatch(employeeForm,/ЕГН и медицински сведения не се въвеждат/);
assert.doesNotMatch(sql+actions+panel,/SUPABASE_SERVICE_ROLE_KEY|process\.env\.SUPABASE_SECRET_KEY/);
console.log('CTM v0.12 encrypted clinical fields, access gates and audit static checks: PASS');

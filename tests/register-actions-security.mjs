import assert from 'node:assert/strict';
import fs from 'node:fs';
const action=fs.readFileSync(new URL('../src/lib/register-actions.ts',import.meta.url),'utf8');
const form=fs.readFileSync(new URL('../src/components/register-forms.tsx',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../src/app/(protected)/app/[module]/page.tsx',import.meta.url),'utf8');
for(const marker of ["authorized(['doctor'])","employeeAllowed(ctx","fitness:'pending'","verification_status:'unverified'","registerMigrationSource","role==='doctor'"]){
 assert.ok((action+' '+form).includes(marker),'Missing medical/migration guard '+marker);
}
assert.ok(page.includes('DocumentMetadataForm'));
assert.ok(page.includes('ExaminationForm'));
assert.ok(page.includes('SickLeaveForm'));
assert.ok(page.includes('MigrationSourceForm'));
assert.ok(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(action));
console.log('Doctor-only and migration form guard checks passed. Browser per-role tests still required.');

import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/202610150007_nonclinical_import.sql');
const actions=read('src/lib/transfer-actions.ts');
const api=read('src/app/api/export/route.ts');
const csv=read('src/lib/import-csv.ts');
const ui=read('src/components/transfer-manager.tsx');
const checks=[
 ['Role gate',/m\.role in \('admin','specialist'\)/.test(sql)],
 ['Invoker RPC',/security invoker/.test(sql)],
 ['RLS batches',/ctm_import_batches enable row level security/.test(sql)],
 ['Atomic import',/create or replace function public\.ctm_import_nonclinical/.test(sql)],
 ['No elevated service key',!/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(actions)],
 ['Synthetic company and employee enforcement',/Only synthetic TEST companies/.test(sql)&&/Only synthetic TEST employees/.test(sql)],
 ['Narrow test firm codes',/\^000000\[0-9\]\{3\}\$/.test(sql)],
 ['Max 100 rows',/v_count>100/.test(sql)],
 ['Duplicate batch hash',/unique\(tenant_id,resource,payload_hash\)/.test(sql)],
 ['No anonymous execution',/revoke all on function public\.ctm_import_nonclinical/.test(sql)],
 ['Audit inserted in private trigger',/private\.ctm_audit_import_batch/.test(sql)&&/security definer/.test(sql)],
 ['No audit INSERT grant to user',!/grant insert on public\.audit_events to authenticated/i.test(sql)],
 ['CSV preview',/previewNonClinicalImport/.test(ui)],
 ['Explicit confirmation',/executeNonClinicalImport/.test(ui)],
 ['Export role gate',/\['admin','specialist'\]/.test(api)],
 ['Export tenant filter',/\.eq\('tenant_id',ctx\.tenant\)/.test(api)],
 ['Export no cache',/private, no-store/.test(api)],
 ['Export escaping',/csvEscape/.test(api)&&/\[=\+@-\]/.test(csv)],
 ['Export max 5000',/const LIMIT=5000/.test(api)],
 ['CSV header whitelist',/Очаквани колони/.test(csv)],
 ['No health field column',!/\b(?:egn|diagnosis)\s+(?:text|varchar|jsonb)\b/i.test(sql)]
];
for(const [name,ok] of checks)assert.ok(ok,'Import/export security gate: '+name);
console.log('Import/export static gate: '+checks.length+' checks passed (live RLS tests required).');

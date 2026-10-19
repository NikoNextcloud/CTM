import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('src/app/(protected)/app/migration/personnel/page.tsx');
const firm=read('src/components/company-candidate-review.tsx');
for(const term of ['ctm_migration_evidence_summary','ctm_migration_employee_match_list','Свързани по втори документ','Провери фирмата','Статус на връзката'])assert.ok(page.includes(term),'Missing working review '+term);
assert.ok(!firm.includes('/app/migration/mega?q='));
assert.ok(page.includes("ctx.role!=='admin'"));
console.log('CTM v0.20 evidence review UI gates PASS');
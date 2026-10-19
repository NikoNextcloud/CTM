import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const at=p=>new URL('../'+p,import.meta.url);
for (const path of [
 'src/app/(protected)/app/migration/mega/page.tsx',
 'src/app/(protected)/app/migration/mega/[handle]/page.tsx',
 'src/app/api/mega/file/[handle]/route.ts',
 'src/lib/mega-originals.ts',
 'src/app/(protected)/app/migration/actions.ts'
]) assert.equal(existsSync(at(path)),false,'Retired MEGA route still exists: '+path);
const ui=[
 'src/app/(protected)/app/[module]/page.tsx',
 'src/app/(protected)/app/page.tsx',
 'src/components/sidebar.tsx',
 'src/components/company-candidate-review.tsx',
 'src/app/(protected)/app/migration/personnel/page.tsx',
 'src/app/(protected)/app/migration/report/page.tsx'
].map(p=>readFileSync(at(p),'utf8')).join('\n');
assert.doesNotMatch(ui,/href=[\s\S]{0,80}\/app\/migration\/mega/);
assert.doesNotMatch(ui,/ctm_mega_summary/);
assert.match(readFileSync(at('package.json'),'utf8'),/"version": "0.24.0"/);
console.log('CTM v0.24: MEGA navigation and download routes removed, other register paths preserved PASS');

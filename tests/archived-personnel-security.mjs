import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(f)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261016080329_secure_archived_personnel_import.sql');
const source=read('src/lib/archive-import-actions.ts');
const parser=read('src/lib/archive-workbook.ts');
const ui=read('src/components/archive-personnel-importer.tsx');
const archivePage=read('src/app/(protected)/app/migration/archive/page.tsx');
const personnelPage=read('src/app/(protected)/app/migration/personnel/page.tsx');
const detailPage=read('src/app/(protected)/app/migration/archive/[id]/page.tsx');
const summary=read('src/components/archived-personnel-peek.tsx');
const sidebar=read('src/components/sidebar.tsx');
const modulePage=read('src/app/(protected)/app/[module]/page.tsx');
const transfer=read('src/components/transfer-manager.tsx');

for(const token of [
 'SECURITY DEFINER SET search_path=',
 'SECURITY INVOKER SET search_path=',
 'auth.uid()',
 "m.active AND m.role='admin'",
 "REVOKE ALL ON FUNCTION public.ctm_archive_ingest_admin(text,text,jsonb)",
 'ctm_archive_ingest_batch',
 'ctm_archive_source_status'
])assert.ok(migration.includes(token),'Missing SQL access/dedup guard: '+token);
assert.match(source,/ctx\.role!=='admin'/);
assert.match(source,/ctm_archive_ingest_admin/);
assert.match(source,/ctm_archive_source_status/);
assert.match(source,/rows\.length/);
assert.match(ui,/read-excel-file\/browser/);
assert.match(ui,/crypto\.subtle\.digest/);
assert.match(ui,/prepareArchivePersonnel/);
assert.match(ui,/verifyArchiveSource/);
assert.match(ui,/prepared\.rows\.length/);
assert.match(parser,/телк/i);
assert.match(parser,/егн/i);
assert.match(personnelPage,/ctx\.role!=='admin'/);
assert.match(personnelPage,/<ArchivePersonnelImporter\/>/);
assert.match(detailPage,/ctx\.role!=='admin'/);
assert.match(detailPage,/ctm_archive_get/);
assert.match(archivePage,/ctx\.role!=='admin'/);
assert.match(summary,/ctx\.role!=='admin'/);
assert.match(sidebar,/href="\/app\/migration\/personnel"/);
assert.match(modulePage,/ArchivedPersonnelPeek/);
assert.match(transfer,/href="\/app\/migration\/personnel"/);
assert.ok(!/SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|INSERT INTO auth\.users/.test(
 migration+source+ui+personnelPage+detailPage));
console.log('Archive import, authorization, EGN/TELK retention and visibility static gates: PASS');

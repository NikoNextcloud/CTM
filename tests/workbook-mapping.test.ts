import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import readXlsxFile from 'read-excel-file/node';
import {
 inspectWorkbook,mapWorkbookSheet,describeSheet,type WorkbookSheet
} from '../src/lib/workbook-mapping';
import {parseCsv} from '../src/lib/import-csv';

const xmlHead='<?xml version="1.0" encoding="UTF-8"?>';
const xmlEscape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function sheetXml(rows:(string|null)[][]){
 const body=rows.map((cells,i)=>'<row r="'+(i+1)+'">'+cells.map((v,j)=>{
  if(v===null)return '';
  const col=String.fromCharCode(65+j);
  return '<c r="'+col+(i+1)+'" t="inlineStr"><is><t>'+xmlEscape(v)+'</t></is></c>';
 }).join('')+'</row>').join('');
 return xmlHead+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+body+'</sheetData></worksheet>';
}
const headers=['№','Раб No','Име Презиме Фамилия','Град','Адрес','ЕГН','Длъжност','Код по НКПД','Личен лекар','ТЕЛК','новопостъпили / дата','напуснали / дата','Допълнителни данни (за проверка)'];
const main=[
 ['Служители – вътрешна структура'],
 [],
 headers,
 ...Array.from({length:61},(_,i)=>[
  String(i+1),'CODE-'+String(i+1).padStart(3,'0'),'ТЕСТ Служител '+(i+1),
  'Град','','SECRET_NEVER_TRANSMIT','Оператор','0000','SECRET_NEVER_TRANSMIT',
  'SECRET_NEVER_TRANSMIT','','','Бележка – не се импортира'
 ])
];
const summary=[['Вид проверка','Описание'],['Архив','Изисква проверка']];
const sheetNames=['Лист1','Данни извън импорта','Проверки'];
const sheetsXml=[sheetXml(main),sheetXml(summary),sheetXml(summary)];
const contentTypes=xmlHead+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
 '<Default Extension="xml" ContentType="application/xml"/>'+
 '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
 sheetsXml.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
const relationship=xmlHead+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const workbookXml=xmlHead+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
 sheetNames.map((name,i)=>'<sheet name="'+name+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
const workbookRels=xmlHead+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 sheetNames.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>';
const entries:Record<string,Uint8Array>={
 '[Content_Types].xml':strToU8(contentTypes),
 '_rels/.rels':strToU8(relationship),
 'xl/workbook.xml':strToU8(workbookXml),
 'xl/_rels/workbook.xml.rels':strToU8(workbookRels)
};
sheetsXml.forEach((s,i)=>{entries['xl/worksheets/sheet'+(i+1)+'.xml']=strToU8(s);});
const xlsx=Buffer.from(zipSync(entries));
async function run(){
const decoded=await readXlsxFile(xlsx) as unknown as WorkbookSheet[];
assert.equal(decoded.length,3,'Multi-sheet XLSX remains readable');
const profiles=inspectWorkbook(decoded,'employees');
assert.equal(profiles[0].headerRow,2,'The third worksheet row is the real header');
assert.equal(profiles[0].dataRows,61);
assert.equal(profiles[0].recognized,3);
assert.equal(profiles[0].mapping.full_name,2);
assert.equal(profiles[0].mapping.job_title,6);
assert.equal(profiles[0].mapping.reference_code,1);
assert.equal(profiles[0].mapping.company_eik,-1);
assert.ok(profiles[0].privateColumns.includes('ЕГН'));
assert.ok(profiles[0].privateColumns.includes('ТЕЛК'));

const mapping=profiles[0].mapping;
const prepared=mapWorkbookSheet(decoded[0],'employees',2,mapping,{company_eik:'000000001'});
assert.equal(prepared.issues.length,0,prepared.issues.join('; '));
assert.equal(prepared.rowCount,61);
assert.ok(prepared.excludedColumns.includes('ЕГН'));
assert.ok(!prepared.csv.includes('SECRET_NEVER_TRANSMIT'),'Unmapped health data never reach transport payload');
const parsed=parseCsv(prepared.csv,'employees');
assert.equal(parsed.issues.length,0,JSON.stringify(parsed.issues));
assert.equal(parsed.rows.length,61);

const privateMap={...mapping,job_title:5};
const blocked=mapWorkbookSheet(decoded[0],'employees',2,privateMap,{company_eik:'000000001'});
assert.ok(blocked.issues.some(x=>x.includes('лична/медицинска')));
assert.equal(blocked.csv,'');

const missing=structuredClone(decoded);
missing[0].data[3][1]='';
const missingResult=mapWorkbookSheet(missing[0],'employees',2,mapping,{company_eik:'000000001'});
assert.ok(missingResult.issues.some(x=>x.includes('Липсва задължително поле')));
assert.equal(missingResult.csv,'');

const expanded=structuredClone(decoded);
expanded[0].data.push(...Array.from({length:45},()=>main[3]));
const tooMany=mapWorkbookSheet(expanded[0],'employees',2,mapping,{company_eik:'000000001'});
assert.ok(tooMany.issues.some(x=>x.includes('максимумът')));
assert.equal(tooMany.csv,'');

const reselected=describeSheet(decoded[1],1,'employees',0);
assert.equal(reselected.dataRows,1);
console.log('XLSX → 3 sheets → row 3 headers → 13 source cols → 61 safe rows → CSV validation: PASS');

}
void run().catch(error=>{console.error(error);process.exitCode=1;});

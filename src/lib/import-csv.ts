export type TransferResource = 'companies'|'employees'|'worksites'|'job_positions'|'risk_assessments';
export const CSV_FORMATS:Record<TransferResource,readonly string[]>={
  companies:['name','eik','address','status'],
  employees:['company_eik','full_name','job_title','reference_code'],
  worksites:['company_eik','name','address','active'],
  job_positions:['company_eik','title','department','active'],
  risk_assessments:['company_eik','workplace','hazard','risk_level','protective_measures','assessment_date','review_due']
};
export const IMPORT_LIMIT_BYTES=128*1024;
export const IMPORT_LIMIT_ROWS=100;
export type ImportIssue={row:number;message:string};
const RESOURCES=new Set<string>(Object.keys(CSV_FORMATS));
export function isTransferResource(x:string):x is TransferResource{return RESOURCES.has(x);}
const testName=(s:string)=>/^(test|тест)[ _-]/iu.test(s);
const testEik=(s:string)=>/^000000[0-9]{3}$/.test(s);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
function validDate(value:string){return ISO.test(value)&&!Number.isNaN(Date.parse(value));}
function validate(x:Record<string,string>,r:TransferResource,row:number,issues:ImportIssue[]){
 const fail=(message:string)=>issues.push({row,message});
 if(r==='companies'){
  if(!testName(x.name)||x.name.length<3||x.name.length>200)fail('Само синтетични ТЕСТ/TEST фирми.');
  if(!testEik(x.eik))fail('Тестов ЕИК трябва да е във формат 000000XXX.');
  if(x.address.length>300||!['active','inactive','archived'].includes(x.status))fail('Невалиден адрес или статус.');
 }else{
  if(!testEik(x.company_eik))fail('Фирмата трябва да има тестов код 000000XXX.');
  if(r==='employees'&&(!testName(x.full_name)||x.full_name.length>200||x.job_title.length>150||!x.reference_code||x.reference_code.length>80))fail('Разрешени са само синтетични служители.');
  if(r==='worksites'&&(x.name.length<2||x.name.length>200||x.address.length>300||!['true','false'].includes(x.active)))fail('Невалидни данни за обект.');
  if(r==='job_positions'&&(x.title.length<2||x.title.length>200||x.department.length>200||!['true','false'].includes(x.active)))fail('Невалидни данни за длъжност.');
  if(r==='risk_assessments'){
   if(x.hazard.length<3||x.hazard.length>800||x.workplace.length>250||x.protective_measures.length>2000||!['low','medium','high'].includes(x.risk_level))fail('Невалидни данни за риска.');
   if(!validDate(x.assessment_date)||(x.review_due&&(!validDate(x.review_due)||x.review_due<x.assessment_date)))fail('Невалидни дати.');
  }
 }
}
export function parseCsv(input:string,resource:TransferResource){
 const issues:ImportIssue[]=[];
 if(new TextEncoder().encode(input).length>IMPORT_LIMIT_BYTES)return{rows:[] as Record<string,string>[],issues:[{row:0,message:'Максимум 128 KB.'}],headers:[] as string[]};
 if(input.includes('\u0000')||input.includes('\uFFFD'))return{rows:[] as Record<string,string>[],issues:[{row:0,message:'Изисква се UTF-8 CSV.'}],headers:[] as string[]};
 const source=input.replace(/^\uFEFF/,'');
 let inQuote=false,commas=0,semis=0;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(inQuote&&source[i+1]==='"'){i++;continue;}inQuote=!inQuote;}else if(!inQuote){if(c==='\n'||c==='\r')break;if(c===',')commas++;if(c===';')semis++;}}
 const delim=semis>commas?';':',';
 let cell='',line=1,quoted=false,closed=false,columns:string[]=[];
 const grid:string[][]=[];
 function push(){columns.push(cell);cell='';closed=false;}
 function finish(){push();if(columns.some(x=>x.trim()))grid.push(columns);columns=[];}
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}}
  else if(c==='"'){if(cell||closed){issues.push({row:line,message:'Неправилни кавички.'});break;}quoted=true;}
  else if(c===delim)push();
  else if(c==='\r'&&source[i+1]==='\n'){finish();i++;line++;}
  else if(c==='\n'||c==='\r'){finish();line++;}
  else if(closed){if(c===' '||c==='\t')continue;issues.push({row:line,message:'Текст след кавички.'});break;}
  else cell+=c;
  if(cell.length>2200||grid.length>IMPORT_LIMIT_ROWS+1){issues.push({row:line,message:'Надвишен лимит.'});break;}
 }
 if(quoted)issues.push({row:line,message:'Незатворени кавички.'});
 if(!issues.length&&(cell||columns.length||closed))finish();
 const expected=CSV_FORMATS[resource];
 const headers=(grid.shift()||[]).map(x=>x.trim().toLowerCase());
 if(headers.length!==expected.length||headers.some((x,i)=>x!==expected[i]))issues.push({row:1,message:'Очаквани колони: '+expected.join('; ')});
 if(!grid.length||grid.length>IMPORT_LIMIT_ROWS)issues.push({row:0,message:'Изискват се 1–100 записа.'});
 const rows:Record<string,string>[]=[];
 for(let i=0;i<grid.length&&i<IMPORT_LIMIT_ROWS;i++){
  if(grid[i].length!==expected.length){issues.push({row:i+2,message:'Неправилен брой колони.'});continue;}
  const row=Object.fromEntries(expected.map((k,j)=>[k,grid[i][j].trim()]));
  validate(row,resource,i+2,issues);rows.push(row);
 }
 return{rows,headers,issues:issues.slice(0,30)};
}
export function csvEscape(value:unknown){
 const raw=String(value??'').replace(/\u0000/g,'');
 const safe=/^[\s\uFEFF]*[=+@-]/u.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
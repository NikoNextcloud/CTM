'use client';

import {useState,useTransition} from 'react';
import Link from 'next/link';
import {CSV_FORMATS,IMPORT_LIMIT_BYTES,parseCsv,isTransferResource,type TransferResource,type ImportIssue} from '@/lib/import-csv';
import {
 describeSheet,inspectWorkbook,mapWorkbookSheet,fieldLabels,type WorkbookSheet,type ColumnMap
} from '@/lib/workbook-mapping';
import {previewNonClinicalImport,executeNonClinicalImport} from '@/lib/transfer-actions';

const labels:Record<TransferResource,string>={
 companies:'Фирми',employees:'Служители',worksites:'Работни обекти',
 job_positions:'Длъжности',risk_assessments:'Проекти на оценка на риска'
};
const examples:Record<TransferResource,string>={
 companies:'ТЕСТ Пример ЕООД;000000001;Адрес;active',
 employees:'000000001;ТЕСТ Служител;Оператор;EX-001',
 worksites:'000000001;Административен офис;Адрес;true',
 job_positions:'000000001;Оператор;Звено;true',
 risk_assessments:'000000001;Офис;Ергономичен риск;low;Ергономични мерки;2026-10-15;'
};
type Preview={ok:boolean;rowCount:number;sha256:string;sample:Record<string,string>[];issues:ImportIssue[];message:string};
const xlsxLimit=2*1024*1024;

export function TransferManager({initialResource='companies'}:{initialResource?:TransferResource}){
 const [resource,setResource]=useState<TransferResource>(initialResource);
 const [raw,setRaw]=useState('');
 const [fileName,setFileName]=useState('');
 const [workbook,setWorkbook]=useState<WorkbookSheet[]|null>(null);
 const [sheetIndex,setSheetIndex]=useState(0);
 const [headerRow,setHeaderRow]=useState(0);
 const [columnMap,setColumnMap]=useState<ColumnMap>({});
 const [fixed,setFixed]=useState<Record<string,string>>({});
 const [rowCount,setRowCount]=useState<number|null>(null);
 const [localIssues,setLocalIssues]=useState<string[]>([]);
 const [excluded,setExcluded]=useState<string[]>([]);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [message,setMessage]=useState('');
 const [busy,start]=useTransition();
 const columns=CSV_FORMATS[resource];
 const template='\uFEFF'+columns.join(';')+'\r\n'+examples[resource]+'\r\n';
 const activeSheet=workbook?.[sheetIndex];
 const profile=activeSheet?describeSheet(activeSheet,sheetIndex,resource,headerRow):null;
 const summary=workbook?inspectWorkbook(workbook,resource):[];

 function reset(){
  setRaw('');setFileName('');setWorkbook(null);setSheetIndex(0);setHeaderRow(0);
  setColumnMap({});setFixed({});setRowCount(null);setLocalIssues([]);setExcluded([]);
  setPreview(null);setMessage('');
 }
 function change(value:string){
  if(!isTransferResource(value))return;
  reset();setResource(value);
 }
 function applyProfile(nextSheet:number,nextHeader?:number){
  if(!workbook||!workbook[nextSheet])return;
  const p=describeSheet(workbook[nextSheet],nextSheet,resource,nextHeader);
  setSheetIndex(nextSheet);setHeaderRow(p.headerRow);setColumnMap(p.mapping);setFixed({});
  setRaw('');setPreview(null);setRowCount(null);setLocalIssues([]);setExcluded([]);
  setMessage('');
 }
 async function choose(file?:File){
  reset();
  if(!file)return;
  const xlsx=file.name.toLowerCase().endsWith('.xlsx');
  if(!xlsx&&!file.name.toLowerCase().endsWith('.csv')){
   setMessage('Избери .xlsx или UTF-8 .csv.');return;
  }
  if(file.size>(xlsx?xlsxLimit:IMPORT_LIMIT_BYTES)){
   setMessage(xlsx?'XLSX файлът надвишава 2 MB.':'CSV файлът надвишава 128 KB.');return;
  }
  try{
   if(xlsx){
    const {default:readXlsxFile}=await import('read-excel-file/browser');
    const sheets=await readXlsxFile(file) as unknown as WorkbookSheet[];
    if(!sheets.length)throw new Error('Excel файлът няма работни листове.');
    const previews=inspectWorkbook(sheets,resource);
    const preferred=previews.reduce((best,p)=>p.recognized>previews[best].recognized?p.index:best,0);
    const p=previews[preferred];
    setWorkbook(sheets);setSheetIndex(preferred);setHeaderRow(p.headerRow);
    setColumnMap(p.mapping);setFileName(file.name);
    setMessage('Открити '+sheets.length+' листа. Избери правилния лист и съпостави полетата. Данните остават локално, докато не потвърдиш проверката.');
   }else{
    const text=await file.text();
    if(text.includes('\u0000')||text.includes('\uFFFD'))throw new Error('Невалидно UTF-8 кодиране.');
    setRaw(text);setFileName(file.name);
   }
  }catch(error){setMessage(error instanceof Error?error.message:'Файлът не може да бъде прочетен.');}
 }
 function invalidateMapping(){
  setRaw('');setPreview(null);setRowCount(null);setLocalIssues([]);setExcluded([]);
 }
 function prepare(){
  if(!activeSheet){setMessage('Първо избери Excel файл.');return;}
  const result=mapWorkbookSheet(activeSheet,resource,headerRow,columnMap,fixed);
  setRowCount(result.rowCount);setExcluded(result.excludedColumns);setPreview(null);
  if(result.issues.length){
   setRaw('');setLocalIssues(result.issues);setMessage('Провери съпоставянето. Няма изпратени записи.');return;
  }
  const validation=parseCsv(result.csv,resource);
  if(validation.issues.length){
   setRaw('');setLocalIssues(validation.issues.map(x=>'Ред '+x.row+': '+x.message));
   setMessage('Структурата е прочетена, но записите не преминават ограниченията на текущия сървърен импорт. Файлът не е изпращан.');
   return;
  }
  setRaw(result.csv);setLocalIssues([]);
  setMessage('Съпоставени са '+result.rowCount+' записа. Прегледай колоните извън импорта и направи проверка.');
 }
 function check(){
  setPreview(null);
  if(!raw){setMessage(workbook?'Първо съпостави и подготви записите.':'Избери CSV или XLSX файл.');return;}
  // Never transfer rejected data merely for error reporting.
  const local=parseCsv(raw,resource);
  if(local.issues.length){
   setLocalIssues(local.issues.map(x=>'Ред '+x.row+': '+x.message));
   setMessage('Локалната проверка отказа неподдържани стойности. Не е изпратен файл.');return;
  }
  setLocalIssues([]);setMessage('');
  start(async()=>{
   try{setPreview(await previewNonClinicalImport(resource,raw));}
   catch{setMessage('Сървърната проверка е отказана. Провери сесията и правата си.');}
  });
 }
 function confirm(){
  if(!preview?.ok||!preview.sha256)return;
  setMessage('');
  start(async()=>{
   try{
    const result=await executeNonClinicalImport(resource,raw,preview.sha256);
    setMessage(result.message);
    if(result.ok){setRaw('');setWorkbook(null);setFileName('');setRowCount(null);setPreview(null);}
   }catch{setMessage('Неуспешно потвърждение. Провери регистъра и одита преди повторен опит.');}
  });
 }
 const mappingReport=profile?JSON.stringify({
  file:fileName,sheet:profile.name,headerRow:headerRow+1,dataRows:rowCount??profile.dataRows,
  mapping:Object.fromEntries(columns.map(k=>[k,columnMap[k]>=0?profile.headers[columnMap[k]]:fixed[k]?'Постоянна стойност':'Без съответствие'])),
  ignoredColumns:excluded.length?excluded:profile.headers.filter((_,i)=>!Object.values(columnMap).includes(i)),
  warnings:localIssues.map(issue=>issue.replace(/\d{9,}/g,'[скрито]'))
 },null,2):'';

 return <div className="content">
  <div className="page-header"><div><p className="eyebrow">СТМ 2.0 · КОНТРОЛИРАН ОБМЕН</p>
   <h1>Импорт / Експорт</h1><p>CSV и Excel: избор на лист, съпоставяне на колони, проверка и потвърждение.</p></div>
   <span className="tag">Работна версия</span>
  </div>
  <div className="notice"><strong>Импорт на реални служители с ЕГН и медицински сведения:</strong> <Link className="company-link" href="/app/migration/personnel">Отвори защитения XLSX импорт →</Link><p>Тази страница остава за административен CSV/XLSX обмен. За служители от EMS-STM, ТЕЛК, личен лекар и архивни медицински бележки използвай специализирания архивен импорт с проверка и шифроване.</p></div>
  <section className="table-panel transfer-panel">
   <h2>Регистър и файлов формат</h2>
   <label>Регистър <select value={resource} onChange={e=>change(e.target.value)}>
    {(Object.keys(CSV_FORMATS) as TransferResource[]).map(k=><option key={k} value={k}>{labels[k]}</option>)}
   </select></label>
   <p className="subnote">Импорт на до 100 записа на пакет, Excel до 2 MB, CSV до 128 KB. Експорт на до 5000 разрешени записа.</p>
   <div className="transfer-actions">
    <a className="btn ghost" href={'data:text/csv;charset=utf-8,'+encodeURIComponent(template)}
     download={'ctm-'+resource+'-template.csv'}>↓ CSV шаблон</a>
    <a className="btn primary" href={'/api/export?resource='+encodeURIComponent(resource)}>↓ Експорт CSV</a>
   </div>
  </section>
  <section className="table-panel transfer-panel">
   <h2>Избери файл</h2>
   <label>CSV / XLSX<input type="file"
     accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
     onChange={e=>{void choose(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>
   {fileName&&<p className="subnote">Избран: {fileName}</p>}
   {activeSheet&&profile&&<>
    <h3>Съпоставяне на Excel</h3>
    <label>Работен лист <select value={sheetIndex} onChange={e=>applyProfile(Number(e.target.value))}>
     {summary.map(p=><option key={p.index} value={p.index}>{p.name} · {p.dataRows} реда · {p.recognized} разпознати полета</option>)}
    </select></label>
    <label>Ред със заглавия (номер от Excel)
     <input type="number" min={1} max={Math.min(activeSheet.data.length,200)}
      value={headerRow+1} onChange={e=>{
       const n=Number(e.target.value)-1;
       if(Number.isInteger(n)&&n>=0&&n<activeSheet.data.length)applyProfile(sheetIndex,n);
      }}/>
    </label>
    <p className="subnote">Открити {profile.headers.length} колони. Допълнителните колони не блокират анализа. Всяко поле може да се съпостави ръчно или да получи постоянна стойност.</p>
    <div className="transfer-map-grid">
     {columns.map(key=><div className="transfer-map-row" key={key}>
      <label>{fieldLabels[key]||key}
       <select aria-label={'Колона за '+key} value={columnMap[key]??-1} onChange={e=>{
        setColumnMap(prev=>({...prev,[key]:Number(e.target.value)}));invalidateMapping();
       }}>
        <option value={-1}>— Избери колона —</option>
        {profile.headers.map((h,i)=><option key={i} value={i}>{i+1}. {h}</option>)}
       </select>
      </label>
      <label>Или постоянна стойност
       <input aria-label={'Постоянна стойност за '+key} value={fixed[key]??''}
        onChange={e=>{setFixed(prev=>({...prev,[key]:e.target.value}));invalidateMapping();}}
        placeholder={key==='company_eik'?'ЕИК на разрешена фирма':''}/>
      </label>
     </div>)}
    </div>
    {profile.privateColumns.length>0&&<div className="notice warn">
      Открити лични/медицински колони (само имена на заглавия): {profile.privateColumns.join(', ')}.
      Стойностите им не се прехвърлят чрез административната функция.
    </div>}
    <div className="transfer-actions">
     <button className="btn primary" type="button" onClick={prepare}>1. Подготви съпоставянето</button>
     <a className="btn ghost"
      href={'data:application/json;charset=utf-8,'+encodeURIComponent(mappingReport)}
      download="ctm-import-mapping.json">↓ Отчет за колоните (без записи)</a>
    </div>
    {rowCount!==null&&<p className="subnote">Намерени {rowCount} записа под реда със заглавия.</p>}
    {excluded.length>0&&<p className="subnote">Колони извън този импорт: {excluded.join(', ')}. Нищо не е изтрито от оригиналния файл.</p>}
   </>}
   {localIssues.length>0&&<div className="notice warn" role="alert">
    <strong>Проверки, които изискват действие:</strong>
    {localIssues.slice(0,20).map((m,i)=><p key={i}>{m}</p>)}
    {localIssues.length>20&&<p>Има и още {localIssues.length-20} проверки.</p>}
   </div>}
   <div className="transfer-actions">
    <button className="btn ghost" type="button" onClick={check} disabled={busy}>
     {busy?'Проверка…':'2. Провери преди импорт'}
    </button>
   </div>
   {preview&&<div className="transfer-preview">
    <h3>Предварителен преглед: {preview.rowCount} реда</h3><p>{preview.message}</p>
    {preview.issues.length>0&&<div className="notice warn">{preview.issues.map((issue,i)=>
     <p key={i}>Ред {issue.row}: {issue.message}</p>)}</div>}
    {preview.ok&&<>
     <div className="table-wrap"><table><thead><tr>{columns.map(k=><th key={k}>{fieldLabels[k]||k}</th>)}</tr></thead>
      <tbody>{preview.sample.map((r,i)=><tr key={i}>{columns.map(k=><td key={k}>{r[k]}</td>)}</tr>)}</tbody>
     </table></div>
     <p className="subnote">Показани са първите 5 реда. Потвърждението ще запише целия разрешен пакет в една транзакция.</p>
     <button className="btn primary" type="button" disabled={busy} onClick={confirm}>
      {busy?'Записване…':'3. Потвърди '+preview.rowCount+' записа'}
     </button>
    </>}
   </div>}
   {message&&<div role="status" className="notice warn">{message}</div>}
  </section>
  <section className="table-panel transfer-panel">
   <h2>Преминаване към архивна миграция</h2>
   <p>Медицинските архиви изискват отделен защитен канал, проверка на източника и права на достъп. Този екран вече може да направи локална структурна проверка на многолистови Excel файлове.</p>
   <Link className="btn ghost" href="/app/migration">Отвори регистъра за миграция →</Link>
  </section>
 </div>;
}

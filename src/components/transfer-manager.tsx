'use client';

import {useState,useTransition} from 'react';
import {CSV_FORMATS,IMPORT_LIMIT_BYTES,isTransferResource,type TransferResource,type ImportIssue} from '@/lib/import-csv';
import {previewNonClinicalImport,executeNonClinicalImport} from '@/lib/transfer-actions';

const labels:Record<TransferResource,string>={
 companies:'Фирми',employees:'Служители',worksites:'Работни обекти',
 job_positions:'Длъжности',risk_assessments:'Проекти на оценка на риска'
};
const example:Record<TransferResource,string>={
 companies:'ТЕСТ Пример ЕООД;000000001;Тестов адрес;active',
 employees:'000000001;ТЕСТ Служител;Оператор;DEMO-001',
 worksites:'000000001;Тестов офис;Тестов адрес;true',
 job_positions:'000000001;Тестова длъжност;Примерно звено;true',
 risk_assessments:'000000001;Тестов офис;Тестова опасност;low;Тестови мерки;2026-10-15;'
};
type Preview={ok:boolean;rowCount:number;sha256:string;sample:Record<string,string>[];issues:ImportIssue[];message:string};
export function TransferManager({initialResource='companies'}:{initialResource?:TransferResource}){
 const [resource,setResource]=useState<TransferResource>(initialResource);
 const [raw,setRaw]=useState('');
 const [fileName,setFileName]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null);
 const [message,setMessage]=useState('');
 const [busy,start]=useTransition();
 const cols=CSV_FORMATS[resource];
 const template='\uFEFF'+cols.join(';')+'\r\n'+example[resource]+'\r\n';
 function change(resourceName:string){
  if(!isTransferResource(resourceName))return;
  setResource(resourceName);setRaw('');setPreview(null);setMessage('');setFileName('');
 }
 async function choose(file?:File){
  setRaw('');setPreview(null);setMessage('');setFileName('');
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.csv')){setMessage('Приема се само .csv UTF-8. Excel и архиви НЕ се качват.');return;}
  if(file.size>IMPORT_LIMIT_BYTES){setMessage('Лимитът е 128 KB.');return;}
  try{
   const text=await file.text();
   if(text.includes('\u0000')||text.includes('\uFFFD'))throw new Error('Not UTF8');
   setRaw(text);setFileName(file.name);
  }catch{setMessage('Файлът не е валиден UTF-8 CSV.');}
 }
 function check(){
  setPreview(null);setMessage('');
  start(async()=>{try{setPreview(await previewNonClinicalImport(resource,raw));}
   catch{setMessage('Проверката е отказана. Проверете акаунта и връзката.');}});
 }
 function confirm(){
  if(!preview?.ok||!preview.sha256)return;
  const hash=preview.sha256;
  setMessage('');
  start(async()=>{
   try{const result=await executeNonClinicalImport(resource,raw,hash);
    setMessage(result.message);
    if(result.ok){setRaw('');setFileName('');setPreview(null);}
   }catch{setMessage('Импортът не беше потвърден; провери историята, преди да повториш.');}
  });
 }
 return <div className="content">
  <div className="page-header"><div><p className="eyebrow">СТМ 2.0 · КОНТРОЛИРАН ОБМЕН НА ДАННИ</p>
   <h1>Импорт / Експорт</h1><p>CSV проверка, тестови шаблони и изтегляне на разрешени служебни записи.</p></div>
   <span className="tag">Тестова версия</span>
  </div>
  <div className="notice warn"><strong>Не импортирай реални имена, ЕГН, ТЕЛК, диагнози, адреси на хора или медицински архиви.</strong> Отделният Excel с персонал се преглежда офлайн; суровите му записи не се изпращат чрез тази функция. Импортът приема само синтетични TEST/ТЕСТ фирми и служители и тестови ЕИК кодове 000000XXX.</div>
  <section className="table-panel transfer-panel">
   <h2>Избери регистър</h2>
   <label>Регистър <select value={resource} onChange={e=>change(e.target.value)}>
     {(Object.keys(CSV_FORMATS) as TransferResource[]).map(k=><option key={k} value={k}>{labels[k]}</option>)}
   </select></label>
   <p className="subnote">Формат: UTF-8 CSV, точно определени колони. За импорт: до 100 реда и 128 KB. За експорт: до 5000 записа.</p>
   <div className="transfer-actions">
    <a className="btn ghost" href={'data:text/csv;charset=utf-8,'+encodeURIComponent(template)}
     download={'ctm-'+resource+'-TEST-template.csv'}>↓ Изтегли CSV шаблон</a>
    <a className="btn primary" href={'/api/export?resource='+encodeURIComponent(resource)}>
     ↓ Експорт CSV</a>
   </div>
  </section>
  <section className="table-panel transfer-panel">
   <h2>Импорт на тестови CSV записи</h2>
   <p className="subnote">Очаквани колони: <code>{cols.join('; ')}</code></p>
   <label>Избери CSV<input type="file" accept=".csv,text/csv" disabled={busy}
    onChange={e=>{void choose(e.target.files?.[0]);}}/></label>
   {fileName&&<p className="subnote">Избран файл: {fileName}</p>}
   <button className="btn ghost" type="button" disabled={busy||!raw} onClick={check}>
    {busy?'Проверка…':'1. Провери преди импорт'}
   </button>
   {preview&&<div className="transfer-preview">
    <h3>Предварителен преглед: {preview.rowCount} реда</h3><p>{preview.message}</p>
    {preview.issues.length>0&&<div className="notice warn">{preview.issues.map((issue,i)=>
     <p key={i}>Ред {issue.row}: {issue.message}</p>)}</div>}
    {preview.ok&&<><div className="table-wrap"><table><thead><tr>
      {cols.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>
      {preview.sample.map((r,i)=><tr key={i}>{cols.map(k=><td key={k}>{r[k]}</td>)}</tr>)}
    </tbody></table></div>
    <p className="subnote">Показани са първите 5 реда. Следващото действие записва целия валидиран тестов пакет атомарно.</p>
    <button className="btn primary" type="button" disabled={busy} onClick={confirm}>
     {busy?'Записване…':'2. Потвърди импорт на '+preview.rowCount+' тестови реда'}
    </button></>}
   </div>}
   {message&&<div role="status" className="notice warn">{message}</div>}
  </section>
  <section className="table-panel transfer-panel">
   <h2>Импорт на Excel и медицински архиви</h2>
   <p>Тази възможност ще се активира след проверка на правата за медицински данни, защитеното съхранение и съпоставянето на записите. Засега файлът остава само в защитен локален работен процес.</p>
   <button className="btn ghost" type="button" disabled>Импорт XLSX / медицински архив — предстои одит</button>
  </section>
 </div>;
}
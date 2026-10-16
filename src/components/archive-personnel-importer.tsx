'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import type {WorkbookSheet} from '@/lib/workbook-mapping';
import {
 archiveFields,archiveMapping,archiveSourceCompany,chooseArchiveHeader,
 prepareArchivePersonnel,type ArchiveMapping,type ArchiveRow
} from '@/lib/archive-workbook';
import {importConfidentialArchiveBatch,verifyArchiveSource} from '@/lib/archive-import-actions';

const maxBytes=4*1024*1024;
const batchSize=100;
type Prepared={rows:ArchiveRow[];warnings:string[];issues:string[];
 missingWorkNumbers:number;missingEGNs:number;duplicateCandidatePairs:number};

export function ArchivePersonnelImporter(){
 const router=useRouter();
 const [sheets,setSheets]=useState<WorkbookSheet[]|null>(null);
 const [fileName,setFileName]=useState('');
 const [source,setSource]=useState('');
 const [sheetIndex,setSheetIndex]=useState(0);
 const [headerRow,setHeaderRow]=useState(0);
 const [mapping,setMapping]=useState<ArchiveMapping|null>(null);
 const [company,setCompany]=useState('');
 const [prepared,setPrepared]=useState<Prepared|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState('');
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const sheet=sheets?.[sheetIndex];
 const fields=sheet?.data[headerRow]||[];
 const width=Math.min(50,Math.max(fields.length,...(sheet?.data.slice(headerRow+1,headerRow+4)||[]).map(r=>r.length),0));

 function invalidate(){
  setPrepared(null);setConfirmed(false);setProgress('');setError('');setSuccess('');
 }
 function selectSheet(nextIndex:number,nextHeader?:number,list=sheets){
  const selected=list?.[nextIndex];
  if(!selected)return;
  const header=nextHeader??chooseArchiveHeader(selected);
  setSheetIndex(nextIndex);setHeaderRow(header);setMapping(archiveMapping(selected.data[header]||[]));
  setCompany(archiveSourceCompany(selected));invalidate();
 }
 async function chooseFile(file?:File){
  setSheets(null);setFileName('');setSource('');setMapping(null);invalidate();
  if(!file)return;
  if(!/\.xlsx$/i.test(file.name)){
   setError('Избери Excel файл .xlsx.');return;
  }
  if(file.size>maxBytes||file.size<100){
   setError('Размерът на Excel трябва да е между 100 байта и 4 MB.');return;
  }
  setBusy(true);
  try{
   const [{default:readXlsxFile},bytes]=await Promise.all([
    import('read-excel-file/browser'),file.arrayBuffer()
   ]);
   const parsed=(await readXlsxFile(file)) as unknown as WorkbookSheet[];
   if(!parsed.length||parsed.some(x=>!Array.isArray(x.data))){
    throw new Error('Файлът не съдържа разпознаваеми Excel листове.');
   }
   if(!globalThis.crypto?.subtle)throw new Error('Браузърът не поддържа защитен SHA-256.');
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
   const preferred=parsed.reduce((best,x,i)=>{
    const index=chooseArchiveHeader(x);
    const score=(Object.values(archiveMapping(x.data[index]||[])).filter(v=>v>=0).length);
    const prior=chooseArchiveHeader(parsed[best]);
    const bestScore=Object.values(archiveMapping(parsed[best].data[prior]||[])).filter(v=>v>=0).length;
    return score>bestScore?i:best;
   },0);
   setSheets(parsed);setFileName(file.name.slice(0,120));setSource('UPLOAD_'+hash);
   selectSheet(preferred,undefined,parsed);
  }catch(e){
   setError(e instanceof Error?e.message:'Файлът не може да бъде прочетен.');
  }finally{setBusy(false)}
 }
 function preview(){
  invalidate();
  if(!sheet||!mapping||!source)return;
  const checked=prepareArchivePersonnel(sheet,sheetIndex,headerRow,mapping,company,fileName);
  setPrepared(checked);
  if(checked.issues.length)setError('Съпоставянето трябва да се коригира, преди запис.');
 }
 async function importRecords(){
  if(!prepared||!prepared.rows.length||prepared.issues.length||!confirmed||busy||!source)return;
  setBusy(true);setError('');setSuccess('');
  let processed=0,inserted=0,existing=0;
  try{
   for(let start=0;start<prepared.rows.length;start+=batchSize){
    const current=prepared.rows.slice(start,start+batchSize);
    const result=await importConfidentialArchiveBatch({
     source,kind:'employee_sample',rows:current
    });
    if(!result.ok)throw new Error(result.message);
    inserted+=result.inserted;existing+=result.existing;processed+=current.length;
    setProgress('Проверени '+processed+' от '+prepared.rows.length+
     ' реда; нови '+inserted+', вече внесени '+existing+'.');
   }
   const verified=await verifyArchiveSource(source,'employee_sample');
   if(!verified.ok||verified.count!==prepared.rows.length){
    throw new Error('След записа има '+verified.count+' реда в базата вместо '+
     prepared.rows.length+'. Провери архива преди повторение.');
   }
   setSuccess('Успешен защитен импорт: '+verified.count+
    ' архивни служители са налични за преглед. Нови: '+inserted+
    ', съществуващи: '+existing+'. Статусът им остава непотвърден.');
   router.refresh();
  }catch(e){
   setError((e instanceof Error?e.message:'Неуспешен импорт')+
    ' При прекъсване повтори със същия оригинален файл: системата не дублира записаните редове.');
  }finally{setBusy(false)}
 }
 return <section className="table-panel transfer-panel">
  <div className="ctm-import-steps" aria-label="Стъпки за импорт">
   <span className="ctm-import-step"><b>1</b> Избери Excel</span>
   <span className="ctm-import-step"><b>2</b> Провери данните</span>
   <span className="ctm-import-step"><b>3</b> Запиши и прегледай</span>
  </div>
  <h2>Импортирай служители от Excel</h2>
  <p>Служебните, личните и медицинските колони се съхраняват заедно с произхода
   си в <strong>шифрования архив</strong>. Нищо не се изпраща към публичен GitHub
   или към регистъра на потвърдените служители без допълнително сверяване.</p>
  <label>1. Избери Excel файл (.xlsx)
   <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    disabled={busy} onChange={e=>{void chooseFile(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>
  </label>
  {sheet&&mapping&&<>
   <p className="subnote">Файл: {fileName} · {sheets?.length||0} листа.
    Открит ред със заглавия: {headerRow+1}.</p>
   <label>Работен лист
    <select value={sheetIndex} disabled={busy}
     onChange={e=>selectSheet(Number(e.target.value))}>
     {sheets?.map((x,i)=><option key={i} value={i}>{x.sheet} · {x.data.length} реда</option>)}
    </select>
   </label>
   <label>Фирма от оригиналния източник (използва се, ако няма фирмена колона)
    <input value={company} disabled={busy} maxLength={200}
     placeholder="Наименование на фирма според оригиналния Excel"
     onChange={e=>{setCompany(e.target.value);invalidate()}}/>
   </label>
   <details className="ctm-advanced-mapping">
    <summary>Промени автоматично разпознатите колони (само ако е необходимо)</summary>
    <p className="subnote">По подразбиране полетата са съпоставени автоматично. При грешка отвори този раздел.</p>
   <label>Ред със заглавия в Excel
    <input type="number" min={1} max={Math.min(100,sheet.data.length)}
     value={headerRow+1} disabled={busy} onChange={e=>{
      const index=Number(e.target.value)-1;
      if(Number.isInteger(index)&&index>=0&&index<sheet.data.length)
       selectSheet(sheetIndex,index);
     }}/>
   </label>
   <h3>Съпоставяне на колони</h3>
   <p className="subnote">Можеш да промениш всяка колона. ЕГН, ТЕЛК, личен лекар,
    диагнози и бележки се запазват, а не се изхвърлят.</p>
   <div className="transfer-map-grid">
    {archiveFields.map(f=><div className="transfer-map-row" key={f.key}>
     <label>{f.label}<select value={mapping[f.key]} disabled={busy}
      onChange={e=>{setMapping({...mapping,[f.key]:Number(e.target.value)});invalidate()}}>
      <option value={-1}>{f.key==='company'?'Фирма от полето по-горе':'Няма колона'}</option>
      {Array.from({length:width},(_,i)=><option value={i} key={i}>
       {i+1}. {String(fields[i]??'').trim()||'Колона '+(i+1)}
      </option>)}
     </select></label>
    </div>)}
   </div>
   </details>
   <button className="btn primary" type="button" onClick={preview} disabled={busy}>
    2. Провери разпознатите данни
   </button>
  </>}
  {prepared&&<>
   <div className="notice">
    <strong>2. Проверени редове: {prepared.rows.length}</strong>
    <p>Без работен номер: {prepared.missingWorkNumbers}.
     Без ЕГН: {prepared.missingEGNs}.
     Възможни повтарящи се лица: {prepared.duplicateCandidatePairs}.</p>
   </div>
   {prepared.issues.length>0&&<div className="notice warn" role="alert">
    <strong>Изискват корекция:</strong>
    <ul>{prepared.issues.slice(0,12).map((m,i)=><li key={i}>{m}</li>)}</ul>
   </div>}
   {prepared.warnings.length>0&&<details className="add-panel">
    <summary>Проверки и предупреждения ({prepared.warnings.length})</summary>
    <ul>{prepared.warnings.slice(0,18).map((m,i)=><li key={i}>{m}</li>)}</ul>
   </details>}
   {prepared.issues.length===0&&<>
    <div className="table-wrap"><table>
     <thead><tr><th>Ред в Excel</th><th>Име</th><th>Фирма от източника</th><th>ЕГН</th><th>ТЕЛК</th></tr></thead>
     <tbody>{prepared.rows.slice(0,8).map(r=><tr key={r.source_key}>
      <td>{r.row_index}</td><td>{r.data['Име Презиме Фамилия']}</td>
      <td>{r.data['Фирма']}</td>
      <td>{r.data['ЕГН']?'Налично (скрито)':'Липсва'}</td>
      <td>{r.data['ТЕЛК']?'Налично (скрито)':'Няма стойност'}</td>
     </tr>)}</tbody>
    </table></div>
    <label className="checkbox-line">
     <input type="checkbox" checked={confirmed} disabled={busy}
      onChange={e=>setConfirmed(e.target.checked)}/>
     Потвърждавам, че това е правилният източник и разбирам, че записи
     с непроверена фирма или идентичност остават в архивния списък за сверяване.
    </label>
    <button type="button" className="btn primary" disabled={!confirmed||busy}
     onClick={()=>{void importRecords()}}>
     {busy?'Записване на архива…':'3. Запиши '+prepared.rows.length+' архивни служители'}
    </button>
   </>}
  </>}
  {progress&&<p role="status" className="subnote">{progress}</p>}
  {error&&<div role="alert" className="notice warn">{error}</div>}
  {success&&<div role="status" className="team-status-ok">{success}
   <p><Link className="btn ghost" href="/app/migration/archive?kind=employee_sample">
    Виж архивните служители →</Link></p>
  </div>}
 </section>;
}

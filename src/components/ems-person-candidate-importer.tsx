'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {WorkbookSheet} from '@/lib/workbook-mapping';
import {prepareEmsPersonCandidates,type EmsPersonPreparation} from '@/lib/ems-person-workbook';
import {importConfidentialArchiveBatch,verifyArchiveSource} from '@/lib/archive-import-actions';

export function EmsPersonCandidateImporter(){
 const router=useRouter();
 const [name,setName]=useState('');
 const [source,setSource]=useState('');
 const [sheets,setSheets]=useState<WorkbookSheet[]|null>(null);
 const [index,setIndex]=useState(0);
 const [prepared,setPrepared]=useState<EmsPersonPreparation|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [error,setError]=useState('');
 const sheet=sheets?.[index];
 async function choose(file?:File){
  setName('');setSource('');setSheets(null);setPrepared(null);setConfirmed(false);setStatus('');setError('');
  if(!file)return;
  if(!/\.xlsx$/i.test(file.name)||file.size>4*1024*1024||file.size<100){setError('Избери оригиналния XLSX до 4 MB.');return;}
  setBusy(true);
  try{
   const [{default:reader},bytes]=await Promise.all([import('read-excel-file/browser'),file.arrayBuffer()]);
   const parsed=(await reader(file)) as unknown as WorkbookSheet[];
   if(!Array.isArray(parsed)||!parsed.length)throw Error('Неразпознат формат.');
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
   const primary=parsed.findIndex(x=>x.sheet.includes('ЛИЦА 1013'));
   setName(file.name.slice(0,120));setSource('UPLOAD_'+hash);setSheets(parsed);setIndex(primary<0?0:primary);
  }catch{setError('Файлът не може да се прочете безопасно.');}finally{setBusy(false);}
 }
 function preview(){
  if(!sheet)return;
  setPrepared(prepareEmsPersonCandidates(sheet));setConfirmed(false);setError('');
 }
 async function importRows(){
  if(!source||!prepared||prepared.issues.length||!prepared.rows.length||!confirmed||busy)return;
  setBusy(true);setError('');setStatus('');
  let added=0,existing=0;
  try{
   for(let start=0;start<prepared.rows.length;start+=100){
    const result=await importConfidentialArchiveBatch({
     source,kind:'person_candidate',rows:prepared.rows.slice(start,start+100)
    });
    if(!result.ok)throw Error(result.message);
    added+=result.inserted;existing+=result.existing;
    setStatus('Проверени '+Math.min(start+100,prepared.rows.length)+' от '+prepared.rows.length+' реда.');
   }
   const status=await verifyArchiveSource(source,'person_candidate');
   if(!status.ok||status.count!==prepared.rows.length)throw Error('Несъответствие в контролната бройка на Supabase.');
   setStatus('Записани '+status.count+' архивни кандидата. Нови '+added+'; съществуващи '+existing+'. Няма активирани служители.');
   router.refresh();
  }catch(e){
   setError((e instanceof Error?e.message:'Неуспешен импорт')+' Повтори със същия файл; внесените редове няма да се дублират.');
  }finally{setBusy(false);}
 }
 return <section className="table-panel transfer-panel">
  <div className="ctm-import-steps">
   <span className="ctm-import-step"><b>1</b> Избери файл</span>
   <span className="ctm-import-step"><b>2</b> Провери информацията</span>
   <span className="ctm-import-step"><b>3</b> Импортирай и виж резултата</span>
  </div>
  <h2>EMS-STM · аналитични кандидати за лица</h2>
  <p>Импорт на справката „ЛИЦА 1013“. Полетата се пазят в шифрован архив.
   Непотвърдените имена, ЕГН и работодатели <strong>не стават активни служители</strong>.</p>
  <label>Избери XLSX файл
   <input type="file" accept=".xlsx" disabled={busy}
    onChange={e=>{void choose(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>
  </label>
  {sheets&&<><p className="subnote">Източник: {name}</p>
   <label>Работен лист
    <select disabled={busy} value={index} onChange={e=>{setIndex(Number(e.target.value));setPrepared(null);setConfirmed(false);}}>
     {sheets.map((s,i)=><option key={i} value={i}>{s.sheet}</option>)}
    </select>
   </label>
   <button className="btn primary" type="button" disabled={busy} onClick={preview}>2. Провери информацията</button>
  </>}
  {prepared&&<>
   <div className="notice"><strong>{prepared.rows.length} архивни кандидата</strong>
    <p>За проверка на ЕГН: {prepared.reportedEgnReview}.
    Непотвърдени имена: {prepared.unconfirmedNames}.
    Отбелязани дубликати на ЕГН: {prepared.flaggedDuplicates}.</p>
   </div>
   {prepared.issues.length>0&&<div className="notice warn" role="alert">{prepared.issues.slice(0,12).join(' · ')}</div>}
   {prepared.warnings.length>0&&<details><summary>Предупреждения ({prepared.warnings.length})</summary>
    <p>{prepared.warnings.slice(0,15).join(' · ')}</p></details>}
   {!prepared.issues.length&&<>
    <div className="table-wrap"><table><thead><tr><th>Ред</th><th>Име от източника</th><th>ЕГН</th><th>Статус</th></tr></thead><tbody>
    {prepared.rows.slice(0,8).map(r=><tr key={r.source_key}><td>{r.row_index}</td>
     <td>{r.data['Име - основно']||'Неустановено'}</td><td>{r.data['ЕГН']?'Скрито · налично':'Липсва'}</td>
     <td>{r.data['Статус на името']}</td></tr>)}
    </tbody></table></div>
    <label className="checkbox-line"><input type="checkbox" checked={confirmed} disabled={busy}
     onChange={e=>setConfirmed(e.target.checked)}/>
     Проверих изходния файл и разбирам, че това са само кандидати, изискващи сверяване.</label>
    <button type="button" className="btn primary" disabled={!confirmed||busy} onClick={()=>{void importRows();}}>
     {busy?'Записване…':'3. Импортирай и провери резултата'}</button>
   </>}
  </>}
  {status&&<p className="team-status-ok" role="status">{status}</p>}
  {error&&<div className="notice warn" role="alert">{error}</div>}
 </section>;
}

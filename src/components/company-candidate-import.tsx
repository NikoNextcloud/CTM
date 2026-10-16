'use client';

import {useState,useTransition} from 'react';
import {
 inspectWorkbook,describeSheet,isPrivateColumn,type WorkbookSheet
} from '@/lib/workbook-mapping';
import {stageCompanyNames} from '@/lib/company-source-actions';

const maxFileBytes=2*1024*1024;
const maxNames=100;
export function CompanyCandidateImport(){
 const [sheets,setSheets]=useState<WorkbookSheet[]|null>(null);
 const [fileName,setFileName]=useState('');
 const [sheetIndex,setSheetIndex]=useState(0);
 const [headerRow,setHeaderRow]=useState(0);
 const [nameColumn,setNameColumn]=useState(-1);
 const [names,setNames]=useState<string[]|null>(null);
 const [accepted,setAccepted]=useState(false);
 const [error,setError]=useState('');
 const [done,setDone]=useState('');
 const [busy,start]=useTransition();
 const workbook=sheets?.[sheetIndex];
 const profile=workbook?describeSheet(workbook,sheetIndex,'companies',headerRow):null;

 function reset(){
  setSheets(null);setFileName('');setSheetIndex(0);setHeaderRow(0);setNameColumn(-1);
  setNames(null);setAccepted(false);setError('');setDone('');
 }
 async function choose(file?:File){
  reset();if(!file)return;
  if(!file.name.toLowerCase().endsWith('.xlsx')){
   setError('Избери Excel .xlsx файл. За CSV използвай административния импорт.');return;
  }
  if(file.size>maxFileBytes){setError('Лимитът за XLSX е 2 MB.');return;}
  try{
   const {default:readXlsxFile}=await import('read-excel-file/browser');
   const all=await readXlsxFile(file) as unknown as WorkbookSheet[];
   if(!all.length)throw new Error('Не са открити работни листове.');
   const options=inspectWorkbook(all,'companies');
   const recommended=options.reduce((best,p)=>
    p.recognized>options[best].recognized?p.index:best,0);
   const selected=options[recommended];
   setSheets(all);setFileName(file.name.slice(0,120));
   setSheetIndex(recommended);setHeaderRow(selected.headerRow);
   setNameColumn(selected.mapping.name>=0?selected.mapping.name:-1);
  }catch(e){setError(e instanceof Error?e.message:'Неуспешно прочитане на Excel.');}
 }
 function updateSheet(index:number,row?:number){
  if(!sheets?.[index])return;
  const chosen=describeSheet(sheets[index],index,'companies',row);
  setSheetIndex(index);setHeaderRow(chosen.headerRow);
  setNameColumn(chosen.mapping.name>=0?chosen.mapping.name:-1);
  setNames(null);setAccepted(false);setError('');setDone('');
 }
 function preview(){
  setNames(null);setDone('');
  if(!workbook||!profile){setError('Няма избран файл.');return;}
  if(nameColumn<0||nameColumn>=profile.headers.length){
   setError('Избери колона за фирменото наименование.');return;
  }
  if(isPrivateColumn(profile.headers[nameColumn],'companies')||/(служител|трите имена|име презиме|employee|full.?name|person)/iu.test(profile.headers[nameColumn])){
   setError('Избраната колона е медицинска или лична, не е фирмено наименование.');return;
  }
  const selected=workbook.data.slice(headerRow+1).filter(row=>
   row.some(value=>String(value??'').trim()));
  if(selected.length===0){setError('Няма записи под заглавния ред.');return;}
  if(selected.length>maxNames){
   setError('Файлът има '+selected.length+' записа. Раздели източника на пакети до '+maxNames+
    ', без да пропускаш редове. Нищо не е изпратено.');return;
  }
  const values=selected.map(row=>String(row[nameColumn]??'').trim());
  if(values.some(v=>v.length<2||v.length>200||/[\u0000-\u001f]/u.test(v))){
   setError('Някои редове имат празни/невалидни фирмени наименования. Не е изпратен пакет.');return;
  }
  setNames(values);setError('');setAccepted(false);
 }
 function submit(){
  if(!names||!names.length||!accepted)return;
  setError('');setDone('');
  start(async()=>{
   try{
    const result=await stageCompanyNames({source_label:'xlsx:'+fileName,source_header:profile?.headers[nameColumn]||'',names});
    if(!result.ok)setError(result.message);
    else{setDone(result.message);setNames(null);setAccepted(false);}
   }catch{setError('Сървърната операция не е завършена. Провери staging списъка преди нов опит.');}
  });
 }
 return <section className="table-panel transfer-panel">
  <h2>Добави фирмени наименования от XLSX</h2>
  <p>Използвай този вход само за <strong>имена на юридически лица</strong>.
   Excel се чете в браузъра; до базата достигат единствено избраните фирмени наименования
   и обозначението на файла. Останалите колони, включително ЕГН и медицински сведения,
   не се изпращат. Новите кандидати остават <strong>непотвърдени</strong>.</p>
  <label>Excel файл<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   onChange={e=>{void choose(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>
  {sheets&&profile&&<>
   <p className="subnote">Файл: {fileName} · {sheets.length} листа</p>
   <label>Работен лист<select value={sheetIndex} onChange={e=>updateSheet(Number(e.target.value))}>
    {inspectWorkbook(sheets,'companies').map(p=><option key={p.index} value={p.index}>
     {p.name} ({p.dataRows} реда)
    </option>)}
   </select></label>
   <label>Ред със заглавия<input type="number" min={1}
    max={Math.min(workbook!.data.length,200)} value={headerRow+1}
    onChange={e=>{const n=Number(e.target.value)-1;
     if(Number.isInteger(n)&&n>=0&&n<workbook!.data.length)updateSheet(sheetIndex,n);
    }}/></label>
   <label>Колона с фирмени наименования
    <select value={nameColumn} onChange={e=>{setNameColumn(Number(e.target.value));
     setNames(null);setAccepted(false);setDone('');setError('');
    }}>
     <option value={-1}>Избери колоната</option>
     {profile.headers.map((h,i)=><option value={i} key={i}>{i+1}. {h}</option>)}
    </select></label>
   <button className="btn ghost" type="button" onClick={preview}>1. Покажи предварителен преглед</button>
  </>}
  {names&&<>
   <p className="subnote">Разпознати {names.length} реда, {new Set(names.map(n=>n.toLocaleLowerCase('bg-BG'))).size} различни изписвания в този файл.</p>
   <div className="table-wrap"><table>
    <thead><tr><th>Първи записи</th><th>Фирмено наименование</th></tr></thead>
    <tbody>{names.slice(0,10).map((n,i)=><tr key={i}><td>{i+1}</td><td>{n}</td></tr>)}</tbody>
   </table></div>
   <label className="checkbox-line"><input type="checkbox" checked={accepted}
    onChange={e=>setAccepted(e.target.checked)}/>
    Потвърждавам, че избраната колона съдържа само фирмени наименования, не служители,
    ЕГН, ТЕЛК, диагнози или друга медицинска информация.
   </label>
   <button className="btn primary" type="button" disabled={busy||!accepted} onClick={submit}>
    {busy?'Записване…':'2. Запиши '+names.length+' кандидата (без активиране)'}
   </button>
  </>}
  {error&&<div role="alert" className="notice warn">{error}</div>}
  {done&&<div role="status" className="team-status-ok">{done}</div>}
 </section>;
}

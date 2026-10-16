'use client';

import {useActionState,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {editArchiveEmployee,type ArchiveEditState} from '@/lib/archive-employee-edit-actions';

const immutable=new Set(['Източник','Изходен лист','Ред в Excel']);
const clinical=/(ЕГН|ТЕЛК|Диагноза|Личен лекар|Медицински бележки)/iu;
const longText=/(Диагноза|бележки|Допълнителни данни|Адрес)/iu;

export function ArchiveEmployeeEditor({
 archiveId,data,revision
}:{archiveId:string;data:Record<string,unknown>;revision:number}){
 const router=useRouter();
 const [editing,setEditing]=useState(false);
 const [state,action,busy]=useActionState(editArchiveEmployee,{
  ok:false,message:'',revision
 } satisfies ArchiveEditState);
 useEffect(()=>{
  if(state.ok){router.refresh();}
 },[state.ok,state.revision,router]);
 const fields=Object.entries(data).filter(([key])=>!immutable.has(key));
 return <section id="archive-edit" className="ctm-action-card ctm-archive-editor">
  <div className="ctm-action-header">
   <div>
    <p className="eyebrow">РЕДАКЦИЯ · ЗАЩИТЕН АРХИВ</p>
    <h2>Редактиране на служител</h2>
    <p>Можеш да коригираш име, фирма, длъжност, ЕГН, ТЕЛК и другите полета.
     Всяко запазване създава нова шифрована версия. Оригиналният файл не се презаписва.</p>
   </div>
   <button className={editing?'btn ghost':'btn primary'} type="button"
    onClick={()=>setEditing(v=>!v)} aria-expanded={editing}>
    {editing?'Затвори редакцията':'✎ Редактирай данните'}
   </button>
  </div>
  {editing&&<form action={action} className="ctm-archive-edit-form">
   <input type="hidden" name="archive_id" value={archiveId}/>
   <input type="hidden" name="revision" value={revision}/>
   <div className="ctm-archive-edit-grid">
    {fields.map(([key,value])=><label key={key} className={longText.test(key)?'ctm-archive-field-wide':''}>
     {key}
     {longText.test(key)?
      <textarea name={'field:'+key} defaultValue={String(value??'')}
       key={revision+'-'+key} maxLength={10000} rows={3}/>:
      <input name={'field:'+key} type="text" defaultValue={String(value??'')}
       key={revision+'-'+key} maxLength={10000} autoComplete="off"/>}
     {clinical.test(key)&&<small>Поверително поле · достъп само за администратор</small>}
    </label>)}
   </div>
   <div className="ctm-edit-provenance">Непроменяеми данни за произхода: {Object.entries(data)
    .filter(([k])=>immutable.has(k)).map(([k,v])=>k+': '+String(v??'')).join(' · ')}</div>
   <label className="checkbox-line"><input type="checkbox" name="confirmed" value="yes" required/>
    Проверих променените стойности. Разбирам, че историята и първоначалният архив се запазват.</label>
   <div className="ctm-edit-actions">
    <button type="submit" className="btn primary" disabled={busy}>
     {busy?'Записване…':'Запази редакцията'}</button>
    <button type="button" className="btn ghost" disabled={busy}
     onClick={()=>setEditing(false)}>Откажи</button>
   </div>
  </form>}
  {state.message&&<p role="status" className={state.ok?'team-status-ok':'team-status-error'}>
   {state.message}</p>}
 </section>;
}

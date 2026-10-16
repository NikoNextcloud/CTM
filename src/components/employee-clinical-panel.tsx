'use client';

import {useActionState,useState} from 'react';
import {saveEmployeeClinical,type ClinicalSaveState} from '@/lib/clinical-actions';

export type ClinicalRecord={
 egn?:string;telk?:string;diagnosis?:string;notes?:string;
 revision?:number;has_record?:boolean;updated_at?:string;
};

export function EmployeeClinicalPanel({employeeId,record}:{
 employeeId:string;record:ClinicalRecord;
}){
 const [showEgn,setShowEgn]=useState(false);
 const initial:ClinicalSaveState={ok:false,message:'',revision:record.revision||0};
 const [result,save,pending]=useActionState(saveEmployeeClinical,initial);
 return <section className="table-panel">
  <div className="section-heading">
   <div>
    <p className="eyebrow">ПОВЕРИТЕЛНА ИНФОРМАЦИЯ · АДМИНИСТРАТОР / ЛЕКАР</p>
    <h2>ЕГН и медицински сведения</h2>
    <p>Попълни или редактирай данните за този служител. Записът е шифрован,
     а достъпът и промените се отразяват в одитния журнал.</p>
   </div>
  </div>
  <form action={save} className="company-form">
   <input type="hidden" name="employee_id" value={employeeId}/>
   <input type="hidden" name="revision" value={result.revision??record.revision??0} readOnly/>
   <label>ЕГН
    <input name="egn" type={showEgn?'text':'password'}
     inputMode="numeric" pattern="[0-9]{10}" maxLength={10} minLength={10}
     autoComplete="off" defaultValue={record.egn||''}
     placeholder="10 цифри"/>
   </label>
   <label className="checkbox-line">
    <input type="checkbox" checked={showEgn} onChange={e=>setShowEgn(e.target.checked)}/>
    Покажи ЕГН
   </label>
   <label>ТЕЛК / експертно решение
    <textarea name="telk" maxLength={2000} rows={3}
     defaultValue={record.telk||''} placeholder="Данни за решение, валидност и ограничения"/>
   </label>
   <label>Диагнози и медицински заключения
    <textarea name="diagnosis" maxLength={5000} rows={4}
     defaultValue={record.diagnosis||''} placeholder="Клинична информация, кодове и заключения"/>
   </label>
   <label>Медицински бележки
    <textarea name="notes" maxLength={10000} rows={5}
     defaultValue={record.notes||''} placeholder="Наблюдения, препоръки, проследяване"/>
   </label>
   <button className="btn primary" type="submit" disabled={pending}>
    {pending?'Записване…':'Запиши поверителните данни'}
   </button>
   {result.message&&<p role="status" className={result.ok?'team-status-ok':'team-status-error'}>
    {result.message}
   </p>}
   {record.has_record&&<p className="subnote">
    Последна актуализация: {record.updated_at?
     new Date(record.updated_at).toLocaleString('bg-BG'):'налична'}.
    Версия на записа: {result.revision??record.revision??0}.
   </p>}
  </form>
 </section>;
}

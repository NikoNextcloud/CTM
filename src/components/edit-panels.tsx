'use client';
import { useActionState } from 'react';
import {
 editCompany,editEmployee,editWorksite,editPosition,editEmploymentPeriod,editRisk,
 type EditState
} from '@/lib/edit-actions';

const initial:EditState={ok:false,message:''};
const Feedback=({message,ok}:{message:string;ok:boolean})=>
  message?<p className={ok?'team-status-ok':'team-status-error'} role="status">{message}</p>:null;

type Company={id:string;revision:number;name:string;eik:string;address:string;status:string;
 activity:string;contact_email:string;contact_phone:string;contract_reference:string};
export function EditCompanyPanel({company}:{company:Company}){
 const [state,action,pending]=useActionState(editCompany,initial);
 return <details className="add-panel edit-panel"><summary className="ctm-edit-trigger">✎ Редактирай фирмата — ЕИК, адрес, контакти и статус</summary>
  <form action={action} className="detail-edit-form">
   <input type="hidden" name="id" value={company.id}/>
   <input type="hidden" name="revision" value={company.revision}/>
   <label>Наименование<input name="name" defaultValue={company.name} required minLength={2} maxLength={200}/></label>
   <label>ЕИК / БУЛСТАТ<input name="eik" defaultValue={company.eik} required inputMode="numeric" pattern="[0-9]{9}([0-9]{4})?" maxLength={13}/></label>
   <label>Адрес<input name="address" defaultValue={company.address} maxLength={300}/></label>
   <label>Дейност<input name="activity" defaultValue={company.activity} maxLength={300}/></label>
   <label>Контактeн имейл<input name="contact_email" type="email" defaultValue={company.contact_email} maxLength={254}/></label>
   <label>Телефон<input name="contact_phone" defaultValue={company.contact_phone} maxLength={50}/></label>
   <label>Референция на договор<input name="contract_reference" defaultValue={company.contract_reference} maxLength={100}/></label>
   <label>Статус<select name="status" defaultValue={company.status}>
     <option value="active">Активна</option><option value="inactive">Неактивна</option><option value="archived">Архивна</option>
   </select></label>
   <button className="btn primary" disabled={pending}>{pending?'Записване…':'Запази промените'}</button>
  </form><Feedback {...state}/>
 </details>;
}
type Employee={id:string;revision:number;full_name:string;job_title:string;reference_code:string};
export function EditEmployeePanel({employee}:{employee:Employee}){
 const [state,action,pending]=useActionState(editEmployee,initial);
 return <details id="employee-edit" open className="add-panel edit-panel ctm-employee-edit-panel"><summary className="ctm-edit-trigger">✎ Редактирай служителя — имена, длъжност и служебен номер</summary>
  <form action={action} className="detail-edit-form">
   <input type="hidden" name="id" value={employee.id}/>
   <input type="hidden" name="revision" value={employee.revision}/>
   <label>Име<input name="full_name" defaultValue={employee.full_name} required minLength={3} maxLength={200}/></label>
   <label>Длъжност<input name="job_title" defaultValue={employee.job_title} maxLength={150}/></label>
   <label>Вътрешен номер<input name="reference_code" defaultValue={employee.reference_code} maxLength={80}/></label>
   <button className="btn primary" disabled={pending}>{pending?'Записване…':'Запази промените'}</button>
  </form><Feedback {...state}/>
 </details>;
}
type Risk={id:string;revision:number;workplace:string;hazard:string;risk_level:string;
 protective_measures:string;assessment_date:string;review_due:string|null;status:string};
export function EditRiskPanel({risk}:{risk:Risk}){
 const [state,action,pending]=useActionState(editRisk,initial);
 return <details className="add-panel edit-panel"><summary>Редактирай проекта на оценка</summary>
  <form action={action} className="detail-edit-form">
   <input type="hidden" name="id" value={risk.id}/>
   <input type="hidden" name="revision" value={risk.revision}/>
   <label>Работно място<input name="workplace" defaultValue={risk.workplace} maxLength={250}/></label>
   <label>Опасност<textarea name="hazard" defaultValue={risk.hazard} maxLength={800} minLength={3} required/></label>
   <label>Ниво<select name="risk_level" defaultValue={risk.risk_level}>
     <option value="low">Ниско</option><option value="medium">Средно</option><option value="high">Високо</option>
   </select></label>
   <label>Мерки<textarea name="protective_measures" defaultValue={risk.protective_measures} maxLength={2000}/></label>
   <label>Дата на оценка<input name="assessment_date" type="date" defaultValue={risk.assessment_date} required/></label>
   <label>Преглед до<input name="review_due" type="date" defaultValue={risk.review_due??''}/></label>
   <label>Статус<select name="status" defaultValue={risk.status}>
     <option value="draft">Проект</option><option value="review">За преглед</option>
   </select></label>
   <button className="btn primary" disabled={pending}>{pending?'Записване…':'Запази проекта'}</button>
  </form><Feedback {...state}/>
  <p className="subnote">Не може да се издава статус „Одобрена“ преди внедряване на проверен нормативен процес.</p>
 </details>;
}
type Worksite={id:string;revision:number;name:string;address:string;active:boolean};
export function EditWorksitePanel({companyId,site}:{companyId:string;site:Worksite}){
 const [state,action,pending]=useActionState(editWorksite,initial);
 return <details className="inline-edit"><summary>Редакция</summary>
  <form action={action} className="inline-edit-form">
   <input name="id" type="hidden" value={site.id}/><input name="revision" type="hidden" value={site.revision}/>
   <input name="company_id" type="hidden" value={companyId}/>
   <label>Обект<input name="name" defaultValue={site.name} maxLength={200} required/></label>
   <label>Адрес<input name="address" defaultValue={site.address} maxLength={300}/></label>
   <label className="checkbox-line"><input name="active" type="checkbox" defaultChecked={site.active}/> Активен</label>
   <button className="btn ghost" disabled={pending}>Запази</button>
  </form><Feedback {...state}/></details>;
}
type Position={id:string;revision:number;title:string;department:string;active:boolean};
export function EditPositionPanel({companyId,position}:{companyId:string;position:Position}){
 const [state,action,pending]=useActionState(editPosition,initial);
 return <details className="inline-edit"><summary>Редакция</summary>
  <form action={action} className="inline-edit-form">
   <input name="id" type="hidden" value={position.id}/><input name="revision" type="hidden" value={position.revision}/>
   <input name="company_id" type="hidden" value={companyId}/>
   <label>Длъжност<input name="title" defaultValue={position.title} maxLength={200} required/></label>
   <label>Отдел<input name="department" defaultValue={position.department} maxLength={200}/></label>
   <label className="checkbox-line"><input name="active" type="checkbox" defaultChecked={position.active}/> Активна</label>
   <button className="btn ghost" disabled={pending}>Запази</button>
  </form><Feedback {...state}/></details>;
}
type Period={id:string;revision:number;started_on:string;ended_on:string|null;source_note:string};
export function EditPeriodPanel({companyId,period}:{companyId:string;period:Period}){
 const [state,action,pending]=useActionState(editEmploymentPeriod,initial);
 return <details className="inline-edit"><summary>Редакция</summary>
  <form action={action} className="inline-edit-form">
   <input name="id" type="hidden" value={period.id}/><input name="revision" type="hidden" value={period.revision}/>
   <input name="company_id" type="hidden" value={companyId}/>
   <label>От<input name="started_on" type="date" defaultValue={period.started_on} required/></label>
   <label>До<input name="ended_on" type="date" defaultValue={period.ended_on??''}/></label>
   <label>Бележка за произход<input name="source_note" defaultValue={period.source_note} maxLength={250}/></label>
   <button className="btn ghost" disabled={pending}>Запази като непотвърден</button>
  </form><Feedback {...state}/></details>;
}

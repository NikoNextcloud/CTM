import {
 scheduleExamination,registerSickLeave,registerDocumentMetadata,registerMigrationSource
} from '@/lib/register-actions';

type Employee={id:string;full_name:string;company_id:string};
type Company={id:string;name:string};
function EmployeeChoice({employees}:{employees:Employee[]}){
 return <label>Служител
  <select name="employee_id" required defaultValue="">
   <option value="">Избери служител</option>
   {employees.map(employee=><option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
  </select>
 </label>;
}
export function ExaminationForm({employees}:{employees:Employee[]}){
 return <details className="add-panel">
  <summary>＋ Планирай медицински преглед</summary>
  {employees.length===0?<p>Първо трябва да има разрешен служител в регистъра.</p>:
   <form action={scheduleExamination} className="company-form">
    <EmployeeChoice employees={employees}/>
    <label>Дата<input name="exam_date" type="date"/></label>
    <label>Вид <select name="exam_type" defaultValue="periodic">
     <option value="initial">Начален</option><option value="periodic">Периодичен</option><option value="other">Друг</option>
    </select></label>
    <button type="submit" className="btn primary">Запиши като предстоящ</button>
   </form>}
  <p className="subnote">Записва график със статус „Предстоящ“, без диагноза или медицинско заключение.</p>
 </details>;
}
export function SickLeaveForm({employees}:{employees:Employee[]}){
 return <details className="add-panel">
  <summary>＋ Регистрирай непотвърден период</summary>
  {employees.length===0?<p>Няма разрешени служители в регистъра.</p>:
   <form action={registerSickLeave} className="company-form">
    <EmployeeChoice employees={employees}/>
    <label>Начална дата<input name="start_date" type="date" required/></label>
    <label>Крайна дата<input name="end_date" type="date"/></label>
    <button type="submit" className="btn primary">Запиши за проверка</button>
   </form>}
  <p className="subnote">Периодите остават непотвърдени; не се извлича автоматично медицинско заключение.</p>
 </details>;
}
export function DocumentMetadataForm({role,companies,employees}:{
 role:string;companies:Company[];employees:Employee[]
}){
 return <details className="add-panel">
  <summary>＋ Регистрирай документ за обработка</summary>
  <form action={registerDocumentMetadata} className="company-form">
   <label>Заглавие<input name="title" required minLength={3} maxLength={200}
    placeholder="Заглавие или входящ номер, без медицинско съдържание"/></label>
   <label>Класификация<select name="classification">
    {role==='doctor'
      ?<option value="medical">Медицински метаданни</option>
      :<option value="administrative">Административен</option>}
   </select></label>
   <label>Фирма<select name="company_id" defaultValue="">
    <option value="">Без фирма</option>
    {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   </select></label>
   <label>Служител<select name="employee_id" defaultValue="">
    <option value="">Без служител</option>
    {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
   </select></label>
   <button className="btn primary" type="submit">Регистрирай за проверка</button>
  </form>
  <p className="subnote">Създава само запис за документ. Прикачване на файл не е активно без защитено хранилище; статусът остава непотвърден.</p>
 </details>;
}
export function MigrationSourceForm(){
 return <details className="add-panel">
  <summary>＋ Регистрирай източник за миграция</summary>
  <form action={registerMigrationSource} className="company-form">
   <label>Име на източника<input name="source_name" required minLength={3} maxLength={180}
    placeholder="Напр. EMS-STM извлечение служители (61 записа)"/></label>
   <button className="btn primary" type="submit">Добави за проверка</button>
  </form>
  <p className="subnote">Тук не се качват оригинални архиви, ЕГН или медицински досиета. Регистрира се само източник със статус „Предстоящ“.</p>
 </details>;
}

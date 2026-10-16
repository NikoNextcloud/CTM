import { createEmployee } from '@/lib/actions';

type Company = { id: string; name: string };
export function EmployeeForm({ companies }: { companies: Company[] }) {
  return <details className="add-panel"><summary>＋ Добави служител</summary>
    {companies.length === 0 ? <div className="notice warn">Първо добави фирма в регистъра.</div> :
    <form action={createEmployee} className="company-form">
      <label>Фирма<select name="company_id" required>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Име на служителя<input name="full_name" maxLength={200} minLength={3} required placeholder="Име Презиме Фамилия" /></label>
      <label>Длъжност<input name="job_title" maxLength={150} placeholder="Длъжност" /></label>
      <label>Вътрешен номер<input name="reference_code" maxLength={80} placeholder="Вътрешен служебен код" /></label>
      <button className="btn primary" type="submit">Запиши</button>
    </form>}
    <p className="subnote">След записване се отваря досието на служителя, където администраторът или лекарят може да попълни ЕГН, ТЕЛК, диагнози и медицински бележки в шифровани полета.</p>
  </details>;
}

import { createEmployee } from '@/lib/actions';

type Company = { id: string; name: string };
export function EmployeeForm({ companies }: { companies: Company[] }) {
  return <details className="add-panel"><summary>＋ Добави служител</summary>
    {companies.length === 0 ? <div className="notice warn">Първо добави фирма в регистъра.</div> :
    <form action={createEmployee} className="company-form">
      <label>Фирма<select name="company_id" required>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Име на служителя<input name="full_name" maxLength={200} minLength={3} required placeholder="Име Презиме Фамилия" /></label>
      <label>Длъжност<input name="job_title" maxLength={150} placeholder="Длъжност" /></label>
      <label>Вътрешен номер<input name="reference_code" maxLength={80} placeholder="Код без ЕГН" /></label>
      <button className="btn primary" type="submit">Запиши</button>
    </form>}
    <p className="subnote">ЕГН и медицински сведения не се въвеждат в административния регистър. За тях е необходим отделен защитен процес.</p>
  </details>;
}

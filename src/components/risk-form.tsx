import { createRiskAssessment } from '@/lib/actions';

type Company = { id: string; name: string };
export function RiskForm({ companies }: { companies: Company[] }) {
  return <details className="add-panel"><summary>＋ Добави оценка на риск (проект)</summary>
    {companies.length === 0 ? <div className="notice warn">За оценка е необходима първо регистрирана фирма.</div> :
    <form action={createRiskAssessment} className="risk-form">
      <label>Фирма<select name="company_id" required>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Работно място<input name="workplace" maxLength={250} placeholder="Работно място / звено" /></label>
      <label>Опасност<input name="hazard" required minLength={3} maxLength={800} placeholder="Опиши опасността" /></label>
      <label>Ниво<select name="risk_level" defaultValue="medium"><option value="low">Ниско</option><option value="medium">Средно</option><option value="high">Високо</option></select></label>
      <label>Мерки<input name="protective_measures" maxLength={2000} placeholder="Предвидени мерки" /></label>
      <label>Дата на оценката<input name="assessment_date" type="date" required /></label>
      <label>Дата за преглед<input name="review_due" type="date" /></label>
      <button className="btn primary" type="submit">Създай проект</button>
    </form>}
    <p className="subnote">Функцията създава проект на оценка, а не юридически одобрен документ.</p>
  </details>;
}

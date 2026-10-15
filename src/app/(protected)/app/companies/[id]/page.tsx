import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/session';
import { createWorksite, createJobPosition, createEmploymentPeriod } from '@/lib/organization-actions';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };
type Worksite = { id:string; name:string; address:string; active:boolean };
type Position = { id:string; title:string; department:string; worksite_id:string|null; active:boolean };
type Employee = { id:string; full_name:string; job_title:string };
type Period = { id:string; employee_id:string; position_id:string; started_on:string; ended_on:string|null; verification_status:string };
const isUuid = (value:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function CompanyWorkspace({params}:Props) {
  const {id} = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getContext();
  if (!ctx.tenant) notFound();
  const firmResult = await ctx.supabase.from('companies')
    .select('id,name,eik,address,status').eq('tenant_id',ctx.tenant).eq('id',id).maybeSingle();
  if (firmResult.error || !firmResult.data) notFound();
  const firm=firmResult.data;

  const [sites,positions,employees,periods] = await Promise.all([
    ctx.supabase.from('worksites').select('id,name,address,active').eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).limit(100),
    ctx.supabase.from('job_positions').select('id,title,department,worksite_id,active').eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).limit(100),
    ctx.supabase.from('employees').select('id,full_name,job_title').eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).limit(100),
    ctx.supabase.from('employment_periods').select('id,employee_id,position_id,started_on,ended_on,verification_status').eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).limit(100)
  ]);
  const hasError = [sites,positions,employees,periods].some(r=>r.error);
  const siteRows=(sites.data??[]) as unknown as Worksite[];
  const positionRows=(positions.data??[]) as unknown as Position[];
  const employeeRows=(employees.data??[]) as unknown as Employee[];
  const periodRows=(periods.data??[]) as unknown as Period[];
  const canWrite=['admin','specialist'].includes(ctx.role);
  const employeeNames=new Map(employeeRows.map(row=>[row.id,row.full_name]));
  const positionNames=new Map(positionRows.map(row=>[row.id,row.title]));

  return <div className="content">
    <div className="page-header">
      <div>
        <Link href="/app/companies" className="back">← Фирми</Link>
        <p className="eyebrow">ФИРМЕНО ДОСИЕ · АДМИНИСТРАТИВНИ ДАННИ</p>
        <h1>{firm.name}</h1>
        <p>ЕИК/БУЛСТАТ: {firm.eik} · {firm.status==='active'?'Активна':firm.status==='inactive'?'Неактивна':'Архивна'}</p>
        <p>{firm.address || 'Няма посочен адрес'}</p>
      </div>
      <span className="tag">Тестова версия v0.4</span>
    </div>
    <div className="notice warn">Не въвеждай реални персонални или здравни данни, докато не приключат интеграционните и правните проверки. Трудовите периоди се записват като „непотвърдени“.</div>
    {hasError&&<div className="notice warn">Част от данните не могат да бъдат заредени. Провери правата и миграцията.</div>}
    <section className="metrics company-detail-metrics">
      <div className="metric"><span>Работни обекти</span><strong>{siteRows.length}</strong><small>В показаните до 100</small></div>
      <div className="metric"><span>Длъжности</span><strong>{positionRows.length}</strong><small>В показаните до 100</small></div>
      <div className="metric"><span>Служители</span><strong>{employeeRows.length}</strong><small>В показаните до 100</small></div>
      <div className="metric"><span>Трудови периоди</span><strong>{periodRows.length}</strong><small>Без предположение за активност</small></div>
    </section>
    {canWrite&&<section className="company-editor">
      <details className="add-panel"><summary>＋ Нов работен обект</summary>
        <form action={createWorksite} className="company-detail-form">
          <input type="hidden" name="company_id" value={id}/>
          <label>Наименование<input name="name" required minLength={2} maxLength={200} placeholder="Обект / цех / офис"/></label>
          <label>Адрес<input name="address" maxLength={300} placeholder="Местонахождение"/></label>
          <button className="btn primary">Запиши обекта</button>
        </form>
      </details>
      <details className="add-panel"><summary>＋ Нова длъжност</summary>
        <form action={createJobPosition} className="company-detail-form">
          <input type="hidden" name="company_id" value={id}/>
          <label>Наименование<input name="title" required minLength={2} maxLength={200} placeholder="Длъжност"/></label>
          <label>Отдел<input name="department" maxLength={200} placeholder="Отдел/звено"/></label>
          <label>Работен обект<select name="worksite_id" defaultValue=""><option value="">Без посочен обект</option>
            {siteRows.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <button className="btn primary">Запиши длъжността</button>
        </form>
      </details>
      <details className="add-panel"><summary>＋ Трудов период (непотвърден)</summary>
        <form action={createEmploymentPeriod} className="company-detail-form">
          <input type="hidden" name="company_id" value={id}/>
          <label>Служител<select name="employee_id" required defaultValue=""><option value="" disabled>Избери служител</option>
            {employeeRows.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select></label>
          <label>Длъжност<select name="position_id" required defaultValue=""><option value="" disabled>Избери длъжност</option>
            {positionRows.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
          </select></label>
          <label>От дата<input type="date" name="started_on" required/></label>
          <label>До дата (незадължително)<input type="date" name="ended_on"/></label>
          <button className="btn primary" disabled={!employeeRows.length||!positionRows.length}>Добави непотвърден период</button>
        </form>
      </details>
    </section>}
    <section className="company-lists">
      <div className="table-panel"><h2 className="company-section-title">Работни обекти</h2>
        {!siteRows.length?<p className="company-empty">Все още няма работни обекти.</p>:
        <div className="table-wrap"><table><thead><tr><th>Обект</th><th>Адрес</th><th>Статус</th></tr></thead><tbody>
          {siteRows.map(s=><tr key={s.id}><td>{s.name}</td><td>{s.address||'—'}</td><td>{s.active?'Активен':'Неактивен'}</td></tr>)}
        </tbody></table></div>}
      </div>
      <div className="table-panel"><h2 className="company-section-title">Длъжности</h2>
        {!positionRows.length?<p className="company-empty">Все още няма длъжности.</p>:
        <div className="table-wrap"><table><thead><tr><th>Длъжност</th><th>Отдел</th><th>Работен обект</th></tr></thead><tbody>
          {positionRows.map(p=><tr key={p.id}><td>{p.title}</td><td>{p.department||'—'}</td><td>{siteRows.find(s=>s.id===p.worksite_id)?.name||'—'}</td></tr>)}
        </tbody></table></div>}
      </div>
      <div className="table-panel"><h2 className="company-section-title">История на трудовите периоди</h2>
        {!periodRows.length?<p className="company-empty">Няма записани периоди.</p>:
        <div className="table-wrap"><table><thead><tr><th>Служител</th><th>Длъжност</th><th>Начало</th><th>Край</th><th>Проверка</th></tr></thead><tbody>
          {periodRows.map(period=><tr key={period.id}>
            <td>{employeeNames.get(period.employee_id)||'Запис в служебен регистър'}</td>
            <td>{positionNames.get(period.position_id)||'Неизвестна длъжност'}</td>
            <td>{period.started_on}</td><td>{period.ended_on||'—'}</td>
            <td>{period.verification_status==='unverified'?'Непотвърден':period.verification_status==='verified'?'Потвърден':'Конфликт'}</td>
          </tr>)}
        </tbody></table></div>}
      </div>
    </section>
    <p className="subnote">Показват се до 100 записи във всеки раздел. Следващ етап: странициране, контролирано потвърждение и история на редакциите.</p>
  </div>;
}
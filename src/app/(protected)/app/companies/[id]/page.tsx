import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/session';
import { createWorksite, createJobPosition, createEmploymentPeriod } from '@/lib/organization-actions';
import { EditCompanyPanel,EditWorksitePanel,EditPositionPanel,EditPeriodPanel } from '@/components/edit-panels';
import { reviewEmploymentPeriod } from '@/lib/employment-review-actions';
export const dynamic='force-dynamic';

type Search={sites?:string;positions?:string;employees?:string;periods?:string;findEmployee?:string;findPosition?:string};
type Props={params:Promise<{id:string}>;searchParams:Promise<Search>};
type Site={id:string;name:string;address:string;active:boolean;revision:number};
type Position={id:string;title:string;department:string;worksite_id:string|null;active:boolean;revision:number};
type Employee={id:string;full_name:string;job_title:string};
type Period={id:string;employee_id:string;position_id:string;started_on:string;ended_on:string|null;verification_status:string;source_note:string;revision:number};
const uuid=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const page=(n?:string)=>Math.max(1,Math.min(10000,Number.isFinite(Number(n))?Math.floor(Number(n)||1):1));
const searchText=(v?:string)=>(v||'').trim().slice(0,75).replace(/[%_,]/g,'');
const pageSize=25;

export default async function CompanyWorkspace({params,searchParams}:Props){
 const {id}=await params;if(!uuid(id))notFound();
 const sp=await searchParams;
 const pages={sites:page(sp.sites),positions:page(sp.positions),employees:page(sp.employees),periods:page(sp.periods)};
 const findEmployee=searchText(sp.findEmployee),findPosition=searchText(sp.findPosition);
 const ctx=await getContext();if(!ctx.tenant)notFound();
 const firmResult=await ctx.supabase.from('companies')
  .select('id,name,eik,address,status,revision,activity,contact_email,contact_phone,contract_reference')
  .eq('tenant_id',ctx.tenant).eq('id',id).maybeSingle();
 if(firmResult.error||!firmResult.data)notFound();
 const company=firmResult.data;
 const canWrite=['admin','specialist'].includes(ctx.role);
 const siteQuery=ctx.supabase.from('worksites').select('id,name,address,active,revision',{count:'exact'}).eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).order('id').range((pages.sites-1)*pageSize,pages.sites*pageSize-1);
 const positionQuery=ctx.supabase.from('job_positions').select('id,title,department,worksite_id,active,revision',{count:'exact'}).eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).order('id').range((pages.positions-1)*pageSize,pages.positions*pageSize-1);
 const employeeQuery=ctx.supabase.from('employees').select('id,full_name,job_title',{count:'exact'}).eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).order('id').range((pages.employees-1)*pageSize,pages.employees*pageSize-1);
 const periodQuery=ctx.supabase.from('employment_periods').select('id,employee_id,position_id,started_on,ended_on,verification_status,source_note,revision',{count:'exact'}).eq('tenant_id',ctx.tenant).eq('company_id',id).order('created_at',{ascending:false}).order('id').range((pages.periods-1)*pageSize,pages.periods*pageSize-1);
 let employeeSelector=ctx.supabase.from('employees').select('id,full_name').eq('tenant_id',ctx.tenant).eq('company_id',id).order('full_name').limit(75);
 let positionSelector=ctx.supabase.from('job_positions').select('id,title,active').eq('tenant_id',ctx.tenant).eq('company_id',id).order('title').limit(75);
 if(findEmployee)employeeSelector=employeeSelector.ilike('full_name','%'+findEmployee+'%');
 if(findPosition)positionSelector=positionSelector.ilike('title','%'+findPosition+'%');
 const [sites,positions,employees,periods,employeeOptions,positionOptions]=await Promise.all([
  siteQuery,positionQuery,employeeQuery,periodQuery,
  canWrite?employeeSelector:Promise.resolve({data:[],error:null}),
  canWrite?positionSelector:Promise.resolve({data:[],error:null})
 ]);
 const allErrors=[sites,positions,employees,periods,employeeOptions,positionOptions].some(x=>x.error);
 const siteRows=(sites.data??[]) as unknown as Site[];
 const positionRows=(positions.data??[]) as unknown as Position[];
 const employeeRows=(employees.data??[]) as unknown as Employee[];
 const periodRows=(periods.data??[]) as unknown as Period[];
 const selectedEmployees=(employeeOptions.data??[]) as unknown as {id:string;full_name:string}[];
 const selectedPositions=(positionOptions.data??[]) as unknown as {id:string;title:string;active:boolean}[];
 const counts={sites:sites.count??0,positions:positions.count??0,employees:employees.count??0,periods:periods.count??0};
 const employeeNames=new Map([...employeeRows,...selectedEmployees].map(e=>[e.id,e.full_name]));
 const positionNames=new Map([...positionRows,...selectedPositions].map(p=>[p.id,p.title]));
 const pageUrl=(key:keyof typeof pages,next:number)=>{
  const params=new URLSearchParams({sites:String(pages.sites),positions:String(pages.positions),employees:String(pages.employees),periods:String(pages.periods)});
  if(findEmployee)params.set('findEmployee',findEmployee);
  if(findPosition)params.set('findPosition',findPosition);
  params.set(key,String(next));return '/app/companies/'+id+'?'+params.toString();
 };
 const pager=(key:keyof typeof pages,total:number)=><div className="pagination"><span>Страница {pages[key]} · Общо {total}</span>
  <div>{pages[key]>1&&<Link className="btn ghost" href={pageUrl(key,pages[key]-1)}>← Назад</Link>}
  {pages[key]*pageSize<total&&<Link className="btn ghost" href={pageUrl(key,pages[key]+1)}>Напред →</Link>}</div></div>;

 return <div className="content">
  <div className="page-header"><div><Link href="/app/companies" className="back">← Всички фирми</Link>
   <p className="eyebrow">ФИРМЕНО ДОСИЕ · ТЕСТОВ РЕГИСТЪР</p><h1>{company.name}</h1>
   <p>ЕИК / БУЛСТАТ: {company.eik} · {company.status}</p>
   <p>{company.address||'Адрес не е въведен'}{company.activity?' · '+company.activity:''}</p>
  </div><span className="tag">v0.6 · тестова версия</span></div>
  <div className="notice warn">Само тестови данни — без реални ЕГН и медицински сведения. Трудовите периоди се въвеждат като непотвърдени и се проверяват ръчно срещу документи с проследимо основание.</div>
  {allErrors&&<div className="notice warn">Някои списъци не могат да бъдат заредени. Провери правата си.</div>}
  {canWrite&&<EditCompanyPanel company={company}/>}
  <section className="metrics company-detail-metrics">
   <div className="metric"><span>Обекти</span><strong>{sites.error?'—':counts.sites}</strong></div>
   <div className="metric"><span>Длъжности</span><strong>{positions.error?'—':counts.positions}</strong></div>
   <div className="metric"><span>Служители</span><strong>{employees.error?'—':counts.employees}</strong></div>
   <div className="metric"><span>Трудови периоди</span><strong>{periods.error?'—':counts.periods}</strong></div>
  </section>
  {canWrite&&<section className="company-editor">
   <details className="add-panel"><summary>＋ Добави работен обект</summary><form action={createWorksite} className="company-detail-form">
    <input type="hidden" name="company_id" value={id}/>
    <label>Наименование<input name="name" required minLength={2} maxLength={200}/></label>
    <label>Адрес<input name="address" maxLength={300}/></label>
    <button className="btn primary">Запиши</button>
   </form></details>
   <details className="add-panel"><summary>＋ Добави длъжност</summary><form action={createJobPosition} className="company-detail-form">
    <input type="hidden" name="company_id" value={id}/>
    <label>Длъжност<input name="title" required minLength={2} maxLength={200}/></label>
    <label>Отдел<input name="department" maxLength={200}/></label>
    <label>Обект<select name="worksite_id" defaultValue=""><option value="">Без обект</option>{siteRows.filter(s=>s.active).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    <button className="btn primary">Запиши</button>
   </form><p className="subnote">За избор на обект от по-стара страница премини към страницата с този обект.</p></details>
   <details className="add-panel"><summary>＋ Добави непотвърден трудов период</summary>
    <form className="searchbar" method="get">
      <input name="findEmployee" defaultValue={findEmployee} placeholder="Търси служител по име"/>
      <input name="findPosition" defaultValue={findPosition} placeholder="Търси длъжност"/>
      <button className="btn ghost">Търси в списъците</button>
    </form>
    <form action={createEmploymentPeriod} className="company-detail-form">
     <input type="hidden" name="company_id" value={id}/>
     <label>Служител<select name="employee_id" required defaultValue=""><option value="" disabled>Избери от намерените</option>
      {selectedEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
     <label>Длъжност<select name="position_id" required defaultValue=""><option value="" disabled>Избери от намерените</option>
      {selectedPositions.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
     <label>Начало<input type="date" name="started_on" required/></label>
     <label>Край<input type="date" name="ended_on"/></label>
     <button className="btn primary" disabled={!selectedEmployees.length||!selectedPositions.length}>Запиши като непотвърден</button>
    </form><p className="subnote">Търсенето показва до 75 резултата за избор. Използвай по-конкретно име при големи фирми.</p>
   </details>
  </section>}
  <div className="company-lists">
   <section className="table-panel"><h2 className="company-section-title">Обекти</h2>
    <div className="table-wrap"><table><thead><tr><th>Обект</th><th>Адрес</th><th>Статус</th>{canWrite&&<th>Действие</th>}</tr></thead>
    <tbody>{siteRows.map(s=><tr key={s.id}><td>{s.name}</td><td>{s.address||'—'}</td><td>{s.active?'Активен':'Неактивен'}</td>
     {canWrite&&<td><EditWorksitePanel companyId={id} site={s}/></td>}</tr>)}</tbody></table></div>
    {!siteRows.length&&<p className="company-empty">Няма обекти на тази страница.</p>}{pager('sites',counts.sites)}
   </section>
   <section className="table-panel"><h2 className="company-section-title">Длъжности</h2>
    <div className="table-wrap"><table><thead><tr><th>Длъжност</th><th>Отдел</th>{canWrite&&<th>Действие</th>}</tr></thead>
    <tbody>{positionRows.map(p=><tr key={p.id}><td>{p.title}</td><td>{p.department||'—'}</td>
     {canWrite&&<td><EditPositionPanel companyId={id} position={p}/></td>}</tr>)}</tbody></table></div>
    {!positionRows.length&&<p className="company-empty">Няма длъжности на тази страница.</p>}{pager('positions',counts.positions)}
   </section>
   <section className="table-panel"><h2 className="company-section-title">Служители</h2>
    <div className="table-wrap"><table><thead><tr><th>Име</th><th>Длъжност</th></tr></thead>
    <tbody>{employeeRows.map(e=><tr key={e.id}><td><Link className="company-link" href={'/app/employees/'+e.id}>{e.full_name}</Link></td><td>{e.job_title||'—'}</td></tr>)}</tbody></table></div>
    {!employeeRows.length&&<p className="company-empty">Няма служители на тази страница.</p>}{pager('employees',counts.employees)}
   </section>
   <section className="table-panel"><h2 className="company-section-title">Трудови периоди</h2>
    <div className="table-wrap"><table><thead><tr><th>Служител</th><th>Длъжност</th><th>Начало</th><th>Край</th><th>Проверка</th>{canWrite&&<th>Действие</th>}</tr></thead>
    <tbody>{periodRows.map(p=><tr key={p.id}>
      <td>{employeeNames.get(p.employee_id)||'Запис в регистъра'}</td>
      <td>{positionNames.get(p.position_id)||'Запис в регистъра'}</td>
      <td>{p.started_on}</td><td>{p.ended_on||'—'}</td>
      <td>{p.verification_status==='verified'?'Потвърден':p.verification_status==='conflict'?'Конфликт':'Непотвърден'}</td>
      {canWrite&&<td>
        <EditPeriodPanel companyId={id} period={p}/>
        <details className="inline-edit"><summary>Проверка на източник</summary>
          <form className="review-inline" action={reviewEmploymentPeriod}>
            <input type="hidden" name="id" value={p.id}/>
            <input type="hidden" name="company_id" value={id}/>
            <input type="hidden" name="revision" value={p.revision}/>
            <label>Резултат<select name="verification_status" defaultValue={p.verification_status}>
              <option value="unverified">Непотвърден</option>
              <option value="verified">Потвърден</option>
              <option value="conflict">Конфликт</option>
            </select></label>
            <label>Основание за проверката<input name="verification_note" maxLength={300} placeholder="Документ, дата и основание — без здравни данни"/></label>
            <button type="submit" className="btn ghost">Запиши проверката</button>
          </form>
          <p className="subnote">При потвърждение или конфликт опиши достоверен източник (поне 12 символа). Промяната се одитира.</p>
        </details>
      </td>}</tr>)}</tbody></table></div>
    {!periodRows.length&&<p className="company-empty">Няма периоди на тази страница.</p>}{pager('periods',counts.periods)}
   </section>
  </div>
 </div>;
}

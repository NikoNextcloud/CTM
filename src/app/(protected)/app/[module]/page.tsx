import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getContext} from '@/lib/session';
import {modules} from '@/lib/modules';
import {CompanyForm} from '@/components/company-form';
import {EmployeeForm} from '@/components/employee-form';
import {RiskForm} from '@/components/risk-form';
import {PendingCompanyCandidates} from '@/components/pending-company-candidates';
import {ArchivedPersonnelPeek} from '@/components/archived-personnel-peek';
import {ExaminationForm,SickLeaveForm,DocumentMetadataForm,MigrationSourceForm} from '@/components/register-forms';
export const dynamic='force-dynamic';
type Props={params:Promise<{module:string}>;searchParams:Promise<{q?:string;page?:string}>};
const roleAllowed=(id:string,role:string)=>!(id==='sick-leaves'&&role!=='doctor')&&!(id==='migration'&&role!=='admin')&&!(id==='team'&&role!=='admin')&&!(id==='reports'&&!['admin','specialist'].includes(role));
export default async function ModulePage({params,searchParams}:Props){const {module:slug}=await params;const q=(await searchParams).q?.trim().slice(0,80)||'';const page=Math.max(1,Math.min(10000,Number((await searchParams).page)||1));const m=modules.find(x=>x.id===slug);if(!m)notFound();const ctx=await getContext();if(!ctx.tenant)return null;
 if(!roleAllowed(m.id,ctx.role))return <div className="content"><div className="notice warn">Нямате разрешение за този модул.</div></div>;
 if(!m.table)return <div className="content"><div className="page-header"><div><Link href="/app" className="back">← Табло</Link><h1>{m.title}</h1><p>{m.subtitle}</p></div></div><div className="empty"><h2>Подготовка на модула</h2><p>Тази функция изисква допълнителни проверки за права, одит и миграция, преди да се активира с реални данни.</p></div></div>;
 const canWrite=['admin','specialist'].includes(ctx.role);
 const transferResource=m.id==='risks'?'risk_assessments':m.id==='job-positions'?'job_positions':m.id;
 const needCompanies=(canWrite && (m.id==='employees'||m.id==='risks'))||(m.id==='documents'&&['admin','specialist','doctor'].includes(ctx.role));
 const companiesResult=needCompanies ? await ctx.supabase.from('companies').select('id,name').eq('tenant_id',ctx.tenant).order('name').limit(100) : null;
 const companies=(companiesResult?.data||[]) as unknown as {id:string;name:string}[];
 const needEmployees=['examinations','sick-leaves','documents'].includes(m.id)&&
   (ctx.role==='doctor'||(m.id==='documents'&&['admin','specialist'].includes(ctx.role)));
 const employeeResult=needEmployees?await ctx.supabase.from('employees')
  .select('id,full_name,company_id').eq('tenant_id',ctx.tenant).order('full_name').limit(200):null;
 const availableEmployees=(employeeResult?.data||[]) as unknown as {id:string;full_name:string;company_id:string}[];
 const read=ctx.supabase.from(m.table).select('*',{count:'exact'}).eq('tenant_id',ctx.tenant);
 if(m.id==='employees')read.neq('current_status','archived');
 if(m.id==='companies')read.neq('status','archived');
 if(q){const key=m.id==='companies'||m.id==='worksites'?'name':m.id==='employees'?'full_name':m.id==='job-positions'||m.id==='documents'?'title':m.id==='risks'?'hazard':null;if(key)read.ilike(key,`%${q.replace(/[%_]/g,'')}%`);}
 const {data,count,error}=await read.order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25-1);
 // Dynamic table names prevent Supabase from inferring the selected record type.
 const rows=(data||[]) as unknown as Record<string,unknown>[];
 return <div className="content">{canWrite&&['companies','employees','risks','worksites','job-positions'].includes(m.id)&&<div className="transfer-actions"><Link className="btn ghost" href={'/app/data-transfer?resource='+encodeURIComponent(transferResource)}>⇧ Импорт CSV / XLSX</Link><Link className="btn primary" href={'/api/export?resource='+encodeURIComponent(transferResource)}>⇩ Експорт CSV</Link></div>}{ctx.role==='admin'&&m.id==='employees'&&<Link className="btn ghost" href="/app/employees/archived">Архивирани служители →</Link>}{ctx.role==='admin'&&m.id==='companies'&&<Link className="btn ghost" href="/app/companies/archived">Архивирани фирми →</Link>}<div className="page-header"><div><Link href="/app" className="back">← Табло</Link><p className="eyebrow">РЕГИСТЪР</p><h1>{m.title}</h1><p>{m.subtitle}</p></div><span className="tag">{count??0} записа в регистъра</span></div>{m.id==='companies'&&ctx.role==='admin'&&<PendingCompanyCandidates/>}{m.id==='employees'&&ctx.role==='admin'&&<ArchivedPersonnelPeek/>}{m.id==='companies'&&['admin','specialist'].includes(ctx.role)&&<CompanyForm/>}{m.id==='employees'&&canWrite&&<EmployeeForm companies={companies}/>}{m.id==='risks'&&canWrite&&<RiskForm companies={companies}/>}{m.id==='examinations'&&ctx.role==='doctor'&&<ExaminationForm employees={availableEmployees}/>}
 {m.id==='sick-leaves'&&ctx.role==='doctor'&&<SickLeaveForm employees={availableEmployees}/>}
 {m.id==='documents'&&['admin','specialist','doctor'].includes(ctx.role)&&
  <DocumentMetadataForm role={ctx.role} companies={companies} employees={availableEmployees}/>}
 {m.id==='migration'&&ctx.role==='admin'&&<>
   <div className="table-panel">
    <h2>Фирми от архивните източници</h2>
    <p>Прегледай кандидатите от MEGA и EMS-STM, провери ЕИК и свържи само потвърдените юридически лица.</p>
    <Link className="btn primary" href="/app/migration/companies">Отвори кандидатите за фирми →</Link>
   </div>
   <PendingCompanyCandidates compact/>
   <div className="table-panel"><h2>Служители и медицински данни от архив</h2><p>Импорт на XLSX с ЕГН, ТЕЛК, длъжности и допълнителни колони, с проверка преди запис.</p><Link className="btn primary" href="/app/migration/personnel">Отвори импорта на реални служители →</Link></div>
   <div className="table-panel"><h2>Инвентаризация и файлови източници</h2><Link className="btn ghost" href="/app/migration/personnel">Прегледай архивните служители →</Link></div>
   <MigrationSourceForm/>
  </>}
 {employeeResult?.error&&<div className="notice warn">Не могат да се заредят служителите за избора.</div>}
 {companiesResult?.error&&<div className="notice warn">Неуспешно зареждане на фирмите.</div>}<div className="table-panel"><form className="searchbar"><input aria-label="Търси" type="search" name="q" placeholder="Търси в регистъра…" defaultValue={q}/><button className="btn primary" type="submit">Търси</button></form>{error?<div className="notice warn">Грешка при зареждане. Проверете правата и миграцията на базата.</div>:rows.length===0?<div className="empty"><div className="empty-icon">▧</div><h3>{m.id==='companies'?'Все още няма потвърдени работодатели':'Няма записи в този регистър'}</h3><p>{m.id==='companies'?'Имената от архивите са показани отделно по-горе и чакат проверка на ЕИК.':'Добавете запис или променете търсенето. Не са създавани фиктивни данни.'}</p></div>:<div className="table-wrap"><table><thead><tr>{m.columns?.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={String(r.id)}>{m.columns?.map(col=><td key={col.key}>{m.id==='companies'&&col.key==='name' ? <Link className="company-link" href={'/app/companies/'+String(r.id)}>{String(r[col.key]??'—')} →</Link> : m.id==='employees'&&col.key==='full_name' ? <Link className="company-link" href={'/app/employees/'+String(r.id)}>{String(r[col.key]??'—')} →</Link> : m.id==='risks'&&col.key==='hazard' ? <Link className="company-link" href={'/app/risks/'+String(r.id)}>{String(r[col.key]??'—')} →</Link> : String(r[col.key]??'—')}</td>)}</tr>)}</tbody></table></div>}<div className="pagination"><span>Страница {page} · {(count||0).toLocaleString('bg-BG')} записа</span><div>{page>1&&<Link className="btn ghost" href={'?page='+(page-1)+'&q='+encodeURIComponent(q)}>← Назад</Link>}{page*25<(count||0)&&<Link className="btn ghost" href={'?page='+(page+1)+'&q='+encodeURIComponent(q)}>Напред →</Link>}</div></div></div>{['companies','employees'].includes(m.id)&&canWrite&&<p className="subnote">CSV експортът е достъпен за администратор или СТМ специалист: <Link href={'/api/export?resource='+m.id}>експорт на разрешените данни</Link>.</p>}</div>
}

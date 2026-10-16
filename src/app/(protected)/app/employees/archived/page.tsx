import Link from 'next/link';
import {getContext} from '@/lib/session';
export const dynamic='force-dynamic';
export default async function ArchivedEmployees(){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')
  return <div className="content"><div className="notice warn">Нямаш достъп до архива на служителите.</div></div>;
 const {data,count,error}=await ctx.supabase.from('employees')
  .select('id,full_name,job_title',{count:'exact'})
  .eq('tenant_id',ctx.tenant).eq('current_status','archived')
  .order('full_name').limit(200);
 return <div className="content">
  <Link className="back" href="/app/employees">← Служители</Link>
  <div className="page-header"><div><p className="eyebrow">АРХИВ · ВЪЗСТАНОВЯЕМИ ДОСИЕТА</p>
   <h1>Архивирани служители</h1>
   <p>Медицинските досиета остават шифровани и с ограничен достъп.</p>
  </div><span className="tag">{count||0} служители</span></div>
  {error?<div className="notice warn" role="alert">Грешка при зареждане.</div>:
  <section className="table-panel"><table><thead><tr><th>Име</th><th>Длъжност</th><th>Действие</th></tr></thead><tbody>
   {(data||[]).map(e=><tr key={e.id}><td>{e.full_name}</td><td>{e.job_title||'—'}</td>
    <td><Link className="company-link" href={'/app/employees/'+e.id}>Досие и възстановяване →</Link></td></tr>)}
  </tbody></table></section>}
 </div>;
}
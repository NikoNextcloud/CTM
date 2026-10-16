import Link from 'next/link';
import {getContext} from '@/lib/session';
export const dynamic='force-dynamic';
export default async function ArchivedCompanies(){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')
  return <div className="content"><div className="notice warn">Нямаш достъп до архива на фирмите.</div></div>;
 const {data,count,error}=await ctx.supabase.from('companies')
  .select('id,name,eik',{count:'exact'}).eq('tenant_id',ctx.tenant)
  .eq('status','archived').order('name').limit(200);
 return <div className="content">
  <Link className="back" href="/app/companies">← Фирми</Link>
  <div className="page-header"><div><p className="eyebrow">АРХИВ · ВЪЗСТАНОВЯЕМИ ДАННИ</p>
   <h1>Архивирани фирми</h1>
   <p>Архивирането не изтрива документи или свързани служители.</p>
  </div><span className="tag">{count||0} фирми</span></div>
  {error?<div className="notice warn" role="alert">Грешка при зареждане.</div>:
  <section className="table-panel"><table><thead><tr><th>Фирма</th><th>ЕИК</th><th>Действие</th></tr></thead><tbody>
   {(data||[]).map(c=><tr key={c.id}><td>{c.name}</td><td>{c.eik}</td>
    <td><Link className="company-link" href={'/app/companies/'+c.id}>Преглед и възстановяване →</Link></td></tr>)}
  </tbody></table></section>}
 </div>;
}
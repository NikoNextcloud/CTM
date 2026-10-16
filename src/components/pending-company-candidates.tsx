import Link from 'next/link';
import {getContext} from '@/lib/session';

// Protected server component. Staging companies never appear to non-admin users.
export async function PendingCompanyCandidates({compact=false}:{compact?:boolean}){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return null;
 const {data,count,error}=await ctx.supabase.from('ctm_company_candidates')
  .select('id,name,source_kind,review_status',{count:'exact'})
  .eq('tenant_id',ctx.tenant)
  .eq('review_status','pending')
  .order('created_at',{ascending:false})
  .limit(compact?4:12);
 if(error)return <div className="notice warn" role="alert">
  Списъкът с фирми за проверка не може да се зареди. Няма промяна по архивните записи.
 </div>;
 if(!count)return null;
 const rows=data||[];
 return <section className="overview-card" aria-label="Непотвърдени фирмени кандидати">
  <div className="overview-head">
   <div className="overview-copy"><p className="overview-eyebrow">ДАННИ ОТ АРХИВИТЕ · ЗА ПРЕГЛЕД</p>
    <h2>Фирми от архива <span className="overview-count">{count}</span></h2>
    <p>За проверка на ЕИК и документи · не са активни работодатели</p>
   </div>
   <Link className="overview-action" href="/app/migration/companies">Виж всички →</Link>
  </div>
  <div className="overview-table-wrap"><table className="overview-table">
   <thead><tr><th>Наименование от източника</th><th>Произход</th><th>Състояние</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>
    <td><Link className="company-link"
     href={'/app/migration/companies?q='+encodeURIComponent(row.name)}>
     {row.name} →</Link></td>
    <td>{row.source_kind==='mega_root'?'MEGA':row.source_kind==='ems_xlsx'?'EMS-STM':'Excel'}</td>
    <td>За проверка</td>
   </tr>)}</tbody>
  </table></div>
  <div className="overview-footer">Показани {rows.length} от {count} непотвърдени фирми</div>
 </section>;
}

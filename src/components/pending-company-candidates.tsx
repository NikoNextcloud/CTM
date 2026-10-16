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
  .limit(compact?6:20);
 if(error)return <div className="notice warn" role="alert">
  Списъкът с фирми за проверка не може да се зареди. Няма промяна по архивните записи.
 </div>;
 if(!count)return null;
 const rows=data||[];
 return <section className="table-panel" aria-label="Непотвърдени фирмени кандидати">
  <div className="section-heading">
   <div><p className="eyebrow">ДАННИ ОТ АРХИВИТЕ · ЗА ПРЕГЛЕД</p>
    <h2>{count.toLocaleString('bg-BG')} фирмени имена чакат проверка</h2>
    <p>Имената вече съществуват в базата, но не са потвърдени работодатели.
     ЕИК и договорите трябва да бъдат сверени, преди да попаднат в основния регистър.</p>
   </div>
  </div>
  <div className="table-wrap"><table>
   <thead><tr><th>Наименование от източника</th><th>Произход</th><th>Състояние</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>
    <td><Link className="company-link"
     href={'/app/migration/companies?q='+encodeURIComponent(row.name)}>
     {row.name} →</Link></td>
    <td>{row.source_kind==='mega_root'?'MEGA':row.source_kind==='ems_xlsx'?'EMS-STM':'Excel'}</td>
    <td>За проверка</td>
   </tr>)}</tbody>
  </table></div>
  <p className="subnote">Показани са {rows.length} от {count} кандидата. Изборът на кандидат
   не активира фирма и не прехвърля служители или медицински данни.</p>
  <p><Link className="btn primary" href="/app/migration/companies">
   Отвори всички {count.toLocaleString('bg-BG')} кандидата и провери ЕИК →
  </Link></p>
 </section>;
}

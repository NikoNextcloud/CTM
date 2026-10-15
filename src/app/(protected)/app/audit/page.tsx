import Link from 'next/link';
import {getContext} from '@/lib/session';

export const dynamic='force-dynamic';

export default async function AuditLog({searchParams}:{
  searchParams:Promise<{page?:string}>
}) {
 const ctx=await getContext();
 if(!ctx.tenant||!['admin','auditor'].includes(ctx.role)) {
  return <div className="content"><div className="notice warn">Регистърът е достъпен само за администратор и одитор.</div></div>;
 }
 const raw=Number((await searchParams).page||1);
 const page=Number.isSafeInteger(raw)?Math.max(1,Math.min(raw,1000)):1;
 const {data,count,error}=await ctx.supabase.from('audit_events')
  .select('id,occurred_at,entity,action,actor_id,record_id',{count:'exact'})
  .eq('tenant_id',ctx.tenant)
  .order('occurred_at',{ascending:false})
  .range((page-1)*50,page*50-1);
 type Row={id:number;occurred_at:string;entity:string;action:string;actor_id:string|null;record_id:string|null};
 const rows=(data||[]) as unknown as Row[];
 return <div className="content">
  <div className="page-header"><div><p className="eyebrow">КОНТРОЛ И ПРОСЛЕДИМОСТ</p>
   <h1>Одитен регистър</h1><p>Действия върху фирмените регистри и настройките за достъп.</p></div>
   <span className="tag">{count??0} събития</span></div>
  <div className="notice warn">Това е начален регистър на промени, не е пълен журнал на всички прочитания на медицинска информация. Не съдържа диагнози.</div>
  <div className="table-panel">
   {error?<div className="notice warn">Неуспешно четене на одитните събития.</div>
   :rows.length===0?<p className="company-empty">Няма събития за показване.</p>
   :<div className="table-wrap"><table><thead><tr>
    <th>Време (UTC)</th><th>Модул</th><th>Действие</th><th>Потребител (UUID)</th><th>Запис (UUID)</th>
   </tr></thead><tbody>
    {rows.map(row=><tr key={row.id}>
     <td>{new Date(row.occurred_at).toLocaleString('bg-BG',{timeZone:'UTC'})}</td>
     <td>{row.entity}</td><td>{row.action}</td>
     <td><code>{row.actor_id||'системна операция'}</code></td>
     <td><code>{row.record_id||'—'}</code></td>
    </tr>)}
   </tbody></table></div>}
   <div className="pagination"><span>Страница {page} · общо {count??0}</span>
    <div>{page>1&&<Link href={'?page='+(page-1)} className="btn ghost">← Назад</Link>}
    {page*50<(count??0)&&<Link href={'?page='+(page+1)} className="btn ghost">Напред →</Link>}</div>
   </div>
  </div>
 </div>;
}
import Link from 'next/link';
import {getContext} from '@/lib/session';

type Row={id:string;label:string;secondary:string;source:string;row:number};
export async function ArchivedPersonnelPeek({compact=false}:{compact?:boolean}){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return null;
 const {data,error}=await ctx.supabase.rpc('ctm_archive_list',{
  p_kind:'employee_sample',p_limit:compact?4:12,p_offset:0
 });
 if(error)return <div className="notice warn">
  Не може да се зареди защитеният архив на служителите.</div>;
 const list=(data||{}) as {total?:number;rows?:Row[]};
 const count=Number(list.total||0);
 const rows=list.rows||[];
 return <section className="overview-card">
  <div className="overview-head">
   <div className="overview-copy"><p className="overview-eyebrow">АРХИВНИ СЛУЖИТЕЛИ · ЗА СВЕРЯВАНЕ</p>
    <h2>Служители от архива <span className="overview-count">{count}</span></h2>
    <p>Запазени в защитения архив · очакват сверяване с работодател</p>
   </div>
   <Link className="overview-action" href="/app/migration/personnel">
    {count?'Виж всички →':'Импортирай Excel →'}
   </Link>
  </div>
  {rows.length>0&&<div className="overview-table-wrap"><table className="overview-table">
   <thead><tr><th>Име от архива</th><th>Фирма по източник</th><th>Досие</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>
    <td>{row.label}</td>
    <td>{row.secondary||'Неустановена'}</td>
    <td><Link href={'/app/migration/archive/'+row.id}>Преглед →</Link></td>
   </tr>)}</tbody>
  </table></div>}
  {count>rows.length&&<div className="overview-footer">Показани {rows.length} от {count} архивни служители</div>}
 </section>;
}

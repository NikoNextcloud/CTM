import Link from 'next/link';
import {getContext} from '@/lib/session';

type Row={id:string;label:string;secondary:string;source:string;row:number};
export async function ArchivedPersonnelPeek({compact=false}:{compact?:boolean}){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return null;
 const {data,error}=await ctx.supabase.rpc('ctm_archive_list',{
  p_kind:'employee_sample',p_limit:compact?5:12,p_offset:0
 });
 if(error)return <div className="notice warn">
  Не може да се зареди защитеният архив на служителите.</div>;
 const list=(data||{}) as {total?:number;rows?:Row[]};
 const count=Number(list.total||0);
 const rows=list.rows||[];
 return <section className="table-panel">
  <div className="section-heading">
   <div><p className="eyebrow">АРХИВНИ СЛУЖИТЕЛИ · ЗА СВЕРЯВАНЕ</p>
    <h2>{count.toLocaleString('bg-BG')} служители от архивни източници</h2>
    <p>Тези хора са в защитения архив. Не са автоматично потвърдени
     като действащи служители в основния регистър.</p>
   </div>
   <Link className="btn primary" href="/app/migration/personnel">
    {count?'Отвори архива →':'Импортирай Excel →'}
   </Link>
  </div>
  {rows.length>0&&<div className="table-wrap"><table>
   <thead><tr><th>Име от архива</th><th>Фирма по източник</th><th>Досие</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>
    <td>{row.label}</td>
    <td>{row.secondary||'Неустановена'}</td>
    <td><Link href={'/app/migration/archive/'+row.id}>Преглед →</Link></td>
   </tr>)}</tbody>
  </table></div>}
  {count>rows.length&&<p className="subnote">Показани {rows.length} от {count} записа.</p>}
 </section>;
}

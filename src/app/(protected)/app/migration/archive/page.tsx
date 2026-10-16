import Link from 'next/link';
import {getContext} from '@/lib/session';
export const dynamic='force-dynamic';

const categories=[
 ['employee_sample','Архивни служители'],
 ['file_manifest','Опис на файлове'],
 ['person_candidate','Лица от документи'],
 ['contract_person','Лица от договори'],
 ['identifier','Идентификатори'],
 ['date_reference','Дати от архиви'],
 ['folder_summary','MEGA — файлове по тип'],
 ['source_company','Фирми от източници'],
 ['source_issue','Несъответствия']
] as const;
type Props={searchParams:Promise<{kind?:string;page?:string}>};
type Entry={id:string;source:string;row:number;label:string;secondary:string};
type PageResult={total:number;rows:Entry[];kind:string};

export default async function ArchiveRegister({searchParams}:Props){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content">
  <div className="notice warn">Архивните данни са достъпни само за администратор.</div>
 </div>;
 const sp=await searchParams;
 const valid=categories.find(x=>x[0]===sp.kind);
 const kind=valid?.[0]||'folder_summary';
 const page=Math.max(1,Math.min(10000,Math.floor(Number(sp.page)||1)));
 const pageSize=25;
 const [statsResult,listResult]=await Promise.all([
  ctx.supabase.rpc('ctm_archive_stats'),
  ctx.supabase.rpc('ctm_archive_list',{
   p_kind:kind,p_limit:pageSize,p_offset:(page-1)*pageSize
  })
 ]);
 const stats=(statsResult.data||{}) as Record<string,number>;
 const list=(listResult.data||{total:0,rows:[],kind}) as PageResult;
 const rows=Array.isArray(list.rows)?list.rows:[];
 // Only the aggregate MEGA inventory needs decrypted file-extension labels.
 const summary=kind==='folder_summary'&&!listResult.error?
  await Promise.all(rows.map(async row=>{
   const r=await ctx.supabase.rpc('ctm_archive_get',{p_record:row.id});
   return !r.error?(r.data as {data?:{extension?:string;file_count?:number}})?.data:null;
  })):null;
 const link=(k:string,p:number)=>
  '/app/migration/archive?'+new URLSearchParams({kind:k,page:String(p)});
 return <div className="content">
  <div className="page-header">
   <div><Link className="back" href="/app/migration">← Миграция</Link>
    <p className="eyebrow">EMS-STM · ИНВЕНТАРИЗАЦИЯ И СВЕРЯВАНЕ</p>
    <h1>Архивни записи</h1>
    <p>Действително съхранени, шифровани редове с произход.
     Архивните хора и документи не се смесват с потвърдените регистри.</p>
   </div>
  </div>
  <div className="notice warn">
   8 650 файла в MEGA са преброени, но това не означава 8 650 внесени документа.
   Категориите отдолу показват точно колко записа са съхранени в Supabase.
  </div>
  <p><Link className="btn primary" href="/app/migration/personnel">
   Импорт на реални служители от XLSX →</Link></p>
  {statsResult.error||listResult.error?
   <div role="alert" className="notice warn">Регистърът не може да се прочете. Провери миграциите и администраторските права.</div>
   :<>
    <div className="metrics">{categories.map(([id,title])=><Link key={id}
     className="metric" href={link(id,1)}>
     <span>{title}</span><strong>{Number(stats[id]||0).toLocaleString('bg-BG')}</strong>
    </Link>)}</div>
    <section className="table-panel">
     <div className="section-heading"><div>
      <h2>{valid?.[1]||'MEGA — файлове по тип'}</h2>
      <p>Общо {list.total||0} архивни записа, показани {rows.length}.</p>
     </div></div>
     {rows.length===0?<div className="empty"><h3>В тази категория няма внесени редове</h3>
      <p>Откритият във външен архив файл не се счита за импортиран,
       докато не е записан успешно тук.</p></div>:
      <div className="table-wrap"><table>
       <thead><tr><th>Запис / разширение</th><th>Източник / брой</th><th>Досие</th></tr></thead>
       <tbody>{rows.map((row,i)=><tr key={row.id}>
        <td>{kind==='folder_summary'?summary?.[i]?.extension||'Неизвестен тип':row.label}</td>
        <td>{kind==='folder_summary'?
         Number(summary?.[i]?.file_count||0).toLocaleString('bg-BG'):
         row.secondary||row.source}</td>
        <td><Link className="company-link" href={'/app/migration/archive/'+row.id}>
         Преглед →</Link></td>
       </tr>)}</tbody>
      </table></div>}
     <nav className="pagination" aria-label="Страници">
      <span>Страница {page}</span>
      <div>{page>1&&<Link className="btn ghost" href={link(kind,page-1)}>← Назад</Link>}
       {page*pageSize<(list.total||0)&&<Link className="btn ghost" href={link(kind,page+1)}>Напред →</Link>}
      </div>
     </nav>
    </section>
   </>}
 </div>;
}

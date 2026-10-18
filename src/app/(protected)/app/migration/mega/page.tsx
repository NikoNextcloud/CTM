import Link from 'next/link';
import {getContext} from '@/lib/session';
export const dynamic='force-dynamic';
type Root={handle:string;name:string;files:number;bytes:number;stored:number};
type Totals={total_files:number;root_groups:number;total_bytes:number;stored_files:number;extracted_files:number;readable_files:number;unsupported_files:number;error_files:number};
type Props={searchParams:Promise<{q?:string;page?:string}>};
const fmt=(v:number)=>Number(v||0).toLocaleString('bg-BG');
const mb=(v:number)=>(Number(v||0)/1048576).toLocaleString('bg-BG',{maximumFractionDigits:1})+' MB';
export default async function MegaPage({searchParams}:Props){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content"><div className="notice warn">Само администратор има достъп до архивните документи.</div></div>;
 const sp=await searchParams;
 const q=(sp.q||'').trim().slice(0,80).toLocaleLowerCase('bg-BG');
 const page=Math.max(1,Math.min(1000,Math.floor(Number(sp.page)||1)));
 const [statsRes,rootRes]=await Promise.all([ctx.supabase.rpc('ctm_mega_summary'),ctx.supabase.rpc('ctm_mega_roots')]);
 const stats=(statsRes.data||{}) as Totals;
 const roots=Array.isArray(rootRes.data)?rootRes.data as Root[]:[];
 const filtered=roots.filter(x=>x.name.toLocaleLowerCase('bg-BG').includes(q));
 const rows=filtered.slice((page-1)*20,page*20);
 const href=(p:number)=>'/app/migration/mega?'+new URLSearchParams({q:sp.q||'',page:String(p)}).toString();
 return <div className="content"><div className="page-header"><div>
  <Link className="back" href="/app/migration">← Миграция</Link><p className="eyebrow">ЗАЩИТЕН ДОКУМЕНТЕН КАТАЛОГ</p>
  <h1>MEGA архив</h1><p>Оригиналите са в MEGA; защитени проверени копия се записват отделно в частния Storage.</p><p><Link className="btn ghost" href="/app/migration/report">Миграционен отчет →</Link></p>
 </div><span className="tag">Само администратор</span></div>
 {statsRes.error||rootRes.error?<div className="notice warn" role="alert">Каталогът не може да бъде прочетен.</div>:<>
 <div className="metrics">
  <div className="metric"><span>Индексирани документи</span><strong>{fmt(stats.total_files)}</strong></div>
  <div className="metric"><span>Групи източници</span><strong>{fmt(stats.root_groups)}</strong></div>
  <div className="metric"><span>Общо файлове</span><strong>{mb(stats.total_bytes)}</strong></div>
  <div className="metric"><span>Оригинали в Storage</span><strong>{fmt(stats.stored_files)}</strong></div>
  <div className="metric"><span>Обработени файлове</span><strong>{fmt(stats.extracted_files)}</strong></div>
  <div className="metric"><span>Текст за преглед</span><strong>{fmt(stats.readable_files)}</strong></div>
  <div className="metric"><span>Неподдържан формат</span><strong>{fmt(stats.unsupported_files)}</strong></div>
  <div className="metric"><span>Грешка при четене</span><strong>{fmt(stats.error_files)}</strong></div>
 </div>
 <div className="notice warn">Архивно име не е доказателство за потвърдена фирма или действащо медицинско заключение. Извлеченият текст се съхранява шифрован и не се приема за потвърдено медицинско заключение. Файловете не се свързват автоматично със служител.</div>
 <section className="table-panel"><div className="section-heading"><div><h2>Папки и източници</h2><p>{filtered.length} групи с документи</p></div></div>
 <form className="searchbar" method="get"><input aria-label="Търси папка" type="search" name="q" maxLength={80} placeholder="Потърси папка…" defaultValue={sp.q||''}/><button className="btn primary">Търси</button></form>
 <div className="table-wrap"><table><thead><tr><th>Източник от MEGA</th><th>Документи</th><th>Обем</th><th>Преглед</th></tr></thead><tbody>
 {rows.map(r=><tr key={r.handle}><td><strong>{r.name}</strong><small className="ctm-archive-subline">За проверка на юридическа идентичност</small></td><td>{fmt(r.files)}</td><td>{mb(r.bytes)}</td><td><Link className="btn ghost" href={'/app/migration/mega/'+r.handle}>Отвори →</Link></td></tr>)}
 </tbody></table></div><nav className="pagination" aria-label="Страници"><span>Страница {page}</span><div>
 {page>1&&<Link className="btn ghost" href={href(page-1)}>← Назад</Link>}
 {page*20<filtered.length&&<Link className="btn ghost" href={href(page+1)}>Напред →</Link>}
 </div></nav></section></>}</div>;
}
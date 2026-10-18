import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getContext} from '@/lib/session';
import {saveMegaOriginalAction} from '@/app/(protected)/app/migration/actions';
export const dynamic='force-dynamic';
type Root={handle:string;name:string;files:number;bytes:number};
type Row={handle:string;name:string;path:string;extension:string;bytes:number;stored:boolean};
type Listing={total:number;files:Row[]};
type Props={params:Promise<{handle:string}>;searchParams:Promise<{page?:string;copy?:string}>};
const count=(n:number)=>Number(n||0).toLocaleString('bg-BG');
export default async function MegaFiles({params,searchParams}:Props){
 const {handle}=await params;
 if(!/^[A-Za-z0-9_-]{8,32}$/.test(handle))notFound();
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content"><div className="notice warn">Само администратор има достъп.</div></div>;
 const sp=await searchParams;
 const page=Math.max(1,Math.min(100000,Math.floor(Number(sp.page)||1)));
 const [rootsResult,listResult]=await Promise.all([
  ctx.supabase.rpc('ctm_mega_roots'),
  ctx.supabase.rpc('ctm_mega_root_files',{p_root_handle:handle,p_limit:40,p_offset:(page-1)*40})
 ]);
 const roots=Array.isArray(rootsResult.data)?rootsResult.data as Root[]:[];
 const root=roots.find(x=>x.handle===handle);
 if(!root&&!rootsResult.error)notFound();
 const listing=(listResult.data||{total:0,files:[]}) as Listing;
 const rows=Array.isArray(listing.files)?listing.files:[];
 return <div className="content"><div className="page-header"><div>
  <Link className="back" href="/app/migration/mega">← MEGA архив</Link><p className="eyebrow">ОПИС НА ОРИГИНАЛНИТЕ ДОКУМЕНТИ</p>
  <h1>{root?.name||'Архивни файлове'}</h1><p>{count(root?.files||0)} документа</p>
 </div><span className="tag">Изисква проверка</span></div>
 {sp.copy==='stored'&&<div className="notice" role="status">Оригиналният файл е съхранен в частния Storage. SHA-256 е проверен след повторно изтегляне.</div>}
 {sp.copy?.startsWith('error-')&&<div className="notice warn" role="alert">Оригиналът не беше копиран. Провери наличната Storage квота, връзката с MEGA и правата на администратора.</div>}
 <div className="notice warn">Медицинските сведения и принадлежността към работодател не са потвърдени само от имената на тези файлове.</div>
 {root&&<p><Link className="btn ghost" href={'/app/migration/companies?q='+encodeURIComponent(root.name)}>Провери фирмените кандидати →</Link></p>}
 {rootsResult.error||listResult.error?<div role="alert" className="notice warn">Неуспешно зареждане на файловете.</div>:
 <section className="table-panel"><h2>Документи ({count(listing.total)})</h2>
 <div className="table-wrap"><table><thead><tr><th>Име / произход</th><th>Тип</th><th>Размер</th><th>Съхранение</th><th>Действие</th></tr></thead><tbody>
 {rows.map(f=><tr key={f.handle}><td><strong>{f.name}</strong><small className="ctm-archive-subline">{f.path}</small></td><td>{f.extension.toUpperCase()||'—'}</td><td>{count(f.bytes)} B</td><td>{f.stored?'Storage · SHA-256 проверен':'Оригинал само в MEGA'}</td><td>
 <div className="ctm-archive-file-actions">
  <a className="btn ghost" rel="nofollow" href={'/api/mega/file/'+f.handle}>Изтегли ↓</a>
  {!f.stored&&f.bytes>0&&f.bytes<=52428800&&<form action={saveMegaOriginalAction}>
   <input type="hidden" name="handle" value={f.handle}/>
   <input type="hidden" name="root" value={handle}/>
   <button type="submit" className="btn primary">Съхрани оригинала</button>
  </form>}
 </div></td></tr>)}
 </tbody></table></div>
 <nav className="pagination"><span>Страница {page} · {count(listing.total)} документа</span><div>
 {page>1&&<Link className="btn ghost" href={'?page='+(page-1)}>← Назад</Link>}
 {page*40<listing.total&&<Link className="btn ghost" href={'?page='+(page+1)}>Напред →</Link>}
 </div></nav></section>}</div>;
}
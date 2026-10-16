import Link from 'next/link';
import {getContext} from '@/lib/session';
import {ArchivePersonnelImporter} from '@/components/archive-personnel-importer';

export const dynamic='force-dynamic';
type Props={searchParams:Promise<{page?:string}>};
type PersonRow={id:string;source:string;row:number;label:string;secondary:string};
type PageData={total:number;rows:PersonRow[];kind:string};

export default async function ArchivePersonnelPage({searchParams}:Props){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content">
  <div className="notice warn">Само администратор може да импортира или преглежда архивните лични данни.</div>
 </div>;
 const sp=await searchParams;
 const page=Math.max(1,Math.min(10000,Math.floor(Number(sp.page)||1)));
 const limit=25;
 const [listResult,statsResult]=await Promise.all([
  ctx.supabase.rpc('ctm_archive_list',{p_kind:'employee_sample',p_limit:limit,p_offset:(page-1)*limit}),
  ctx.supabase.rpc('ctm_archive_stats')
 ]);
 const list=(listResult.data||{total:0,rows:[],kind:'employee_sample'}) as PageData;
 const rows=Array.isArray(list.rows)?list.rows:[];
 const stats=(statsResult.data||{}) as Record<string,number>;
 return <div className="content">
  <div className="page-header">
   <div><Link href="/app/migration" className="back">← Миграция</Link>
    <p className="eyebrow">EMS-STM · ЗАЩИТЕН ИМПОРТ</p>
    <h1>Служители и медицински данни от архивите</h1>
    <p>Качи Excel, провери колоните, съхрани цялата налична информация
     и прегледай архивните досиета. Не се губят ЕГН, ТЕЛК или допълнителни бележки.</p>
   </div>
   <span className="tag">Архив · {stats.employee_sample||0} записа</span>
  </div>
  <div className="ctm-import-clarity">
   <strong>Как работи импортът?</strong> Избери Excel → прегледай автоматично разпознатите колони → провери броя редове → запиши в защитения архив.
   <p>Архивните записи са отделени от регистъра на действащите служители. Когато
   ЕИК и принадлежността към фирма са проверени, досиетата могат да се
   свързват с потвърдените работодатели. Не се активират автоматично.</p>
  </div>
  <ArchivePersonnelImporter/>
  <section className="table-panel">
   <div className="section-heading"><div>
    <h2>Архивни служители ({list.total||0}) · преглед и редакция</h2>
    <p>Отвори всеки служител за редакция на административните и медицинските полета с история на промените. Това са действително записаните в защитената база редове, а не само
     намерени във файл данни.</p></div>
    <Link href="/app/migration/archive" className="btn ghost">Всички архивни категории →</Link>
   </div>
   {listResult.error?<div className="notice warn" role="alert">Грешка при зареждане. Провери SQL миграцията и правата.</div>:
    rows.length===0?<div className="empty"><h3>Още няма внесени архивни служители</h3>
     <p>Избери оригиналния XLSX по-горе. Вносът се отразява тук след успешна проверка.</p>
    </div>:<div className="table-wrap"><table>
     <thead><tr><th>Служител от архива</th><th>Фирма от източника</th><th>Източник</th><th>Преглед</th></tr></thead>
     <tbody>{rows.map(person=><tr key={person.id}>
      <td>{person.label}</td><td>{person.secondary||'Няма доказана фирма'}</td>
      <td>{person.source.slice(0,18)}…</td>
      <td><Link className="company-link" href={'/app/migration/archive/'+person.id}>Преглед</Link> · <Link className="btn ghost" href={'/app/migration/archive/'+person.id+'#archive-edit'}>✎ Редактирай</Link></td>
     </tr>)}</tbody>
    </table></div>}
   <nav className="pagination" aria-label="Страници архивни служители">
    <span>Страница {page} · {list.total||0} реда</span>
    <div>{page>1&&<Link className="btn ghost" href={'?page='+(page-1)}>← Назад</Link>}
     {page*limit<(list.total||0)&&<Link className="btn ghost" href={'?page='+(page+1)}>Напред →</Link>}
    </div>
   </nav>
  </section>
 </div>;
}

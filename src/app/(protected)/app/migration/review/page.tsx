import Link from 'next/link';
import {getContext} from '@/lib/session';
export const dynamic='force-dynamic';
type ReviewGroup={kind:'company_candidate'|'archived_employee';reason:string;state:string;count:number};
type ReviewSummary={total:number;groups:ReviewGroup[]};
const reasons:Record<string,{title:string;explanation:string;url:string}>={
 ambiguous_legal_identity:{title:'Нееднозначна фирмена идентичност',explanation:'Нужно е доказателство за точния ЕИК и юридическото лице.',url:'/app/migration/companies?status=pending'},
 missing_eik_evidence:{title:'Липсва проверен ЕИК',explanation:'Открий юридическото лице от оригинален документ и официалния регистър.',url:'/app/migration/companies?status=pending'},
 unverified_eik_or_employer:{title:'ЕИК и работодател за потвърждаване',explanation:'Предложеният ЕИК не доказва автоматично архивната работодателска връзка.',url:'/app/migration/companies?status=pending'},
 employer_and_identity_unverified:{title:'Архивни служители за съпоставяне',explanation:'Провери самоличност, съответствие на работодателя и липса на дублиране.',url:'/app/migration/personnel'}
};
export default async function MigrationReviewPage(){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content"><div className="notice warn">Достъп само за администратор.</div></div>;
 const result=await ctx.supabase.rpc('ctm_migration_review_queue_summary');
 const stats=(result.data||{total:0,groups:[]}) as ReviewSummary;
 const rows=Array.isArray(stats.groups)?stats.groups:[];
 return <div className="content">
  <div className="page-header"><div><Link className="back" href="/app/migration">← Миграция</Link>
  <p className="eyebrow">ЗАЩИТЕН КОНТРОЛ НА МИГРАЦИЯТА</p>
  <h1>Фирми и служители за проверка</h1>
  <p>Проследяване на всички непотвърдени записи. Оригиналните архиви остават непроменени.</p></div><span className="tag">Само администратор</span></div>
  {result.error?<div className="notice warn" role="alert">Неуспешна справка за миграцията. Записите не са изменени.</div>:<>
  <section className="metrics">
   <div className="metric"><span>Изискват доказателства</span><strong>{Number(stats.total||0).toLocaleString('bg-BG')}</strong></div>
   <div className="metric"><span>Фирмени кандидати</span><strong>{rows.filter(x=>x.kind==='company_candidate').reduce((s,x)=>s+x.count,0).toLocaleString('bg-BG')}</strong></div>
   <div className="metric"><span>Архивни служители</span><strong>{rows.filter(x=>x.kind==='archived_employee').reduce((s,x)=>s+x.count,0).toLocaleString('bg-BG')}</strong></div>
  </section>
  <div className="notice warn">Предложенията от документи и имена на папки не са доказателства за работодател. Не потвърждавай фирма или служител без официален ЕИК, първичен документ и проверка на възможните дубликати. Медицинските заключения остават архивни.</div>
  <section className="table-panel"><h2>Контролни групи</h2><div className="table-wrap"><table>
   <thead><tr><th>Причина за проверка</th><th>Записи</th><th>Статус</th><th>Следващо действие</th></tr></thead>
   <tbody>{rows.map((item,i)=>{const info=reasons[item.reason];return <tr key={i}>
    <td><strong>{info?.title||'Нужна проверка'}</strong><small className="ctm-archive-subline">{info?.explanation||'Провери първичния източник.'}</small></td>
    <td>{item.count.toLocaleString('bg-BG')}</td>
    <td>Изисква проверка</td>
    <td><Link className="btn ghost" href={info?.url||'/app/migration'}>Прегледай →</Link></td>
   </tr>})}</tbody>
  </table></div></section>
  <p className="subnote">Контролният списък не променя и не активира основните регистри. Потвърждаването се изпълнява в съответните досиета, с отделна авторизация и одит.</p>
  </>}
 </div>;
}

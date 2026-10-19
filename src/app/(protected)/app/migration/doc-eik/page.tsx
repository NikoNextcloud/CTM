import Link from 'next/link';
import {getContext} from '@/lib/session';

export const dynamic='force-dynamic';

type EvidenceItem={
 candidate_id:string;name:string;eik:string;source_root:string;
 supporting_documents:number;name_matches:number;secondary_match_count:number;
 secondary_registry_names:Record<string,string|number>;
 review_state:string;already_proposed_elsewhere:number;checked_at:string;
};
type Totals={
 proposals:number;candidates:number;secondary_two:number;secondary_one:number;
 same_document_name:number;needs_review:number;
};
type Props={searchParams:Promise<{q?:string;kind?:string}>};
const choices=['all','two','one','conflict','same-document','review'] as const;
const isEik=(v:string)=>/^[0-9]{9}$/.test(v);
const isRoot=(v:string)=>/^[A-Za-z0-9_-]{8,32}$/.test(v);
const n=(v:number)=>Number(v||0).toLocaleString('bg-BG');
const directory=(eik:string,site:'registri'|'ukazatelite')=>
 site==='registri'?'https://registri.bg/bg/companies/'+eik+'/':'https://www.ukazatelite.com/'+eik;

export default async function EikEvidencePage({searchParams}:Props){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content">
  <div className="notice warn" role="alert">Достъпът до документните ЕИК предложения е разрешен само на администратор.</div>
 </div>;
 const sp=await searchParams;
 const q=(sp.q||'').trim().slice(0,80).toLocaleLowerCase('bg-BG');
 const kind=choices.includes((sp.kind||'all') as typeof choices[number])?sp.kind||'all':'all';
 const [summaryResponse,listResponse]=await Promise.all([
  ctx.supabase.rpc('ctm_candidate_doc_eik_summary'),
  ctx.supabase.rpc('ctm_candidate_doc_eik_list')
 ]);
 const stats=(summaryResponse.data||{}) as Totals;
 const items=Array.isArray(listResponse.data)?listResponse.data as EvidenceItem[]:[];
 const filtered=items.filter(item=>{
  if(q&&!item.name.toLocaleLowerCase('bg-BG').includes(q)&&!item.eik.includes(q))return false;
  if(kind==='two'&&item.secondary_match_count!==2)return false;
  if(kind==='one'&&item.secondary_match_count!==1)return false;
  if(kind==='conflict'&&item.already_proposed_elsewhere===0&&item.review_state!=='conflicting_identity')return false;
  if(kind==='same-document'&&item.name_matches<1)return false;
  if(kind==='review'&&item.review_state==='approved_by_reviewer')return false;
  return true;
 });
 return <div className="content">
  <div className="page-header"><div>
   <Link className="back" href="/app/migration/checks">← Фирмени проверки</Link>
   <p className="eyebrow">EMS-STM · ДОКУМЕНТНИ ЕИК ПРЕДЛОЖЕНИЯ</p>
   <h1>ЕИК, открити в оригиналните документи</h1>
   <p>Кандидатите с липсващ ЕИК се проверяват по архивните файлове, после по независими публични справки.</p>
  </div><span className="tag">Само администратор · не е потвърден ТР</span></div>
  {summaryResponse.error||listResponse.error?<div className="notice warn" role="alert">Неуспешно зареждане на защитените документни доказателства.</div>:<>
   <section className="metrics" aria-label="Документни предложения">
    <div className="metric"><span>ЕИК предложения</span><strong>{n(stats.proposals)}</strong></div>
    <div className="metric"><span>Различни архивни кандидати</span><strong>{n(stats.candidates)}</strong></div>
    <div className="metric"><span>Две публични справки</span><strong>{n(stats.secondary_two)}</strong></div>
    <div className="metric"><span>Име и ЕИК в един документ</span><strong>{n(stats.same_document_name)}</strong></div>
   </section>
   <div className="notice warn">
    <strong>Документен ЕИК е предложение, не потвърждение.</strong> Един архив може да съдържа ЕИК на изпълнител,
    издател или различно юридическо лице. ЕИК, който се повтаря в множество несвързани фирмени папки,
    е изключен от автоматичното предлагане. Преди потвърждение провери
    <a href="https://portal.registryagency.bg/bg/home-cr" target="_blank" rel="noopener noreferrer"> актуалното състояние в ТРРЮЛНЦ ↗</a>,
    работодателския договор и възможните дубликати.
   </div>
   <section className="table-panel"><div className="section-heading"><div>
    <h2>Открити съвпадения ({filtered.length})</h2>
    <p>Наличието на два публични справочника не замества официална регистрационна проверка.</p>
   </div></div>
    <form className="searchbar" method="get">
     <input name="q" type="search" maxLength={80} aria-label="Търси фирма или ЕИК" placeholder="Търси фирма или ЕИК…" defaultValue={sp.q||''}/>
     <select name="kind" defaultValue={kind} aria-label="Покажи резултати">
      <option value="all">Всички предложения</option>
      <option value="two">Два публични източника</option>
      <option value="one">Един публичен източник</option>
      <option value="same-document">Име и ЕИК в един документ</option>
      <option value="conflict">Дублиращ ЕИК / конфликт</option>
      <option value="review">Изискват проверка</option>
     </select>
     <button className="btn primary" type="submit">Филтрирай</button>
    </form>
    {filtered.length===0?<div className="empty"><h3>Няма предложения за този филтър</h3></div>:
    <div className="table-wrap"><table><thead><tr>
     <th>Фирма от архив</th><th>Предложен ЕИК</th><th>Документна основа</th>
     <th>Публични проверки</th><th>Действия</th>
    </tr></thead><tbody>
     {filtered.map(item=><tr key={item.candidate_id+'-'+item.eik}>
      <td><strong>{item.name}</strong>
       <small className="ctm-archive-subline">
        {item.already_proposed_elsewhere>0
         ?'Възможен дубликат: ЕИК е предложен и за друг фирмен кандидат'
         :'Изисква актуална регистрационна справка'}
       </small>
      </td>
      <td>{item.eik}<small className="ctm-archive-subline">{item.review_state==='requires_original_check'?'Има несъответствия':'Не е юридически потвърден'}</small></td>
      <td>{n(item.supporting_documents)} документ(а)
       <small className="ctm-archive-subline">{n(item.name_matches)} съдържат и архивното фирмено име</small>
      </td>
      <td>{item.secondary_match_count===2?'Два справочника':item.secondary_match_count===1?'Един справочник':'Изисква допълнително съпоставяне'}
       <small className="ctm-archive-subline">
        {String(item.secondary_registry_names?.registri_name||'')}
       </small>
       {isEik(item.eik)&&<>
        <a href={directory(item.eik,'registri')} target="_blank" rel="noopener noreferrer nofollow">Справочник 1 ↗</a>{' '}
        <a href={directory(item.eik,'ukazatelite')} target="_blank" rel="noopener noreferrer nofollow">Справочник 2 ↗</a>
       </>}
      </td>
      <td><div className="ctm-eik-actions">
       {isRoot(item.source_root)&&<Link className="btn ghost" href={'/app/migration/companies?status=all&q='+encodeURIComponent(item.name)}>Архивен кандидат →</Link>}
       <Link className="btn ghost" href={'/app/migration/companies?status=all&q='+encodeURIComponent(item.name)}>Кандидат →</Link>
      </div></td>
     </tr>)}
    </tbody></table></div>}
   </section>
  </>}
 </div>;
}


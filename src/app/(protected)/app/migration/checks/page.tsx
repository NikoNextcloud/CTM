import Link from 'next/link';
import {getContext} from '@/lib/session';

export const dynamic='force-dynamic';

type FirmCheck={
 candidate_id:string;name:string;proposed_eik:string|null;result_code:string;
 source_1_url:string|null;source_2_url:string|null;govt_eik_match:boolean;
 govt_eik_source:string|null;review_status:string;checked_at:string;
 duplicate_eik_candidates:number;
};
type Totals={total:number;two_secondary_exact:number;one_secondary_exact:number;name_mismatch:number;no_eik:number;government_eik_corroborated:number};
type Props={searchParams:Promise<{q?:string;kind?:string;page?:string}>};
const status:Record<string,string>={
 two_secondary_exact:'Два публични източника · не е проверен ТР',
 one_secondary_exact:'Един публичен източник · не е проверен ТР',
 eik_found_name_mismatch:'Разминаване в наименованието',
 no_eik:'Няма установен ЕИК',
 not_accessible:'Публичните източници са недостъпни'
};
const allowed=new Set(['all',...Object.keys(status)]);
const safeUrl=(v:string|null)=>v?.startsWith('https://')?v:null;
export default async function FirmChecks({searchParams}:Props){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content"><div className="notice warn">Само администратор има достъп до тези проверки.</div></div>;
 const p=await searchParams;
 const q=(p.q||'').trim().slice(0,80).toLocaleLowerCase('bg-BG');
 const kind=allowed.has(p.kind||'')?p.kind!:'all';
 const page=Math.max(1,Math.min(1000,Math.floor(Number(p.page)||1)));
 const [counts,records]=await Promise.all([
  ctx.supabase.rpc('ctm_company_public_checks_summary'),
  ctx.supabase.rpc('ctm_company_public_checks_list',{p_limit:100,p_offset:0})
 ]);
 const total=(counts.data||{}) as Totals;
 const all=Array.isArray(records.data)?records.data as FirmCheck[]:[];
 const filtered=all.filter(r=>(kind==='all'||r.result_code===kind)&&
  (r.name.toLocaleLowerCase('bg-BG').includes(q)||(r.proposed_eik||'').includes(q)))
  .sort((a,b)=>a.name.localeCompare(b.name,'bg')||a.candidate_id.localeCompare(b.candidate_id));
 const rows=filtered.slice((page-1)*25,page*25);
 const url=(next:number)=>'/app/migration/checks?'+new URLSearchParams({q:p.q||'',kind,page:String(next)}).toString();
 return <div className="content">
  <div className="page-header"><div><Link className="back" href="/app/migration/companies">← Фирми за проверка</Link>
   <p className="eyebrow">ПЪЛЕН РЕГИСТЪР НА ПУБЛИЧНИТЕ ПРОВЕРКИ</p>
   <h1>Фирми — ЕИК и източници</h1>
   <p>Справки за 91 фирмени кандидата със статус и документни препратки.</p>
  </div><span className="tag">Само администратор</span></div>
  {counts.error||records.error?<div role="alert" className="notice warn">Не може да се зареди защитената фирмена справка.</div>:<>
   <section className="metrics">
    <div className="metric"><span>Проверени кандидати</span><strong>{total.total||0}</strong></div>
    <div className="metric"><span>Два публични източника</span><strong>{total.two_secondary_exact||0}</strong></div>
    <div className="metric"><span>Един публичен източник</span><strong>{total.one_secondary_exact||0}</strong></div>
    <div className="metric"><span>Различно наименование</span><strong>{total.name_mismatch||0}</strong></div>
    <div className="metric"><span>Без ЕИК</span><strong>{total.no_eik||0}</strong></div>
    <div className="metric"><span>Име и ЕИК в държавен документ</span><strong>{total.government_eik_corroborated||0}</strong></div>
   </section>
   <p><Link className="btn primary" href="/app/migration/doc-eik">ЕИК от архивните документи →</Link></p><div className="notice warn">Съвпадение по име и ЕИК в публичен справочник <strong>не е равнозначно на актуална справка</strong> в Търговския регистър. Договор със СТМ или принадлежност на служители трябва да се удостоверяват отделно.</div>
   <section className="table-panel"><h2>Източници и несъответствия · {filtered.length} резултата</h2>
    <form className="searchbar" method="get">
     <input aria-label="Фирма или ЕИК" type="search" name="q" maxLength={80} placeholder="Име или ЕИК…" defaultValue={p.q||''}/>
     <select aria-label="Статус на проверката" name="kind" defaultValue={kind}>
      <option value="all">Всички резултати</option>
      {Object.entries(status).map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select><button type="submit" className="btn primary">Търси</button>
    </form>
    {total.total>all.length&&<p role="alert" className="notice warn">Показани са само първите {all.length} записа.</p>}
    {rows.length===0?<div className="empty"><h3>Няма резултати за този филтър</h3></div>:
     <div className="table-wrap"><table><thead><tr>
      <th>Архивно наименование</th><th>Предложен ЕИК</th><th>Резултат</th><th>Публични източници</th><th>Контрол</th>
     </tr></thead><tbody>{rows.map(row=><tr key={row.candidate_id}>
      <td><strong>{row.name}</strong><small className="ctm-archive-subline">{row.review_status==='verified'?'Име и ЕИК свързани с неактивна фирма':'Изисква проверка'}{row.duplicate_eik_candidates>1?' · '+row.duplicate_eik_candidates+' кандидата с този ЕИК':''}</small></td>
      <td>{row.proposed_eik||'—'}</td>
      <td><span className="tag">{status[row.result_code]||'За проверка'}</span>
       {row.govt_eik_match&&<small className="ctm-archive-subline">Име и ЕИК са потвърдени в държавен източник</small>}</td>
      <td>{safeUrl(row.source_1_url)&&<a href={row.source_1_url!} target="_blank" rel="noopener noreferrer nofollow">Справочник 1 ↗</a>}{' '}
       {safeUrl(row.source_2_url)&&<a href={row.source_2_url!} target="_blank" rel="noopener noreferrer nofollow">Справочник 2 ↗</a>}{' '}
       {safeUrl(row.govt_eik_source)&&<a href={row.govt_eik_source!} target="_blank" rel="noopener noreferrer nofollow">Държавен документ ↗</a>}
       {!row.source_1_url&&!row.source_2_url&&<span>ЕИК не е намерен</span>}
       <small className="ctm-archive-subline">Проверено: {new Date(row.checked_at).toLocaleDateString('bg-BG')}</small></td>
      <td><Link className="btn ghost" href={'/app/migration/companies?status=all&q='+encodeURIComponent(row.name)}>Отвори кандидата →</Link></td>
     </tr>)}</tbody></table></div>}
    <nav className="pagination" aria-label="Страници на фирмените справки"><span>Страница {page} · {filtered.length} записа</span>
     <div>{page>1&&<Link className="btn ghost" href={url(page-1)}>← Назад</Link>}
      {page*25<filtered.length&&<Link className="btn ghost" href={url(page+1)}>Напред →</Link>}</div>
    </nav>
   </section>
  </>}
 </div>;
}

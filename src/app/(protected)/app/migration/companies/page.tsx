import Link from 'next/link';
import {getContext} from '@/lib/session';
import {CompanyCandidateImport} from '@/components/company-candidate-import';
import {
 CompanyCandidateReview,type CompanyCandidate,type PublicResearch
} from '@/components/company-candidate-review';

export const dynamic='force-dynamic';
const validStatuses=new Set(['all','pending','conflict','verified','excluded']);
type Props={searchParams:Promise<{q?:string;status?:string;page?:string}>};

export default async function CompanyCandidatePage({searchParams}:Props){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content">
  <div className="notice warn">Само администратор може да разглежда и потвърждава архивни фирми.</div>
 </div>;
 const sp=await searchParams;
 const status=validStatuses.has(sp.status||'')?sp.status!:'pending';
 const q=(sp.q||'').trim().slice(0,80).replace(/[%_,]/g,'');
 const page=Math.max(1,Math.min(10000,Math.floor(Number(sp.page)||1)));
 const limit=25;
 let request=ctx.supabase.from('ctm_company_candidates').select(
  'id,name,normalized_name,source_kind,source_label,confidence,review_status,eik,review_note,promoted_company_id',
  {count:'exact'}
 ).eq('tenant_id',ctx.tenant);
 if(status!=='all')request=request.eq('review_status',status);
 if(q)request=request.ilike('name','%'+q+'%');
 const [result,duplicates]=await Promise.all([
  request.order('created_at',{ascending:false}).order('id').range((page-1)*limit,page*limit-1),
  ctx.supabase.from('ctm_company_candidates')
   .select('normalized_name',{count:'exact'}).eq('tenant_id',ctx.tenant).limit(2000)
 ]);
 const rows=(result.data||[]) as unknown as CompanyCandidate[];
 const duplicatesByName=new Map<string,number>();
 for(const row of duplicates.data??[]){
  const normalized=String(row.normalized_name||'').trim().toLowerCase();
  if(normalized)duplicatesByName.set(normalized,(duplicatesByName.get(normalized)||0)+1);
 }
 const researchIds=rows.map(x=>x.id);
 const researchResponse=researchIds.length?
  await ctx.supabase.from('ctm_company_research')
   .select('candidate_id,proposed_eik,public_name,public_city,source_url,research_state,comment')
   .eq('tenant_id',ctx.tenant).in('candidate_id',researchIds):null;
 const researchById=new Map<string,PublicResearch>(
   ((researchResponse?.data||[]) as PublicResearch[]).map(x=>[x.candidate_id,x])
 );
 const researchStats=await ctx.supabase.from('ctm_company_research')
  .select('candidate_id,research_state',{count:'exact'})
  .eq('tenant_id',ctx.tenant).eq('research_state','suggested');
 const count=result.count??0;
 const link=(nextPage:number,nextStatus=status)=>{
  const query=new URLSearchParams({status:nextStatus,page:String(nextPage)});
  if(q)query.set('q',q);
  return '/app/migration/companies?'+query.toString();
 };
 return <div className="content">
  <div className="page-header"><div>
   <Link className="back" href="/app/migration">← Обратно към миграцията</Link>
   <p className="eyebrow">EMS-STM · КОНТРОЛ НА ФИРМЕНИЯ РЕГИСТЪР</p>
   <h1>Фирми за съпоставяне</h1>
   <p>Кандидатите остават отделени от активните фирми до проверка на ЕИК, наименованието и документа.</p>
  </div><span className="tag">{count} записа · {status}</span></div>

  <div className="notice warn">
   Името на папка не доказва юридическа идентичност. Потвърждавай ЕИК само след проверка
   в първичен източник. Новите фирми се създават неактивни, а свързването се одитира
   и е защитено срещу повторение. Реални медицински записи не се пренасят от този екран.
  </div>

  <div className="ctm-company-research-summary">
   <strong>Публично проучване за фирмите</strong>
   <p>{researchStats.count??0} архивни кандидата имат предложен ЕИК с източник.
    Всички предложения изискват потвърждаване на официалния ЕИК и юридическото лице.
    Сходни имена, променени правни форми и архивни папки не се приемат автоматично за едно дружество.</p>
  </div>
  <div className="table-panel"><div className="section-heading"><div><h2>Публично проучване на всички 91 кандидата</h2><p>Източници, ЕИК, дубликати и разминавания по всяка фирма.</p></div><Link className="btn primary" href="/app/migration/checks">Всички фирмени проверки →</Link></div></div><p><Link className="btn ghost" href="/app/migration/doc-eik">Документни ЕИК предложения с доказателства →</Link></p><CompanyCandidateImport/>

  <section className="table-panel transfer-panel">
   <form className="searchbar" method="get">
    <label>Име на фирма<input aria-label="Търси фирма" type="search" name="q" defaultValue={q}
     placeholder="Наименование" maxLength={80}/></label>
    <label>Статус<select name="status" defaultValue={status}>
     <option value="pending">Чака проверка</option>
     <option value="conflict">Конфликт</option>
     <option value="verified">Потвърдена</option>
     <option value="excluded">Изключена</option>
     <option value="all">Всички</option>
    </select></label>
    <button className="btn primary" type="submit">Филтрирай</button>
   </form>
   <p className="subnote">Показва се само информация от разрешения ти tenant.
    Подобните имена и липсващите ЕИК изискват ръчен преглед.</p>
  </section>

  {duplicates.error&&<div className="notice warn">Дублиращите се имена не са проверени — не потвърждавай кандидати, преди тази проверка да е налична.</div>}
  {!duplicates.error&&(duplicates.count||0)>2000&&
   <div className="notice warn">Има над 2000 кандидата: групирането на имена е непълно. Приключи проверката след пълен одит.</div>}
  {result.error?<div className="notice warn">Неуспешно зареждане на кандидатите. Провери миграцията и RLS.</div>
   :rows.length===0?<div className="empty"><h3>Няма кандидати за този филтър</h3>
      <p>Опитай друг статус или търсене.</p></div>
   :<div className="candidate-list">{rows.map(candidate=><CompanyCandidateReview
      key={candidate.id} candidate={candidate}
      duplicateCount={duplicatesByName.get((candidate.normalized_name||'').trim().toLowerCase())||1}
      research={researchById.get(candidate.id)}
    />)}</div>}
  <nav className="pagination" aria-label="Страници на кандидатите">
   <span>Страница {page} · общо {count} кандидата</span>
   <div>{page>1&&<Link className="btn ghost" href={link(page-1)}>← Назад</Link>}
    {page*limit<count&&<Link className="btn ghost" href={link(page+1)}>Напред →</Link>}</div>
  </nav>
 </div>;
}


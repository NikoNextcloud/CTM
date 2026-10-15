import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getContext} from '@/lib/session';
import {EditRiskPanel} from '@/components/edit-panels';
export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default async function RiskDetail({params}:Props){
 const {id}=await params;if(!uuid(id))notFound();
 const ctx=await getContext();if(!ctx.tenant)notFound();
 const {data,error}=await ctx.supabase.from('risk_assessments')
  .select('id,company_id,revision,workplace,hazard,risk_level,protective_measures,assessment_date,review_due,status')
  .eq('tenant_id',ctx.tenant).eq('id',id).maybeSingle();
 if(error||!data)notFound();
 const canEdit=['admin','specialist'].includes(ctx.role);
 return <div className="content">
  <Link href="/app/risks" className="back">← Оценки на риска</Link>
  <div className="page-header"><div><p className="eyebrow">ПРОЕКТ НА ОЦЕНКА НА РИСКА</p>
   <h1>{data.hazard}</h1><p>Работно място: {data.workplace||'—'} · Ниво: {data.risk_level}</p>
  </div><span className="tag">{data.status==='review'?'За преглед':'Проект'}</span></div>
  <p><Link href={'/app/companies/'+data.company_id} className="company-link">Към фирменото досие →</Link></p>
  <div className="table-panel risk-detail"><h2 className="company-section-title">Описание</h2>
   <div className="company-empty"><strong>Защитни мерки:</strong> {data.protective_measures||'Не са описани'}</div>
   <div className="company-empty">Дата: {data.assessment_date} · Преглед до: {data.review_due||'Не е определен'}</div>
  </div>
  <div className="notice warn">Това не е нормативно одобрена оценка и няма статут на медицински документ. Не въвеждай лични или здравни сведения.</div>
  {canEdit&&<EditRiskPanel risk={data}/>}
 </div>;
}
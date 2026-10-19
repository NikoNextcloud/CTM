import Link from 'next/link';
import {getContext} from '@/lib/session';
export const dynamic='force-dynamic';

type Stats={
 source_files:number;source_bytes:number;stored_files:number;stored_bytes:number;
 source_xlsx_in_zip:number;archived_employees:number;linked_pending:number;
 unresolved:number;potential_zip_matches:number;clinical_promoted:number;
};
type ReviewGroup={kind:string;reason:string;state:string;count:number};
type Review={total:number;groups:ReviewGroup[]};
const num=(v:number)=>Number(v||0).toLocaleString('bg-BG');
const gb=(b:number)=>((Number(b)||0)/1073741824).toLocaleString('bg-BG',{maximumFractionDigits:2})+' GB';
const msg:Record<string,string>={
 invalid_egn_document_verification:'Невалидно ЕГН — необходим официален документ',
 missing_egn_document_verification:'Липсва ЕГН — самоличността не е потвърдена',
 not_in_secondary_employee_document:'Не е потвърден във втори източник',
 linked_pending_employment_and_clinical_review:'Документно свързан — все още непотвърден',
 linked_pending_zip_secondary_document:'ZIP документно свързан — все още непотвърден',
};
export default async function MigrationReport(){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return <div className="content">
  <div className="notice warn" role="alert">Този отчет се вижда само от администратор.</div>
 </div>;
 const [state,queue,companies]=await Promise.all([
  ctx.supabase.rpc('ctm_archive_completion_summary'),
  ctx.supabase.rpc('ctm_migration_review_queue_summary'),
  ctx.supabase.from('ctm_company_candidates').select('id',{head:true,count:'exact'}).eq('review_status','pending').eq('tenant_id',ctx.tenant)
 ]);
 const stats=(state.data||{}) as Stats;
 const groups=((queue.data||{}) as Review).groups||[];
 const unsafe=Boolean(state.error||queue.error||companies.error);
 return <div className="content">
  <div className="page-header"><div><Link href="/app/migration" className="back">← Миграция</Link>
   <p className="eyebrow">CTM · ДОКАЗАТЕЛСТВЕН МИГРАЦИОНЕН ОТЧЕТ</p>
   <h1>Миграция на документи и служители</h1>
   <p>Живи стойности от Supabase, отделени по статус, с проследим оригинален източник.</p>
  </div><span className="tag">Частично завършена миграция</span></div>
  {unsafe?<div className="notice warn" role="alert">Невъзможно е да се потвърдят текущите данни. Провери SQL миграцията и правата.</div>:<>
   <section className="metrics">
    <div className="metric"><span>Индексирани оригинални файла</span><strong>{num(stats.source_files)}</strong></div>
    <div className="metric"><span>SHA-256 проверени копия в Storage</span><strong>{num(stats.stored_files)}</strong></div>
    <div className="metric"><span>Защитено прехвърлен обем</span><strong>{gb(stats.stored_bytes)}</strong></div>
    <div className="metric"><span>Архивни служители</span><strong>{num(stats.archived_employees)}</strong></div>
    <div className="metric"><span>Свързани · чакат потвърждение</span><strong>{num(stats.linked_pending)}</strong></div>
    <div className="metric"><span>Нерешени архивни служители</span><strong>{num(stats.unresolved)}</strong></div>
    <div className="metric"><span>ZIP таблици в защитен архив</span><strong>{num(stats.source_xlsx_in_zip)}</strong></div>
    <div className="metric"><span>Допълнителни ZIP съвпадения</span><strong>{num(stats.potential_zip_matches)}</strong></div>
   </section>
   <div className="notice warn"><strong>Не е завършена клинична миграция.</strong>
    Архивните диагнози и медицински заключения не се приемат за актуални.
    Потвърждението на работодателското правоотношение изисква документен и човешки преглед.
    Числата не означават действащи трудови договори.</div>
   <section className="table-panel"><h2>Текущи контролни проверки</h2>
    <div className="table-wrap"><table><thead><tr><th>Причина</th><th>Брой</th><th>Статус</th></tr></thead>
    <tbody>{groups.filter(x=>x.kind==='archived_employee').map((g,i)=><tr key={g.reason+i}>
     <td>{msg[g.reason]||'Изисква допълнителна проверка'}</td><td>{num(g.count)}</td>
     <td>{g.state==='evidence_checked'?'Документно свързан · непотвърден':'Изисква доказателство'}</td>
    </tr>)}</tbody></table></div>
    <p className="subnote">Непотвърдени фирмени кандидати (само статус, без ново проучване): {num(companies.count||0)}</p>
   </section>

  </>}
 </div>;
}


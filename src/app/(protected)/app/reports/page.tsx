import Link from 'next/link';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

const tiles = [
  { table:'companies',label:'Фирми' },
  { table:'worksites',label:'Работни обекти' },
  { table:'job_positions',label:'Длъжности' },
  { table:'employees',label:'Служители' },
  { table:'employment_periods',label:'Трудови периоди' },
  { table:'risk_assessments',label:'Проекти на рискове' }
] as const;

export default async function ReportsPage() {
  const ctx=await getContext();
  if (!ctx.tenant || !['admin','specialist'].includes(ctx.role)) {
    return <div className="content"><div className="notice warn">Тази административна справка е достъпна само за администратор и СТМ специалист.</div></div>;
  }
  const results=await Promise.all(tiles.map(async item=>{
    const result=await ctx.supabase.from(item.table)
      .select('id',{head:true,count:'exact'}).eq('tenant_id',ctx.tenant!);
    return {label:item.label,table:item.table,count:result.count??0,error:Boolean(result.error)};
  }));
  const [pending,overdue] = await Promise.all([
    ctx.supabase.from('employment_periods')
      .select('id',{head:true,count:'exact'}).eq('tenant_id',ctx.tenant)
      .eq('verification_status','unverified'),
    ctx.supabase.from('risk_assessments')
      .select('id',{head:true,count:'exact'}).eq('tenant_id',ctx.tenant)
      .lt('review_due',new Date().toISOString().slice(0,10))
  ]);
  return <div className="content">
    <div className="page-header"><div><p className="eyebrow">ОБЩИ АДМИНИСТРАТИВНИ ПОКАЗАТЕЛИ</p>
      <h1>Справки</h1><p>Агрегирана информация от разрешените регистри — без медицински записи.</p></div>
      <span className="tag">Работна версия</span></div>
    <section className="metrics report-metrics">
      {results.map(item=><div key={item.table} className="metric"><span>{item.label}</span>
        <strong>{item.error?'—':item.count.toLocaleString('bg-BG')}</strong>
        <small>{item.error?'Грешка при четене':'Регистър'}</small>
      </div>)}
    </section>
    <div className="report-panels">
      <div className="table-panel"><h2 className="company-section-title">Необходими проверки</h2>
        <div className="report-line"><span>Непотвърдени трудови периоди</span>
          <strong>{pending.error?'—':(pending.count??0).toLocaleString('bg-BG')}</strong></div>
        <div className="report-line"><span>Рискове с изтекъл срок за преглед</span>
          <strong>{overdue.error?'—':(overdue.count??0).toLocaleString('bg-BG')}</strong></div>
        <p className="subnote">Липсваща дата за преглед не означава, че оценката е валидна. Проверявай оригиналните документи.</p>
      </div>
      <div className="table-panel"><h2 className="company-section-title">Работни регистри</h2>
        <p className="company-empty"><Link href="/app/companies">Фирми и техните обекти →</Link></p>
        <p className="company-empty"><Link href="/app/employees">Регистър на служителите →</Link></p>
        <p className="company-empty"><Link href="/app/risks">Проекти на рисковете →</Link></p>
      </div>
    </div>
    <div className="notice warn">Справката обобщава наличните административни записи. Не представлява нормативен отчет на СТМ, медицинска справка или доказателство за пълна миграция.</div>
  </div>;
}
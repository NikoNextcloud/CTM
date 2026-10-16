import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getContext} from '@/lib/session';
import {ArchivedRecordDetails} from '@/components/archived-record-details';
import {ArchiveEmployeeLinker,type VerifiedCompany} from '@/components/archive-employee-linker';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};
type RecordData={id:string;kind:string;source:string;row:number;data:Record<string,unknown>};

export default async function ArchiveRecordPage({params}:Props){
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  notFound();
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')notFound();
 const {data,error}=await ctx.supabase.rpc('ctm_archive_get',{p_record:id});
 if(error||!data)notFound();
 const record=data as RecordData;
 // Legacy technical MEGA extension counts must not masquerade as dossiers.
 if(['folder_summary','file_manifest','identifier','date_reference'].includes(record.kind))
  redirect('/app/migration/personnel');
 const isPerson=record.kind==='employee_sample';
 const back=isPerson?'/app/migration/personnel':
  '/app/migration/archive?kind='+encodeURIComponent(record.kind);
 let companies:VerifiedCompany[]=[];
 let linkedEmployeeId:string|null=null;
 if(isPerson){
  const [linked,verified]=await Promise.all([
   ctx.supabase.rpc('ctm_archive_employee_link',{p_archive_id:id}),
   ctx.supabase.from('ctm_company_candidates').select('promoted_company_id')
    .eq('tenant_id',ctx.tenant).eq('review_status','verified')
    .not('promoted_company_id','is',null).limit(1000)
  ]);
  const link=linked.data as {employee_id?:string}|null;
  linkedEmployeeId=link?.employee_id||null;
  const ids=[...new Set((verified.data||[])
   .map(r=>r.promoted_company_id).filter((v):v is string=>typeof v==='string'))];
  if(ids.length){
   const result=await ctx.supabase.from('companies').select('id,name,eik')
    .eq('tenant_id',ctx.tenant).neq('status','archived').in('id',ids).limit(1000);
   companies=(result.data||[]) as VerifiedCompany[];
  }
 }
 return <div className="content">
  <Link className="back" href={back}>← Върни се към {isPerson?'архивните служители':'архивните записи'}</Link>
  <div className="page-header"><div>
   <p className="eyebrow">ЗАЩИТЕН АРХИВ · {isPerson?'СЛУЖИТЕЛ':'ЗАПИС'}</p>
   <h1>{isPerson?String(record.data['Име Презиме Фамилия']||'Непознат служител'):
    'Архивен запис №'+record.row}</h1>
   <p>Източник: {record.source.slice(0,26)}… · ред {record.row}</p>
  </div><span className="tag">{linkedEmployeeId?'Свързан · за проверка':'Непотвърден'}</span></div>
  <div className="notice warn">Архивът е доказателство за произход, не потвърждение
   на трудов статус или окончателно медицинско заключение.</div>
  {linkedEmployeeId&&<section className="ctm-action-card">
   <h2>Служителят е свързан с основния регистър</h2>
   <p>Архивният оригинал е запазен без презаписване.</p>
   <Link className="btn primary" href={'/app/employees/'+linkedEmployeeId}>
    Отвори служебното и защитеното медицинско досие →</Link>
  </section>}
  {isPerson&&!linkedEmployeeId&&<ArchiveEmployeeLinker
   archiveId={id}
   archiveCompany={String(record.data['Фирма']||'')}
   companies={companies}/>}
  <ArchivedRecordDetails data={record.data||{}}/>
 </div>;
}

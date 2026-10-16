import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getContext} from '@/lib/session';
import {ArchivedRecordDetails} from '@/components/archived-record-details';

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
 const back=record.kind==='employee_sample'?'/app/migration/personnel':
  '/app/migration/archive?kind='+encodeURIComponent(record.kind);
 return <div className="content">
  <Link className="back" href={back}>← Върни се към архивния списък</Link>
  <div className="page-header">
   <div><p className="eyebrow">ЗАЩИТЕНО АРХИВНО ДОСИЕ</p>
    <h1>Запис от архив №{record.row}</h1>
    <p>Категория: {record.kind} · Източник: {record.source.slice(0,24)}…</p>
   </div><span className="tag">Непотвърден</span>
  </div>
  <div className="notice warn">
   Това е оригинална информация от архивен източник. Показването ѝ не доказва
   актуално трудово правоотношение, медицинско заключение или потвърдена
   принадлежност към работодател. Промените се извършват в отделен контролируем процес.
  </div>
  <ArchivedRecordDetails data={record.data||{}}/>
 </div>;
}

import Link from 'next/link';
import {getContext} from '@/lib/session';
import {TransferManager} from '@/components/transfer-manager';
import {isTransferResource} from '@/lib/import-csv';

export const dynamic='force-dynamic';
export default async function DataTransferPage({searchParams}:{searchParams:Promise<{resource?:string}>}){
 const {resource}=await searchParams;
 const ctx=await getContext();
 if(!ctx.tenant||!['admin','specialist'].includes(ctx.role)){
  return <div className="content"><div className="notice warn">Само администратор или СТМ специалист има право да импортира и експортира служебни данни.</div></div>;
 }
 return <div className="content"><div className="ctm-import-clarity"><strong>Кой импорт да избера?</strong>
  <p>За XLSX със служители, ЕГН, ТЕЛК и медицински бележки избери защитения архивен импорт. За фирми, обекти, длъжности и оценки на риска използвай административния обмен по-долу.</p>
  {ctx.role==='admin'&&<Link className="btn primary" href="/app/migration/personnel">Импортирай служители и поверителни данни →</Link>}
 </div><TransferManager initialResource={resource&&isTransferResource(resource)?resource:'companies'}/></div>;
}
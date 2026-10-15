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
 return <TransferManager initialResource={resource&&isTransferResource(resource)?resource:'companies'}/>;
}
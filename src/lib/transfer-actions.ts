'use server';

import {createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {getContext} from '@/lib/session';
import {isTransferResource,parseCsv,type TransferResource,type ImportIssue} from '@/lib/import-csv';

type Preview={ok:boolean;rowCount:number;sha256:string;sample:Record<string,string>[];issues:ImportIssue[];message:string};
type ImportResult={ok:boolean;rows:number;message:string};
async function authorized(){
 const ctx=await getContext();
 if(!ctx.tenant||!['admin','specialist'].includes(ctx.role))throw new Error('Access denied');
 return {...ctx,tenant:ctx.tenant};
}
function checksum(type:TransferResource,raw:string){
 return createHash('sha256').update(type+'\n'+raw,'utf8').digest('hex');
}
export async function previewNonClinicalImport(resource:string,raw:string):Promise<Preview>{
 await authorized();
 if(!isTransferResource(resource)||typeof raw!=='string'){
  return{ok:false,rowCount:0,sha256:'',sample:[],issues:[],message:'Неподдържан CSV формат.'};
 }
 const parsed=parseCsv(raw,resource);
 return{ok:parsed.issues.length===0,rowCount:parsed.rows.length,
  sha256:parsed.issues.length===0?checksum(resource,raw):'',
  sample:parsed.rows.slice(0,5),issues:parsed.issues,
  message:parsed.issues.length===0?'Файлът е проверен. Прегледай редовете и потвърди.':'Има грешки; не е записано нищо.'};
}
export async function executeNonClinicalImport(resource:string,raw:string,reviewedHash:string):Promise<ImportResult>{
 const ctx=await authorized();
 if(!isTransferResource(resource)||typeof raw!=='string'||typeof reviewedHash!=='string'){
  return{ok:false,rows:0,message:'Невалиден импорт.'};
 }
 const parsed=parseCsv(raw,resource);
 if(parsed.issues.length||!parsed.rows.length||checksum(resource,raw)!==reviewedHash){
  return{ok:false,rows:0,message:'CSV е променен или невалиден. Направи нов преглед.'};
 }
 const {data,error}=await ctx.supabase.rpc('ctm_import_nonclinical',{
  p_tenant:ctx.tenant,p_resource:resource,p_rows:parsed.rows,p_sha256:reviewedHash
 });
 if(error){
  return{ok:false,rows:0,message:error.code==='23505'?
   'Повторен импорт на този пакет е блокиран.':
   'Базата отказа импорта. Провери тестовите фирмени кодове, колоните и правата.'};
 }
 revalidatePath('/app');
 for(const p of ['companies','employees','risks','data-transfer'])revalidatePath('/app/'+p);
 return{ok:true,rows:Number(data)||parsed.rows.length,message:'Импортът е записан като една транзакция, с одит и защита от повторение.'};
}
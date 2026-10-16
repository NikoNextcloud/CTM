'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

export type ArchiveEditState={ok:boolean;message:string;revision:number};
const immutable=new Set(['Източник','Изходен лист','Ред в Excel']);
const fail=(message:string,revision:number):ArchiveEditState=>({ok:false,message,revision});

export async function editArchiveEmployee(
 previous:ArchiveEditState,form:FormData
):Promise<ArchiveEditState>{
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')
  return fail('За редакция на архивно досие се изисква администраторски достъп.',previous.revision);
 const input=z.object({
  archiveId:z.string().uuid(),
  revision:z.coerce.number().int().min(0),
  confirmed:z.literal('yes')
 }).safeParse({
  archiveId:form.get('archive_id'),
  revision:form.get('revision'),
  confirmed:form.get('confirmed')
 });
 if(!input.success)return fail('Провери потвърждението и презареди досието.',previous.revision);
 const result=await ctx.supabase.rpc('ctm_archive_employee_current',{p_record:input.data.archiveId});
 const current=result.data as {data?:Record<string,unknown>;revision?:number}|null;
 if(result.error||!current?.data)
  return fail('Досието не може да се прочете с текущите права.',previous.revision);
 const data:Record<string,string>=Object.create(null);
 const keys=Object.keys(current.data);
 if(keys.length>80)return fail('Архивният запис има прекалено много колони.',previous.revision);
 for(const key of keys){
  const original=current.data[key];
  if(typeof original!=='string')return fail('Неподдържана стойност в архива.',previous.revision);
  if(immutable.has(key)){data[key]=original;continue;}
  const cell=form.get('field:'+key);
  if(typeof cell!=='string'||cell.length>10000)
   return fail('Липсва или е прекалено дълго поле: '+key,previous.revision);
  data[key]=cell.trim();
 }
 const write=await ctx.supabase.rpc('ctm_archive_employee_save',{
  p_archive_id:input.data.archiveId,p_data:data,p_expected_revision:input.data.revision
 });
 if(write.error){
  if(write.error.code==='40001')
   return fail('Досието е променено междувременно. Презареди и провери последната версия.',previous.revision);
  if(write.error.code==='22023')
   return fail('Провери ЕГН, имената, границите на полетата или непроменяемите колони.',previous.revision);
  return fail('Редакцията е отказана от базата. Оригиналът не е променен.',previous.revision);
 }
 const version=Number((write.data as {revision?:number}|null)?.revision??input.data.revision+1);
 for(const path of [
  '/app/migration/archive/'+input.data.archiveId,'/app/migration/personnel',
  '/app/migration/archive','/app'
 ])revalidatePath(path);
 return {ok:true,revision:version,message:'Промените са запазени в шифрованата история на досието. Оригиналният архив е непокътнат.'};
}

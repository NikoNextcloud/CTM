'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

export type ArchiveLinkState={ok:boolean;message:string;employeeId:string|null};
const invalid=(message:string):ArchiveLinkState=>({ok:false,message,employeeId:null});

export async function linkArchivedEmployee(
 _previous:ArchiveLinkState,fd:FormData
):Promise<ArchiveLinkState>{
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')
  return invalid('Само администратор може да свързва архивни досиета.');
 const input=z.object({
  archiveId:z.string().uuid(),
  companyId:z.string().uuid(),
  acknowledged:z.literal('yes')
 }).safeParse({
  archiveId:fd.get('archive_id'),
  companyId:fd.get('company_id'),
  acknowledged:fd.get('acknowledged')
 });
 if(!input.success)
  return invalid('Избери проверена фирма и потвърди правилното съвпадение.');
 const {data,error}=await ctx.supabase.rpc('ctm_promote_archived_employee',{
  p_archive_id:input.data.archiveId,
  p_company_id:input.data.companyId,
  p_acknowledged:true
 });
 if(error){
  if(error.code==='23505')
   return invalid('Вече има служител с тези имена във фирмата. Прегледай съществуващото досие — данните не са слети.');
  if(error.code==='22023')
   return invalid('Несъвпадаща фирма, непотвърден ЕИК или непроверено ЕГН/поле. Записът остава в архива.');
  if(error.code==='42501')
   return invalid('Операцията е отказана. Провери администраторските права.');
  return invalid('Базата не прие свързването. Нищо не е изтрито от архива.');
 }
 const value=data as {employee_id?:string;status?:string}|null;
 if(!value?.employee_id)return invalid('Сървърът не върна идентификатор. Провери одита.');
 revalidatePath('/app/migration/personnel');
 revalidatePath('/app/migration/archive');
 revalidatePath('/app/migration/archive/'+input.data.archiveId);
 revalidatePath('/app/employees');
 revalidatePath('/app');
 return{ok:true,employeeId:value.employee_id,
  message:value.status==='already_linked'
   ?'Архивният запис вече е свързан с това досие.'
   :'Създаден е служител със статус „За проверка“. Поверителните полета са прехвърлени шифровани. Изходният архив е запазен.'};
}

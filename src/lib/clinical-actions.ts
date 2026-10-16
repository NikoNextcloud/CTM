'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

export type ClinicalSaveState={ok:boolean;message:string;revision:number};
const fields=z.object({
 employee_id:z.string().uuid(),
 egn:z.string().trim().max(10).refine(s=>s===''||/^[0-9]{10}$/.test(s),'Невалидно ЕГН'),
 telk:z.string().trim().max(2000),
 diagnosis:z.string().trim().max(5000),
 notes:z.string().trim().max(10000),
 revision:z.coerce.number().int().min(0)
});

export async function saveEmployeeClinical(
 previous:ClinicalSaveState,form:FormData
):Promise<ClinicalSaveState>{
 const fail=(message:string):ClinicalSaveState=>({ok:false,message,revision:previous.revision});
 const ctx=await getContext();
 if(!ctx.tenant||!['admin','doctor'].includes(ctx.role))
  return fail('Нямате разрешение за поверителните полета на служителя.');
 const input=fields.safeParse({
  employee_id:form.get('employee_id'),
  egn:form.get('egn')??'',
  telk:form.get('telk')??'',
  diagnosis:form.get('diagnosis')??'',
  notes:form.get('notes')??'',
  revision:form.get('revision')??'0'
 });
 if(!input.success)return fail('Провери ЕГН, дължината на полетата и версията на записа.');
 const check=await ctx.supabase.from('employees').select('id')
  .eq('tenant_id',ctx.tenant).eq('id',input.data.employee_id).maybeSingle();
 if(check.error||!check.data)return fail('Няма достъп до служителя.');
 // Database validates membership, EGN, row identity and write revision independently.
 const {data,error}=await ctx.supabase.rpc('ctm_save_employee_clinical',{
  p_employee_id:input.data.employee_id,
  p_egn:input.data.egn,
  p_telk:input.data.telk,
  p_diagnosis:input.data.diagnosis,
  p_notes:input.data.notes,
  p_expected_revision:input.data.revision
 });
 if(error){
  if(error.code==='22023')
   return fail('Невалидно ЕГН (дата или контролна цифра) или прекалено дълъг текст.');
  if(error.code==='23505')
   return fail('ЕГН вече съществува за друг служител в тази фирма. Провери дублирането.');
  if(error.code==='40001')
   return fail('Записът е променен от друга сесия. Презареди досието и провери промените.');
  if(error.code==='42501')
   return fail('Сървърът отказа достъпа до тези сведения.');
  return fail('Поверителният запис не е съхранен. Провери правата и връзката към базата.');
 }
 revalidatePath('/app/employees/'+input.data.employee_id);
 const revision=(data as {revision?:number}|null)?.revision;
 return{ok:true,revision:typeof revision==='number'?revision:input.data.revision+1,
  message:'ЕГН и медицинските сведения са записани шифровани. Действието е отразено в одитния журнал.'};
}

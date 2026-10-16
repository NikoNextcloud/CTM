'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

export type LifecycleState={ok:boolean;message:string};
const fail=(message:string):LifecycleState=>({ok:false,message});
const schema=z.object({
 id:z.string().uuid(),revision:z.coerce.number().int().positive(),
 intent:z.enum(['archive','restore','deactivate','activate','pending']),
 acknowledged:z.literal('yes')
});

export async function changeCompanyLifecycle(
 _previous:LifecycleState,fd:FormData
):Promise<LifecycleState>{
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return fail('Само администратор може да променя статуса на фирма.');
 const parsed=schema.safeParse({
  id:fd.get('id'),revision:fd.get('revision'),
  intent:fd.get('intent'),acknowledged:fd.get('acknowledged')
 });
 if(!parsed.success||!['archive','restore','deactivate','activate'].includes(parsed.data.intent))
  return fail('Избери действие и го потвърди.');
 const {id,revision,intent}=parsed.data;
 const target=intent==='archive'?'archived':
  intent==='restore'||intent==='deactivate'?'inactive':'active';
 const current=await ctx.supabase.from('companies').select('id,status,eik')
  .eq('tenant_id',ctx.tenant).eq('id',id).maybeSingle();
 if(current.error||!current.data)return fail('Фирмата не е намерена в твоята организация.');
 if(target==='active'&&!/^\d{9}(\d{4})?$/.test(current.data.eik))
  return fail('Преди активиране е необходим валиден формат на ЕИК.');
 const result=await ctx.supabase.from('companies').update({status:target})
  .eq('tenant_id',ctx.tenant).eq('id',id).eq('revision',revision)
  .select('id').maybeSingle();
 if(result.error||!result.data)return fail('Записът е променен от друга сесия. Презареди страницата.');
 revalidatePath('/app/companies');
 revalidatePath('/app/companies/archived');
 revalidatePath('/app/companies/'+id);
 revalidatePath('/app');
 return{ok:true,message:target==='archived'
  ?'Фирмата е архивирана. Данните и връзките не са изтрити.'
  :target==='inactive'?'Фирмата е неактивна.':'Статусът на фирмата е възстановен.'};
}

export async function changeEmployeeLifecycle(
 _previous:LifecycleState,fd:FormData
):Promise<LifecycleState>{
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return fail('Само администратор може да променя статуса на служител.');
 const parsed=schema.safeParse({
  id:fd.get('id'),revision:fd.get('revision'),
  intent:fd.get('intent'),acknowledged:fd.get('acknowledged')
 });
 if(!parsed.success||!['archive','restore','deactivate','activate','pending'].includes(parsed.data.intent))
  return fail('Избери действие и го потвърди.');
 const {id,revision,intent}=parsed.data;
 const target=intent==='archive'?'archived':intent==='restore'||intent==='pending'
  ?'pending':intent==='activate'?'active':'inactive';
 const existing=await ctx.supabase.from('employees').select('id,company_id,current_status')
  .eq('tenant_id',ctx.tenant).eq('id',id).maybeSingle();
 if(existing.error||!existing.data)return fail('Служителят не е открит.');
 if(target==='active'){
  const company=await ctx.supabase.from('companies').select('status')
   .eq('tenant_id',ctx.tenant).eq('id',existing.data.company_id).maybeSingle();
  if(company.error||company.data?.status!=='active')
   return fail('Не може да се потвърди служител към неактивна или архивирана фирма.');
 }
 const result=await ctx.supabase.from('employees')
  .update({current_status:target})
  .eq('tenant_id',ctx.tenant).eq('id',id).eq('revision',revision)
  .select('id').maybeSingle();
 if(result.error||!result.data)return fail('Конфликт на версия или права. Презареди досието.');
 revalidatePath('/app/employees');
 revalidatePath('/app/employees/archived');
 revalidatePath('/app/employees/'+id);
 revalidatePath('/app');
 return{ok:true,message:target==='archived'
  ?'Служителят е преместен в архива. ЕГН, медицински сведения и история не са изтрити.'
  :target==='pending'?'Служителят е върнат за проверка.':
   target==='inactive'?'Статусът е променен на неактивен.':'Служителят е потвърден като активен.'};
}

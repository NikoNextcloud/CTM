'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/session';

export type EditState={ok:boolean;message:string};
const uuid=z.string().uuid();
const rev=z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const txt=(max:number)=>z.string().trim().max(max);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate=z.union([z.literal(''),date]);

async function editor() {
  const ctx=await getContext();
  if(!ctx.tenant || !['admin','specialist'].includes(ctx.role)) return null;
  return {...ctx,tenant:ctx.tenant};
}
const fail=(message:string):EditState=>({ok:false,message});
const good=(path:string):EditState=>{revalidatePath(path);return {ok:true,message:'Записът е обновен успешно. Обнови страницата за последната версия.'};};
const conflict=()=>fail('Записът е бил променен или нямаш достъп. Обнови страницата преди нов опит.');
const common=z.object({id:uuid,revision:rev});
function fields(fd:FormData){return {id:fd.get('id'),revision:fd.get('revision')};}

export async function editCompany(_prev:EditState,fd:FormData):Promise<EditState>{
 const ctx=await editor();if(!ctx)return fail('Нямаш права за редакция.');
 const v=common.extend({
  name:z.string().trim().min(2).max(200),eik:z.string().regex(/^\d{9,13}$/),
  address:txt(300),activity:txt(300),contact_email:z.union([z.literal(''),z.email().max(254)]),
  contact_phone:txt(50),contract_reference:txt(100),
  status:z.enum(['active','inactive','archived'])
 }).safeParse({...fields(fd),name:fd.get('name'),eik:fd.get('eik'),
  address:fd.get('address')??'',activity:fd.get('activity')??'',
  contact_email:fd.get('contact_email')??'',contact_phone:fd.get('contact_phone')??'',
  contract_reference:fd.get('contract_reference')??'',status:fd.get('status')});
 if(!v.success)return fail('Невалидни фирмени данни.');
 const {id,revision,...changes}=v.data;
 const {data,error}=await ctx.supabase.from('companies').update(changes)
  .eq('tenant_id',ctx.tenant).eq('id',id).eq('revision',revision).select('id').maybeSingle();
 if(error||!data)return conflict();
 revalidatePath('/app/companies');return good('/app/companies/'+id);
}

export async function editEmployee(_prev:EditState,fd:FormData):Promise<EditState>{
 const ctx=await editor();if(!ctx)return fail('Нямаш права за редакция.');
 const v=common.extend({
  full_name:z.string().trim().min(3).max(200),
  job_title:txt(150),reference_code:txt(80)
 }).safeParse({...fields(fd),full_name:fd.get('full_name'),
  job_title:fd.get('job_title')??'',reference_code:fd.get('reference_code')??''});
 if(!v.success)return fail('Невалидни служебни данни.');
 const {id,revision,...changes}=v.data;
 const {data,error}=await ctx.supabase.from('employees').update(changes)
  .eq('tenant_id',ctx.tenant).eq('id',id).eq('revision',revision).select('id').maybeSingle();
 if(error||!data)return conflict();
 revalidatePath('/app/employees');return good('/app/employees/'+id);
}

export async function editWorksite(_prev:EditState,fd:FormData):Promise<EditState>{
 const ctx=await editor();if(!ctx)return fail('Нямаш права за редакция.');
 const v=common.extend({company_id:uuid,name:z.string().trim().min(2).max(200),
  address:txt(300),active:z.enum(['true','false'])}).safeParse({
  ...fields(fd),company_id:fd.get('company_id'),
  name:fd.get('name'),address:fd.get('address')??'',
  active:fd.has('active')?'true':'false'
 });
 if(!v.success)return fail('Невалидни данни за обекта.');
 const {id,revision,company_id,name,address,active}=v.data;
 const {data,error}=await ctx.supabase.from('worksites')
  .update({name,address,active:active==='true'})
  .eq('tenant_id',ctx.tenant).eq('company_id',company_id).eq('id',id)
  .eq('revision',revision).select('id').maybeSingle();
 if(error||!data)return conflict();
 return good('/app/companies/'+company_id);
}

export async function editPosition(_prev:EditState,fd:FormData):Promise<EditState>{
 const ctx=await editor();if(!ctx)return fail('Нямаш права за редакция.');
 const v=common.extend({company_id:uuid,title:z.string().trim().min(2).max(200),
  department:txt(200),active:z.enum(['true','false'])}).safeParse({
  ...fields(fd),company_id:fd.get('company_id'),title:fd.get('title'),
  department:fd.get('department')??'',active:fd.has('active')?'true':'false'
 });
 if(!v.success)return fail('Невалидни данни за длъжността.');
 const {id,revision,company_id,title,department,active}=v.data;
 const {data,error}=await ctx.supabase.from('job_positions')
  .update({title,department,active:active==='true'})
  .eq('tenant_id',ctx.tenant).eq('company_id',company_id).eq('id',id)
  .eq('revision',revision).select('id').maybeSingle();
 if(error||!data)return conflict();
 return good('/app/companies/'+company_id);
}

export async function editEmploymentPeriod(_prev:EditState,fd:FormData):Promise<EditState>{
 const ctx=await editor();if(!ctx)return fail('Нямаш права за редакция.');
 const v=common.extend({company_id:uuid,started_on:date,
  ended_on:optionalDate,source_note:txt(250)}).safeParse({
  ...fields(fd),company_id:fd.get('company_id'),
  started_on:fd.get('started_on'),ended_on:fd.get('ended_on')??'',
  source_note:fd.get('source_note')??''
 });
 if(!v.success|| (v.data.ended_on && v.data.ended_on<v.data.started_on))
  return fail('Невалиден трудов период.');
 const {id,revision,company_id,started_on,ended_on,source_note}=v.data;
 const {data,error}=await ctx.supabase.from('employment_periods')
  .update({started_on,ended_on:ended_on||null,source_note,
   verification_status:'unverified'})
  .eq('tenant_id',ctx.tenant).eq('company_id',company_id).eq('id',id)
  .eq('revision',revision).select('id').maybeSingle();
 if(error||!data)return conflict();
 return good('/app/companies/'+company_id);
}

export async function editRisk(_prev:EditState,fd:FormData):Promise<EditState>{
 const ctx=await editor();if(!ctx)return fail('Нямаш права за редакция.');
 const v=common.extend({
  workplace:txt(250),hazard:z.string().trim().min(3).max(800),
  risk_level:z.enum(['low','medium','high']),
  protective_measures:txt(2000),assessment_date:date,
  review_due:optionalDate,status:z.enum(['draft','review'])
 }).safeParse({
  ...fields(fd),workplace:fd.get('workplace')??'',
  hazard:fd.get('hazard'),risk_level:fd.get('risk_level'),
  protective_measures:fd.get('protective_measures')??'',
  assessment_date:fd.get('assessment_date'),review_due:fd.get('review_due')??'',
  status:fd.get('status')
 });
 if(!v.success||(v.data.review_due&&v.data.review_due<v.data.assessment_date))
  return fail('Невалидна оценка или дата за преглед.');
 const {id,revision,review_due,...changes}=v.data;
 const {data,error}=await ctx.supabase.from('risk_assessments')
  .update({...changes,review_due:review_due||null})
  .eq('tenant_id',ctx.tenant).eq('id',id).eq('revision',revision)
  .select('id').maybeSingle();
 if(error||!data)return conflict();
 revalidatePath('/app/risks');return good('/app/risks/'+id);
}

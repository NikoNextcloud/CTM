'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

export type CandidateReviewState={ok:boolean;message:string};
const uuid=z.string().uuid();
const reviewSchema=z.object({
 candidate_id:uuid,
 eik:z.string().trim().regex(/^(?:[0-9]{9}|[0-9]{13})$/),
 confirmed_name:z.string().trim().min(2).max(200),
 evidence:z.string().trim().min(24).max(500)
});
const flagSchema=z.object({
 candidate_id:uuid,
 reason:z.string().trim().min(12).max(500),
 resolution:z.enum(['conflict','excluded'])
});
const FAIL:CandidateReviewState={ok:false,message:'Неуспешна операция. Данните не са променени.'};

async function adminContext(){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')throw new Error('Forbidden');
 return {...ctx,tenant:ctx.tenant};
}
export async function promoteCandidate(
 _previous:CandidateReviewState,form:FormData
):Promise<CandidateReviewState>{
 const ctx=await adminContext();
 if(form.get('confirmation')!=='yes')return{ok:false,message:'Изисква се изрично потвърждение за фирмата и ЕИК.'};
 const input=reviewSchema.safeParse({
  candidate_id:form.get('candidate_id'),eik:form.get('eik'),
  confirmed_name:form.get('confirmed_name'),evidence:form.get('evidence')
 });
 if(!input.success)return{ok:false,message:'Провери ЕИК, наименованието и доказателствената бележка (поне 24 знака).'};
 const {data,error}=await ctx.supabase.rpc('ctm_promote_company_candidate',{
  p_candidate_id:input.data.candidate_id,p_eik:input.data.eik,
  p_evidence_reference:input.data.evidence,p_confirmed_name:input.data.confirmed_name
 });
 if(error){
  if(error.code==='23505')return{ok:false,message:'Същото име или ЕИК вече принадлежи на друга фирма. Не е създаден дубликат — провери противоречието.'};
  if(error.code==='22023')return{ok:false,message:'Невалиден контролен знак на ЕИК, несъвпадащо име или недостатъчно доказателство.'};
  if(error.code==='42501')return{ok:false,message:'Нямаш разрешение или кандидатът вече е заключен.'};
  return{ok:false,message:'Базата отказа операцията. Не прави нов импорт, преди да провериш кандидата и одитния журнал.'};
 }
 const response=data as unknown as {created?:boolean;status?:string}|null;
 revalidatePath('/app/migration/companies');
 revalidatePath('/app/companies');
 revalidatePath('/app');
 return{ok:true,message:response?.status==='already_verified'
  ?'Кандидатът вече е потвърден. Не е създадена друга фирма.'
  :response?.created
   ?'Потвърдено. Създадена е неактивна фирма, подлежаща на договорна и оперативна проверка.'
   :'Потвърдено. Кандидатът е свързан със съществуващия фирмен запис, без дублиране.'};
}
export async function flagCandidate(
 _previous:CandidateReviewState,form:FormData
):Promise<CandidateReviewState>{
 const ctx=await adminContext();
 const input=flagSchema.safeParse({
  candidate_id:form.get('candidate_id'),
  reason:form.get('reason'),resolution:form.get('resolution')
 });
 if(!input.success)return{ok:false,message:'Въведи основание от поне 12 знака и решение за преглед.'};
 const {data,error}=await ctx.supabase.from('ctm_company_candidates').update({
  review_status:input.data.resolution,
  review_note:input.data.reason,
  reviewed_by:ctx.user.id,
  reviewed_at:new Date().toISOString()
 }).eq('tenant_id',ctx.tenant).eq('id',input.data.candidate_id)
 .in('review_status',['pending','conflict']).select('id').maybeSingle();
 if(error||!data)return FAIL;
 revalidatePath('/app/migration/companies');
 return{ok:true,message:input.data.resolution==='conflict'
  ?'Отбелязано като конфликт. Нищо не е внесено в регистъра с фирмите.'
  :'Кандидатът е изключен от миграцията с проследимо основание.'};
}

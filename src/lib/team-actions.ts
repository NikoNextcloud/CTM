'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/session';

const Role = z.enum(['admin', 'doctor', 'specialist', 'employer', 'auditor']);
type State = { ok: boolean; message: string };

function parseCompanies(data: FormData): string[] | null {
  const parsed = z.array(z.string().uuid()).max(100).safeParse(data.getAll('company_ids'));
  return parsed.success ? [...new Set(parsed.data)] : null;
}

// Administrators create the Auth account themselves in Supabase Dashboard.
// This action only assigns an existing account to the selected CTM organization.
export async function inviteMember(_previous: State, data: FormData): Promise<State> {
  const ctx = await getContext();
  if (!ctx.tenant || ctx.role !== 'admin') return { ok: false, message: 'Само администратор може да добавя членове.' };
  const input = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: Role
  }).safeParse({ email: data.get('email'), role: data.get('role') });
  const companyIds = parseCompanies(data);
  if (!input.success || !companyIds) return { ok: false, message: 'Невалиден имейл, роля или фирма.' };
  if (input.data.role === 'employer' && companyIds.length === 0) {
    return { ok: false, message: 'Избери поне една фирма за работодателя.' };
  }

  const existing = await ctx.supabase.rpc('ctm_find_auth_user', {
    p_tenant: ctx.tenant, p_email: input.data.email
  });
  if (existing.error) return { ok: false, message: 'Неуспешна проверка на акаунта в Supabase.' };
  const userId = existing.data as string | null;
  if (!userId) {
    return { ok: false, message: 'Този акаунт още не съществува. Създай го ръчно в Supabase → Authentication → Users, след което опитай отново.' };
  }

  const result = await ctx.supabase.rpc('ctm_manage_member', {
    p_tenant: ctx.tenant, p_user: userId, p_role: input.data.role,
    p_active: false, p_company_ids: companyIds
  });
  if (result.error) return { ok: false, message: 'Базата отказа присвояването. Провери фирмите и ролята.' };
  revalidatePath('/app/team');
  return { ok: true, message: 'Акаунтът е добавен без активен достъп. Натисни „Потвърди достъпа“, за да го разрешиш.' };
}

export async function updateMember(_previous: State, data: FormData): Promise<State> {
  const ctx = await getContext();
  if (!ctx.tenant || ctx.role !== 'admin') return { ok: false, message: 'Нямате администраторски права.' };
  const input = z.object({ userId: z.string().uuid(), role: Role }).safeParse({
    userId: data.get('user_id'), role: data.get('role')
  });
  const companyIds = parseCompanies(data);
  if (!input.success || !companyIds) return { ok: false, message: 'Невалидни данни.' };
  const active = data.has('active');
  if (ctx.user.id === input.data.userId && (input.data.role !== 'admin' || !active)) {
    return { ok: false, message: 'Не можеш да отнемеш собствените си администраторски права.' };
  }
  if (input.data.role === 'employer' && active && companyIds.length === 0) {
    return { ok: false, message: 'Активният работодател трябва да има поне една фирма.' };
  }
  const result = await ctx.supabase.rpc('ctm_manage_member', {
    p_tenant: ctx.tenant, p_user: input.data.userId,
    p_role: input.data.role, p_active: active, p_company_ids: companyIds
  });
  if (result.error) return { ok: false, message: 'Промяната е отказана от защитата на базата. Провери правата и избраните фирми.' };
  revalidatePath('/app/team');
  return { ok: true, message: 'Правата са записани успешно.' };
}


// Explicit access approval never creates/deletes Supabase Authentication users.
export async function changeMemberApproval(
 _previous:State,data:FormData
):Promise<State>{
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')
  return {ok:false,message:'Нужни са администраторски права.'};
 const parsed=z.object({
  userId:z.string().uuid(),
  operation:z.enum(['approve','deactivate']),
  acknowledged:z.literal('yes')
 }).safeParse({
  userId:data.get('user_id'),
  operation:data.get('operation'),
  acknowledged:data.get('acknowledged')
 });
 if(!parsed.success)return{ok:false,message:'Потвърди действието.'};
 const {userId,operation}=parsed.data;
 if(userId===ctx.user.id)
  return{ok:false,message:'Не можеш да спреш или промениш собствените си администраторски права оттук.'};
 const member=await ctx.supabase.from('tenant_members')
  .select('role,active').eq('tenant_id',ctx.tenant).eq('user_id',userId).maybeSingle();
 if(member.error||!member.data)
  return{ok:false,message:'Потребителят не е член на тази организация.'};
 const access=await ctx.supabase.from('company_access').select('company_id')
  .eq('tenant_id',ctx.tenant).eq('user_id',userId).limit(100);
 if(access.error)return{ok:false,message:'Не могат да се проверят достъпите по фирми.'};
 const companies=[...new Set((access.data||[]).map(a=>a.company_id))];
 if(operation==='approve'&&member.data.role==='employer'&&!companies.length)
  return{ok:false,message:'Задай поне една фирма на работодателя, преди да потвърдиш достъпа.'};
 const result=await ctx.supabase.rpc('ctm_manage_member',{
  p_tenant:ctx.tenant,p_user:userId,p_role:member.data.role,
  p_active:operation==='approve',p_company_ids:companies
 });
 if(result.error)return{ok:false,message:'Сървърът отказа промяната. Провери фирмените права и одита.'};
 revalidatePath('/app/team');
 return{ok:true,message:operation==='approve'
  ?'Достъпът до CTM е потвърден. Supabase имейлът се управлява отделно.'
  :'Достъпът до CTM е деактивиран. Акаунтът в Supabase Authentication е запазен.'};
}

'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getContext } from '@/lib/session';

const ROLES = ['admin', 'doctor', 'specialist', 'employer', 'auditor'] as const;
const Role = z.enum(ROLES);
type State = { ok: boolean; message: string };

function parseCompanies(data: FormData): string[] | null {
  const raw = data.getAll('company_ids');
  const result = z.array(z.string().uuid()).max(100).safeParse(raw);
  return result.success ? [...new Set(result.data)] : null;
}

function invitationUrl(): string {
  // Fixed trusted origin, never derived from Host or forwarded headers.
  return 'https://ctm-pearl.vercel.app/auth/accept-invite';
}

export async function inviteMember(_previous: State, data: FormData): Promise<State> {
  const ctx = await getContext();
  if (!ctx.tenant || ctx.role !== 'admin') return { ok: false, message: 'Нямате администраторски права.' };
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
  if (existing.error) return { ok: false, message: 'Неуспешна проверка на съществуващия акаунт.' };
  let userId = existing.data as string | null;
  let invited = false;

  if (!userId) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!key || !url) return { ok: false, message: 'Липсва сървърната настройка за изпращане на покани. Свържи се с администратора на инфраструктурата.' };
    const service = createServiceClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });
    const invitation = await service.auth.admin.inviteUserByEmail(input.data.email, {
      redirectTo: invitationUrl()
    });
    if (invitation.error || !invitation.data.user?.id) {
      return { ok: false, message: 'Поканата не е изпратена. Провери настройките за имейл и Redirect URLs в Supabase.' };
    }
    userId = invitation.data.user.id;
    invited = true;
  }

  const assignment = await ctx.supabase.rpc('ctm_manage_member', {
    p_tenant: ctx.tenant, p_user: userId, p_role: input.data.role,
    p_active: true, p_company_ids: companyIds
  });
  if (assignment.error) {
    return { ok: false, message: 'Потребителят е намерен или поканен, но правата не са записани. Провери SQL миграцията и опитай отново.' };
  }
  revalidatePath('/app/team');
  return { ok: true, message: invited ? 'Поканата е изпратена. Достъпът е настроен; потребителят трябва да зададе парола.' : 'Съществуващият потребител получи достъп до организацията.' };
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

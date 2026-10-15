'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {getContext} from '@/lib/session';

const Review=z.object({
  company_id:z.string().uuid(),
  id:z.string().uuid(),
  revision:z.coerce.number().int().positive().safe(),
  verification_status:z.enum(['verified','conflict','unverified']),
  verification_note:z.string().trim().max(300)
});

export async function reviewEmploymentPeriod(form:FormData) {
  const ctx=await getContext();
  if(!ctx.tenant||!['admin','specialist'].includes(ctx.role)) {
    throw new Error('Не е разрешено потвърждение на трудова история.');
  }
  const parsed=Review.safeParse({
    company_id:form.get('company_id'),
    id:form.get('id'),
    revision:form.get('revision'),
    verification_status:form.get('verification_status'),
    verification_note:form.get('verification_note')||''
  });
  if(!parsed.success) throw new Error('Некоректни данни за проверката.');
  const row=parsed.data;
  if(row.verification_status!=='unverified'&&row.verification_note.length<12) {
    throw new Error('Опиши надеждно основание за проверката (поне 12 символа).');
  }
  const result=await ctx.supabase.from('employment_periods')
    .update({
      verification_status:row.verification_status,
      verification_note:row.verification_status==='unverified'?'':row.verification_note
    })
    .eq('tenant_id',ctx.tenant)
    .eq('company_id',row.company_id)
    .eq('id',row.id)
    .eq('revision',row.revision)
    .select('id')
    .maybeSingle();
  if(result.error) throw new Error('Промяната е отказана от проверките на базата.');
  if(!result.data) throw new Error('Записът е променен след отварянето. Презареди страницата и провери актуалния статус.');
  const dest='/app/companies/'+encodeURIComponent(row.company_id);
  revalidatePath(dest);
  redirect(dest+'?reviewed=1');
}
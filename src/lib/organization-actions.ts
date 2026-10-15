'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getContext } from '@/lib/session';

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalId = z.union([z.literal(''),id]);
const optionalDate = z.union([z.literal(''),date]);

async function editor() {
  const context = await getContext();
  if (!context.tenant || !['admin','specialist'].includes(context.role)) {
    throw new Error('Нямате право да променяте фирмените регистри.');
  }
  return context;
}
function companyUrl(companyId: string) { return '/app/companies/' + encodeURIComponent(companyId); }

export async function createWorksite(fd: FormData) {
  const ctx = await editor();
  const result = z.object({
    company_id:id,
    name:z.string().trim().min(2).max(200),
    address:z.string().trim().max(300)
  }).safeParse({
    company_id:fd.get('company_id'),
    name:fd.get('name'),
    address:fd.get('address') ?? ''
  });
  if (!result.success) throw new Error('Некоректни данни за работно място.');
  const input = result.data;
  const firm = await ctx.supabase.from('companies').select('id')
    .eq('tenant_id',ctx.tenant!).eq('id',input.company_id).maybeSingle();
  if (!firm.data || firm.error) throw new Error('Нямате разрешение за тази фирма.');
  const { error } = await ctx.supabase.from('worksites').insert({
    tenant_id:ctx.tenant,company_id:input.company_id,name:input.name,address:input.address
  });
  if (error) throw new Error('Неуспешно създаване на работно място.');
  revalidatePath(companyUrl(input.company_id));
  redirect(companyUrl(input.company_id));
}

export async function createJobPosition(fd: FormData) {
  const ctx = await editor();
  const result = z.object({
    company_id:id,
    title:z.string().trim().min(2).max(200),
    department:z.string().trim().max(200),
    worksite_id:optionalId
  }).safeParse({
    company_id:fd.get('company_id'),
    title:fd.get('title'),
    department:fd.get('department') ?? '',
    worksite_id:fd.get('worksite_id') ?? ''
  });
  if (!result.success) throw new Error('Некоректни данни за длъжност.');
  const input = result.data;
  const firm = await ctx.supabase.from('companies').select('id')
    .eq('tenant_id',ctx.tenant!).eq('id',input.company_id).maybeSingle();
  if (firm.error || !firm.data) throw new Error('Нямате разрешение за тази фирма.');
  const {error} = await ctx.supabase.from('job_positions').insert({
    tenant_id:ctx.tenant,company_id:input.company_id,title:input.title,
    department:input.department,worksite_id:input.worksite_id||null
  });
  // The database additionally enforces a composite (tenant, company, worksite) FK.
  if (error) throw new Error('Неуспешен запис: работното място трябва да е от същата фирма.');
  revalidatePath(companyUrl(input.company_id));
  redirect(companyUrl(input.company_id));
}

export async function createEmploymentPeriod(fd: FormData) {
  const ctx = await editor();
  const result = z.object({
    company_id:id,employee_id:id,position_id:id,
    started_on:date,ended_on:optionalDate
  }).safeParse({
    company_id:fd.get('company_id'),
    employee_id:fd.get('employee_id'),
    position_id:fd.get('position_id'),
    started_on:fd.get('started_on'),
    ended_on:fd.get('ended_on') ?? ''
  });
  if (!result.success) throw new Error('Некоректни данни за трудовия период.');
  const input=result.data;
  if (input.ended_on && input.ended_on < input.started_on) throw new Error('Краят не може да е преди началото.');
  const [employee,position] = await Promise.all([
    ctx.supabase.from('employees').select('id').eq('tenant_id',ctx.tenant!)
      .eq('company_id',input.company_id).eq('id',input.employee_id).maybeSingle(),
    ctx.supabase.from('job_positions').select('id').eq('tenant_id',ctx.tenant!)
      .eq('company_id',input.company_id).eq('id',input.position_id).maybeSingle()
  ]);
  if (employee.error || !employee.data || position.error || !position.data) {
    throw new Error('Служителят и длъжността трябва да са от избраната фирма.');
  }
  const {error} = await ctx.supabase.from('employment_periods').insert({
    tenant_id:ctx.tenant,company_id:input.company_id,
    employee_id:input.employee_id,position_id:input.position_id,
    started_on:input.started_on,ended_on:input.ended_on||null,
    verification_status:'unverified'
  });
  if (error) throw new Error('Периодът не е записан: провери датите и фирмените връзки.');
  revalidatePath(companyUrl(input.company_id));
  redirect(companyUrl(input.company_id));
}
'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';
const Company=z.object({name:z.string().trim().min(2).max(200),eik:z.string().regex(/^\d{9,13}$/),address:z.string().trim().max(300)});
export async function createCompany(fd:FormData){const ctx=await getContext();if(!ctx.tenant||!['admin','specialist'].includes(ctx.role))throw new Error('Forbidden');
const parsed=Company.safeParse({name:fd.get('name'),eik:fd.get('eik'),address:fd.get('address')||''});if(!parsed.success)throw new Error('Invalid input');
const {error}=await ctx.supabase.from('companies').insert({tenant_id:ctx.tenant,name:parsed.data.name,eik:parsed.data.eik,address:parsed.data.address,status:'active'});if(error)throw new Error('Неуспешно записване. Проверете дали ЕИК вече съществува и дали имате достъп.');
revalidatePath('/app/companies');redirect('/app/companies');}


// Administrative-only staff register, deliberately excludes EGN and medical fields.
const Employee = z.object({
  company_id: z.string().uuid(),
  full_name: z.string().trim().min(3).max(200),
  job_title: z.string().trim().max(150),
  reference_code: z.string().trim().max(80)
});
export async function createEmployee(fd: FormData) {
  const ctx = await getContext();
  if (!ctx.tenant || !['admin','specialist'].includes(ctx.role)) throw new Error('Forbidden');
  const parsed = Employee.safeParse({
    company_id: fd.get('company_id'), full_name: fd.get('full_name'),
    job_title: fd.get('job_title') ?? '', reference_code: fd.get('reference_code') ?? ''
  });
  if (!parsed.success) throw new Error('Невалидни служебни данни');
  const firm = await ctx.supabase.from('companies').select('id')
    .eq('tenant_id', ctx.tenant).eq('id', parsed.data.company_id).maybeSingle();
  if (firm.error || !firm.data) throw new Error('Няма достъп до избраната фирма');
  const {error} = await ctx.supabase.from('employees').insert({
    tenant_id: ctx.tenant, company_id: parsed.data.company_id,
    full_name: parsed.data.full_name, job_title: parsed.data.job_title,
    reference_code: parsed.data.reference_code, current_status: 'pending'
  });
  if (error) throw new Error('Записването на служителя не е разрешено');
  revalidatePath('/app/employees');
  redirect('/app/employees');
}

const Risk = z.object({
  company_id: z.string().uuid(),
  workplace: z.string().trim().max(250),
  hazard: z.string().trim().min(3).max(800),
  risk_level: z.enum(['low','medium','high']),
  protective_measures: z.string().trim().max(2000),
  assessment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  review_due: z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
});
export async function createRiskAssessment(fd: FormData) {
  const ctx = await getContext();
  if (!ctx.tenant || !['admin','specialist'].includes(ctx.role)) throw new Error('Forbidden');
  const parsed = Risk.safeParse({
    company_id: fd.get('company_id'), workplace: fd.get('workplace') ?? '',
    hazard: fd.get('hazard'), risk_level: fd.get('risk_level'),
    protective_measures: fd.get('protective_measures') ?? '',
    assessment_date: fd.get('assessment_date'),
    review_due: fd.get('review_due') ?? ''
  });
  if (!parsed.success) throw new Error('Невалидни данни за оценката на риска');
  if (parsed.data.review_due && parsed.data.review_due < parsed.data.assessment_date) {
    throw new Error('Датата за преглед не може да е преди датата на оценката');
  }
  const firm = await ctx.supabase.from('companies').select('id')
    .eq('tenant_id', ctx.tenant).eq('id', parsed.data.company_id).maybeSingle();
  if (firm.error || !firm.data) throw new Error('Няма достъп до избраната фирма');
  const {error} = await ctx.supabase.from('risk_assessments').insert({
    tenant_id: ctx.tenant, company_id: parsed.data.company_id,
    workplace: parsed.data.workplace, hazard: parsed.data.hazard,
    risk_level: parsed.data.risk_level, protective_measures: parsed.data.protective_measures,
    assessment_date: parsed.data.assessment_date,
    review_due: parsed.data.review_due || null,
    created_by: ctx.user.id, status: 'draft'
  });
  if (error) throw new Error('Неуспешно записване на риска — провери правата и датите');
  revalidatePath('/app/risks');
  redirect('/app/risks');
}

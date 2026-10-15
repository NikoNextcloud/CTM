'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {getContext} from '@/lib/session';

const uuid=z.string().uuid();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const maybeDay=z.union([z.literal(''),day]);
async function authorized(roles:readonly string[]){
 const ctx=await getContext();
 if(!ctx.tenant||!roles.includes(ctx.role))throw new Error('Нямате разрешение за тази операция.');
 return {...ctx,tenant:ctx.tenant};
}
async function employeeAllowed(ctx:Awaited<ReturnType<typeof authorized>>,employeeId:string){
 const row=await ctx.supabase.from('employees').select('id,company_id').eq('tenant_id',ctx.tenant).eq('id',employeeId).maybeSingle();
 if(row.error||!row.data)throw new Error('Нямате достъп до избрания служител.');
 return row.data;
}

export async function scheduleExamination(fd:FormData){
 const ctx=await authorized(['doctor']);
 const parsed=z.object({employee_id:uuid,exam_date:maybeDay,exam_type:z.enum(['initial','periodic','other'])})
  .safeParse({employee_id:fd.get('employee_id'),exam_date:fd.get('exam_date')??'',exam_type:fd.get('exam_type')});
 if(!parsed.success)throw new Error('Провери служителя и полетата на прегледа.');
 await employeeAllowed(ctx,parsed.data.employee_id);
 const {error}=await ctx.supabase.from('examinations').insert({
  tenant_id:ctx.tenant,employee_id:parsed.data.employee_id,
  exam_date:parsed.data.exam_date||null,exam_type:parsed.data.exam_type,fitness:'pending'
 });
 if(error)throw new Error('Записът на прегледа е отказан от базата.');
 revalidatePath('/app/examinations');redirect('/app/examinations');
}

export async function registerSickLeave(fd:FormData){
 const ctx=await authorized(['doctor']);
 const parsed=z.object({employee_id:uuid,start_date:day,end_date:maybeDay}).safeParse({
  employee_id:fd.get('employee_id'),start_date:fd.get('start_date'),end_date:fd.get('end_date')??''
 });
 if(!parsed.success)throw new Error('Невалидни данни за периода.');
 if(parsed.data.end_date&&parsed.data.end_date<parsed.data.start_date)throw new Error('Крайната дата е преди началната.');
 await employeeAllowed(ctx,parsed.data.employee_id);
 const {error}=await ctx.supabase.from('sick_leaves').insert({
  tenant_id:ctx.tenant,employee_id:parsed.data.employee_id,
  start_date:parsed.data.start_date,end_date:parsed.data.end_date||null,verification_status:'unverified'
 });
 if(error)throw new Error('Записът е отказан от базата.');
 revalidatePath('/app/sick-leaves');redirect('/app/sick-leaves');
}

export async function registerDocumentMetadata(fd:FormData){
 const classification=fd.get('classification');
 const roles=classification==='medical'?['doctor']:['admin','specialist'];
 const ctx=await authorized(roles);
 const parsed=z.object({
  title:z.string().trim().min(3).max(200),
  classification:z.enum(['administrative','medical']),
  company_id:z.union([z.literal(''),uuid]),
  employee_id:z.union([z.literal(''),uuid])
 }).safeParse({
  title:fd.get('title'),classification,
  company_id:fd.get('company_id')??'',employee_id:fd.get('employee_id')??''
 });
 if(!parsed.success)throw new Error('Провери заглавието и връзките на документа.');
 let companyId=parsed.data.company_id||null;
 if(parsed.data.employee_id){
  const employee=await employeeAllowed(ctx,parsed.data.employee_id);
  if(companyId&&companyId!==employee.company_id)throw new Error('Служителят и фирмата не съвпадат.');
  companyId=employee.company_id;
 }
 if(companyId){
  const firm=await ctx.supabase.from('companies').select('id').eq('tenant_id',ctx.tenant).eq('id',companyId).maybeSingle();
  if(firm.error||!firm.data)throw new Error('Фирмата не е разрешена.');
 }
 const {error}=await ctx.supabase.from('documents').insert({
  tenant_id:ctx.tenant,company_id:companyId,
  employee_id:parsed.data.employee_id||null,title:parsed.data.title,
  classification:parsed.data.classification,
  verification_status:'unverified',storage_path:null
 });
 if(error)throw new Error('Базата отказа регистрирането на документа.');
 revalidatePath('/app/documents');redirect('/app/documents');
}

export async function registerMigrationSource(fd:FormData){
 const ctx=await authorized(['admin']);
 const parsed=z.object({source_name:z.string().trim().min(3).max(180)}).safeParse({
  source_name:fd.get('source_name')
 });
 if(!parsed.success)throw new Error('Въведи име на архивния източник до 180 символа.');
 const {error}=await ctx.supabase.from('migration_batches').insert({
  tenant_id:ctx.tenant,source_name:parsed.data.source_name,status:'pending'
 });
 if(error)throw new Error('Източникът не е добавен в миграционния регистър.');
 revalidatePath('/app/migration');redirect('/app/migration');
}

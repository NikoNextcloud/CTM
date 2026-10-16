'use server';

import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

const allowedKind=z.enum([
 'employee_sample','person_candidate','contract_person',
 'source_company','file_manifest','source_issue'
]);
const sourceSchema=z.string().regex(/^UPLOAD_[a-f0-9]{64}$/);
const cellValue=z.union([z.string().max(8000),z.number().finite(),z.boolean(),z.null()]);
const oneRow=z.object({
 source_key:z.string().min(2).max(120).regex(/^[a-zA-Z0-9._:-]+$/),
 row_index:z.number().int().positive().max(1000000),
 data:z.record(z.string().min(1).max(130),cellValue)
});
const batchSchema=z.object({
 source:z.string(),
 kind:z.string(),
 rows:z.array(oneRow).min(1).max(100)
});

export type ArchiveUploadResult={
 ok:boolean;inserted:number;existing:number;message:string
};

export async function importConfidentialArchiveBatch(input:unknown):Promise<ArchiveUploadResult>{
 const reject=(message:string):ArchiveUploadResult=>({
  ok:false,inserted:0,existing:0,message
 });
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return reject('Само администратор може да внася архиви.');
 const checked=batchSchema.safeParse(input);
 if(!checked.success)return reject('Невалидни архивни редове. Нищо не е записано.');
 const kind=allowedKind.safeParse(checked.data.kind);
 const source=sourceSchema.safeParse(checked.data.source);
 if(!kind.success||!source.success)return reject('Неподдържан източник или категория.');
 const rows=checked.data.rows;
 const keys=new Set(rows.map(r=>r.source_key));
 if(keys.size!==rows.length)return reject('Повтарящ се номер на изходен ред в пакета.');
 if(rows.some(row=>Object.keys(row.data).length>48 ||
  JSON.stringify(row.data).length>22000))
  return reject('Надвишен размер на архивен запис.');
 if(kind.data==='employee_sample'&&rows.some(r=>
  typeof r.data['Име Презиме Фамилия']!=='string'
   ||String(r.data['Име Презиме Фамилия']).trim().length<3
   ||typeof r.data['Фирма']!=='string'
   ||String(r.data['Фирма']).trim().length<2))
   return reject('Липсва име на служител или на изходната фирма.');
 // Never place row contents, EGN or diagnoses in logs, errors or file artifacts.
 // The database itself verifies active admin membership and encrypts every row.
 const {data,error}=await ctx.supabase.rpc('ctm_archive_ingest_admin',{
  p_source:source.data,p_kind:kind.data,p_rows:rows
 });
 if(error){
  if(error.code==='23505')return reject(
   'Този архивен ред вече съществува с различно съдържание. Не е презаписан.');
  if(error.code==='42501')return reject('Нямаш разрешение за този архивен импорт.');
  return reject('Импортът не е извършен. Провери архивния регистър, преди повторен опит.');
 }
 const stats=data as {inserted?:number;existing?:number}|null;
 const inserted=Number(stats?.inserted||0);
 const existing=Number(stats?.existing||0);
 revalidatePath('/app/migration/archive');
 revalidatePath('/app/migration/personnel');
 revalidatePath('/app/employees');
 revalidatePath('/app');
 return{
  ok:true,inserted,existing,
  message:inserted+' архивни реда записани; '+existing+
   ' вече съществуващи. Записани са шифровани; никой не е автоматично потвърден като действащ служител.'
 };
}


export async function verifyArchiveSource(sourceCode:string,kind:string):Promise<{
 ok:boolean;count:number;message:string
}>{
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin'||!sourceSchema.safeParse(sourceCode).success
  ||!allowedKind.safeParse(kind).success)
  return{ok:false,count:0,message:'Няма разрешение за проверката.'};
 const {data,error}=await ctx.supabase.rpc('ctm_archive_source_status',{
  p_source:sourceCode,p_kind:kind
 });
 if(error)return{ok:false,count:0,message:'Неуспешна проверка на записа в базата.'};
 const count=Number((data as {count?:number}|null)?.count||0);
 return{ok:true,count,message:'Потвърдени '+count+' архивни реда в базата.'};
}

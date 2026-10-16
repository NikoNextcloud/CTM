'use server';

import {createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';

export type StageCompanyResult={ok:boolean;message:string;inserted:number;existing:number};
const nameSchema=z.string().trim().min(2).max(200)
 .refine(s=>!/[<>\u0000-\u001f]/u.test(s),'Неподдържани символи')
 .refine(s=>!/(егн|телк|диагноза|мкб\s*10|болничен лист|medical record)/iu.test(s),'Медицински запис')
 .refine(s=>!/(?:^|[^\d])\d{10}(?:[^\d]|$)/u.test(s),'Възможен личен идентификатор');
const inputSchema=z.object({
 source_label:z.string().trim().min(3).max(140).refine(x=>!/[<>\u0000-\u001f]/u.test(x)),
 source_header:z.string().trim().min(1).max(120).refine(x=>!/(егн|телк|диагноз|служител|трите имена|име презиме|employee|full.?name|person|медицин)/iu.test(x),'Колона с лични сведения'),
 names:z.array(nameSchema).min(1).max(100)
});

function normalizedName(name:string){
 return name.normalize('NFKC').toLocaleLowerCase('bg-BG')
  .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}

/** Only selected COMPANY NAMES are sent. No original XLSX, employee/health columns, EGN or addresses. */
export async function stageCompanyNames(input:unknown):Promise<StageCompanyResult>{
 const fail=(message:string):StageCompanyResult=>({ok:false,message,inserted:0,existing:0});
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return fail('Само администратор може да регистрира фирмени източници.');
 const parsed=inputSchema.safeParse(input);
 if(!parsed.success)return fail('Невалидни фирмени имена, източник или над 100 реда. Нищо не е изпратено към базата.');
 const source=parsed.data.source_label;
 const unique=new Map<string,string>();
 for(const name of parsed.data.names){
  const norm=normalizedName(name);
  if(norm.length<2)return fail('Невалидно или двусмислено фирмено име.');
  if(!unique.has(norm))unique.set(norm,name);
 }
 const rows=[...unique].map(([norm,name])=>({
  tenant_id:ctx.tenant,
  source_kind:'uploaded_companies',
  source_label:source,
  source_hash:createHash('sha256').update('uploaded_companies\n'+source+'\n'+norm).digest('hex'),
  name,
  confidence:'uncertain',
  review_status:'pending',
  eik:null,
  review_note:'',
  reviewed_by:null,
  reviewed_at:null
 }));
 // This single PostgREST statement is transactional; ON CONFLICT DO NOTHING
 // never overwrites archival evidence or review decisions.
 const {data,error}=await ctx.supabase.from('ctm_company_candidates').upsert(
  rows,{onConflict:'tenant_id,source_kind,source_hash',ignoreDuplicates:true}
 ).select('id');
 if(error)return fail('Базата отказа staging импорта. Провери правата и схемата; не повтаряй с различно име на файла преди одит.');
 const inserted=(data||[]).length;
 revalidatePath('/app/migration/companies');
 revalidatePath('/app/migration');
 return{ok:true,inserted,existing:unique.size-inserted,
  message:'Създадени '+inserted+' нови кандидата; '+(unique.size-inserted)+
   ' вече са били регистрирани от този източник. Нито един не е потвърден или активиран. Изключени повторени редове в файла: '+
   (parsed.data.names.length-unique.size)+'.'};
}

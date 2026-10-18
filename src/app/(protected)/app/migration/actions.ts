'use server';

import {createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {unzipSync} from 'fflate';
import readXlsxFile from 'read-excel-file/node';
import {requireArchiveAdmin,loadMegaRoot,storeOriginal} from '@/lib/mega-originals';

const allZipHandles=['XmZBGD4B','SmYCjbrb','jnBVTBLQ'] as const;
const isAllowedZip=(value:string)=>allZipHandles.some(h=>h===value);
const hash=(body:Uint8Array)=>createHash('sha256').update(body).digest('hex');
const base='/app/migration/personnel';
const safeError=(error:unknown)=>{
 const message=error instanceof Error?error.message:'Непредвидена грешка.';
 // Return only known, nonsensitive UI status codes; never expose filenames or personal values.
 if(message.includes('сървъра'))return 'source';
 if(message.includes('хранилище'))return 'storage';
 if(message.includes('размер'))return 'size';
 if(message.includes('достъп'))return 'access';
 return 'processing';
};
export async function saveMegaOriginalAction(formData:FormData){
 const ctx=await requireArchiveAdmin();
 const handle=String(formData.get('handle')||'');
 const root=String(formData.get('root')||'');
 if(!/^[A-Za-z0-9_-]{8,32}$/.test(root))throw Error('Невалидна архивна папка.');
 let outcome='stored';
 try{await storeOriginal(ctx,handle);}catch(error){outcome='error-'+safeError(error);}
 revalidatePath('/app/migration/mega');
 revalidatePath('/app/migration/mega/'+root);
 redirect('/app/migration/mega/'+root+'?copy='+outcome);
}
export async function examineZipArchiveAction(formData:FormData){
 const ctx=await requireArchiveAdmin();
 const handle=String(formData.get('handle')||'');
 if(!isAllowedZip(handle))throw Error('Този ZIP не е разрешен за контролирано съпоставяне.');
 let outcome='checked';
 try{
  // Every supporting original is first copied and integrity-checked in private Storage.
  const root=await loadMegaRoot();
  const source=await storeOriginal(ctx,handle,root);
  const files=unzipSync(new Uint8Array(source.bytes));
  const entries=Object.entries(files);
  if(entries.length>300||entries.reduce((n,[,b])=>n+b.byteLength,0)>35_000_000)
   throw Error('Размерът на разархивираните документи е прекомерен.');
  const xlsx=entries.filter(([file])=>/\.xlsx$/i.test(file)&&!file.includes('__MACOSX'));
  if(xlsx.length!==1)throw Error('Неочаквана структура на архивните документи.');
  for(const [,xlsxBytes] of xlsx){
   const sheets=await readXlsxFile(Buffer.from(xlsxBytes));
   const sheetRows=sheets.flatMap(sheet=>sheet.data);
   if(sheetRows.length<1||sheetRows.length>250)throw Error('Размерът на таблицата е невалиден.');
   const rows=sheetRows.map(row=>{
    if(row.length>50)throw Error('Твърде много колони.');
    return row.map(value=>String(value??'').slice(0,500));
   });
   if(JSON.stringify(rows).length>180_000)throw Error('Размерът на таблицата е прекомерен.');
   const recorded=await ctx.supabase.rpc('ctm_admin_add_zip_sheet',{
    p_handle:handle,p_parent_sha:source.sha256,
    p_child_sha:hash(xlsxBytes),p_rows:rows
   });
   if(recorded.error)throw Error('Защитената база отказа данните за проверка.');
  }
 }catch(error){outcome='error-'+safeError(error);}
 revalidatePath(base);
 revalidatePath('/app/migration/mega/2z5x3JCL');
 redirect(base+'?zip='+outcome);
}


import {Readable} from 'node:stream';
import {File} from 'megajs';
import {getContext} from '@/lib/session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Metadata={handle:string;filename:string;bytes:number;storage_path:string|null};
const fail=(s:string,n:number)=>new Response(s,{status:n,headers:{'cache-control':'private, no-store','content-type':'text/plain; charset=utf-8'}});
const headers=(name:string,size:number)=>({
 'content-type':'application/octet-stream',
 'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name.replace(/[\/\\\r\n]/g,'_').slice(0,240)),
 'cache-control':'private, no-store, max-age=0',
 'x-content-type-options':'nosniff',
 'content-security-policy':"default-src 'none'",
 'content-length':String(size)
});
export async function GET(_req:Request,{params}:{params:Promise<{handle:string}>}){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')return fail('Достъпът е отказан.',403);
 const {handle}=await params;
 if(!/^[A-Za-z0-9_-]{8,32}$/.test(handle))return fail('Невалиден документ.',400);
 const item=await ctx.supabase.rpc('ctm_mega_file_detail',{p_handle:handle});
 if(item.error||!item.data)return fail('Документът не е намерен.',404);
 const info=item.data as Metadata;
 const bytes=Number(info.bytes);
 if(!Number.isSafeInteger(bytes)||bytes<0)return fail('Невалиден размер.',422);
 if(bytes>52428800)return fail('Файлът надхвърля 50 MB и изисква отделно защитено прехвърляне.',413);
 if(info.storage_path){
  const saved=await ctx.supabase.storage.from('ctm-private-originals').download(info.storage_path);
  if(saved.error||!saved.data)return fail('Файлът не е достъпен в Storage.',502);
  return new Response(saved.data.stream(),{headers:headers(info.filename,bytes)});
 }
 const source=process.env.CTM_MEGA_SOURCE_URL;
 if(!source||!source.startsWith('https://mega.nz/folder/'))return fail('MEGA не е конфигуриран.',503);
 try{
  const tree=File.fromURL(source);await tree.loadAttributes();
  const stack=[...(tree.children||[])];let found:File|undefined;
  while(stack.length){const x=stack.pop();if(!x)break;
   if(x.directory){stack.push(...(x.children||[]));continue;}
   if(Array.isArray(x.downloadId)&&x.downloadId[1]===handle){found=x;break;}
  }
  if(!found||found.size!==bytes)return fail('Оригиналът е променен или липсва.',409);
  return new Response(Readable.toWeb(found.download({}) as Readable) as ReadableStream<Uint8Array>,{headers:headers(info.filename,bytes)});
 }catch{return fail('Оригиналът не може да се изтегли от MEGA.',502);}
}
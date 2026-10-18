import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {File} from 'megajs';
import {getContext} from '@/lib/session';

type Context=Awaited<ReturnType<typeof getContext>>;
type FileMeta={handle:string;filename:string;bytes:number;extension:string;storage_path:string|null;sha256:string|null};
const bucket='ctm-private-originals';
const sha=(body:Buffer)=>createHash('sha256').update(body).digest('hex');
const validHandle=(h:string)=>/^[A-Za-z0-9_-]{8,32}$/.test(h);
const maxFile=52_428_800;

export async function requireArchiveAdmin(){
 const ctx=await getContext();
 if(!ctx.tenant||ctx.role!=='admin')throw Error('Необходим е администраторски достъп.');
 return ctx;
}
export async function archiveInfo(ctx:Context,handle:string):Promise<FileMeta>{
 if(!validHandle(handle))throw Error('Невалиден файлов идентификатор.');
 const result=await ctx.supabase.rpc('ctm_mega_file_detail',{p_handle:handle});
 if(result.error||!result.data)throw Error('Оригиналът не е намерен в защитения каталог.');
 const meta=result.data as FileMeta;
 if(meta.handle!==handle||!Number.isSafeInteger(Number(meta.bytes))||Number(meta.bytes)<1||Number(meta.bytes)>maxFile)
  throw Error('Размерът на оригинала надхвърля разрешените 50 MB.');
 return meta;
}
export async function loadMegaRoot(){
 const source=process.env.CTM_MEGA_SOURCE_URL;
 if(!source||!source.startsWith('https://mega.nz/folder/Lz50mLTT#'))
  throw Error('Защитеният MEGA източник не е конфигуриран на сървъра.');
 const root=File.fromURL(source);
 await root.loadAttributes();
 return root;
}
async function readMega(meta:FileMeta,root:File){
 const stack=[...(root.children||[])];let file:File|undefined;
 while(stack.length){
  const item=stack.pop();if(!item)continue;
  if(item.directory){stack.push(...(item.children||[]));continue;}
  if(Array.isArray(item.downloadId)&&item.downloadId[1]===meta.handle){file=item;break;}
 }
 if(!file||file.size!==Number(meta.bytes))throw Error('MEGA оригиналът липсва или размерът му е променен.');
 const parts:Buffer[]=[];let count=0;
 for await(const part of file.download({}) as Readable){
  const buffer=Buffer.from(part as Uint8Array);count+=buffer.length;
  if(count>maxFile)throw Error('Файлът е над допустимия размер.');
  parts.push(buffer);
 }
 const content=Buffer.concat(parts);
 if(content.length!==Number(meta.bytes))throw Error('Непълен оригинален документ.');
 return content;
}
async function readCopy(ctx:Context,path:string){
 const saved=await ctx.supabase.storage.from(bucket).download(path);
 if(saved.error||!saved.data)throw Error('Не може да се прочете защитеното копие.');
 return Buffer.from(await saved.data.arrayBuffer());
}
export async function storeOriginal(ctx:Context,handle:string,tree?:File){
 if(ctx.role!=='admin'||!ctx.tenant)throw Error('Администраторски достъп е необходим.');
 const meta=await archiveInfo(ctx,handle);
 if(meta.storage_path&&meta.sha256){
  const bytes=await readCopy(ctx,meta.storage_path);
  if(bytes.length!==Number(meta.bytes)||sha(bytes)!==meta.sha256)
   throw Error('Несъответствие при проверка на съхранен оригинал.');
  return {handle,bytes,sha256:meta.sha256,alreadyStored:true};
 }
 const root=tree||await loadMegaRoot();
 const bytes=await readMega(meta,root);
 const digest=sha(bytes);
 const path=ctx.tenant+'/mega/'+handle+'-'+digest+'.bin';
 const uploaded=await ctx.supabase.storage.from(bucket).upload(path,bytes,{
  contentType:'application/octet-stream',upsert:false,cacheControl:'0'
 });
 if(uploaded.error){
  // An interrupted earlier request may have uploaded the immutable object.
  const code=String((uploaded.error as {statusCode?:string|number}).statusCode||'');
  const msg=uploaded.error.message||'';
  if(code!=='409'&&!(code==='400'&&/exist|duplicate/i.test(msg)))
   throw Error('Частното хранилище отказа записа (възможно е да е запълнено).');
 }
 const verified=await readCopy(ctx,path);
 if(verified.length!==bytes.length||sha(verified)!==digest)
  throw Error('Проверката на оригинала след запис не премина.');
 const finalized=await ctx.supabase.rpc('ctm_admin_confirm_original',{
  p_handle:handle,p_sha:digest,p_bytes:bytes.length,p_path:path
 });
 if(finalized.error||!finalized.data)
  throw Error('Неуспешно потвърждение на защитеното копие.');
 return {handle,bytes,sha256:digest,alreadyStored:false};
}


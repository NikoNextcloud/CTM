// CTM v0.19: protected ingestion gateway. Personal contents are encrypted immediately in PostgreSQL.
Deno.serve(async(req:Request)=>{
 const reply=(v:Record<string,unknown>,s:number)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(req.method!=='POST')return reply({error:'Method'},405);
 const token=req.headers.get('x-ctm-job-token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Unauthorized'},401);
 if(Number(req.headers.get('content-length')||0)>1700000)return reply({error:'Too large'},413);
 let rows:unknown;
 try{rows=(await req.json()).rows}catch{return reply({error:'JSON'},400)}
 if(!Array.isArray(rows)||rows.length<1||rows.length>25)return reply({error:'Invalid batch'},422);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply({error:'Configuration'},503);
 const upstream=await fetch(url+'/rest/v1/rpc/ctm_mega_extract_ingest',{method:'POST',
  headers:{'content-type':'application/json','apikey':key,'authorization':'Bearer '+key},
  body:JSON.stringify({p_job_token:token,p_rows:rows}),signal:AbortSignal.timeout(45000)}).catch(()=>null);
 if(!upstream)return reply({error:'Unavailable'},503);
 if(!upstream.ok)return reply({error:'Refused'},upstream.status===403?403:422);
 const result=await upstream.json();
 return reply({ok:true,added:result.added,received:result.received},200);
});
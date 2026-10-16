// No archive contents, plaintext keys or personal records are exposed by this importer.
Deno.serve(async(req:Request)=>{
 const send=(body:Record<string,unknown>,status:number)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(req.method!=='POST')return send({error:'Method not allowed'},405);
 const token=req.headers.get('x-ctm-job-token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return send({error:'Unauthorized'},401);
 if(Number(req.headers.get('content-length')||0)>500000)return send({error:'Payload too large'},413);
 let rows:unknown;try{rows=(await req.json())?.rows;}catch{return send({error:'Invalid JSON'},400);}
 if(!Array.isArray(rows)||rows.length<1||rows.length>100)return send({error:'Invalid batch'},422);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return send({error:'Unavailable'},503);
 const r=await fetch(url+'/rest/v1/rpc/ctm_mega_ingest_internal',{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({p_job_token:token,p_rows:rows}),signal:AbortSignal.timeout(25000)}).catch(()=>null);
 if(!r)return send({error:'Unavailable'},503);
 if(!r.ok)return send({error:'Batch refused'},r.status===403?403:422);
 const v=await r.json().catch(()=>null);
 return send({ok:true,added:Number(v?.added)||0,received:Number(v?.received)||0},200);
});
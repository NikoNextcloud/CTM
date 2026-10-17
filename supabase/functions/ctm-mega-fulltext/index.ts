
Deno.serve(async (req:Request)=>{
 const respond=(o:Record<string,unknown>,s:number)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
 if(req.method!=="POST")return respond({error:"method"},405);
 const token=req.headers.get("x-ctm-job-token")||"";
 if(!/^[a-f0-9]{64}$/.test(token))return respond({error:"denied"},401);
 if(Number(req.headers.get("content-length")||"0")>400000)return respond({error:"size"},413);
 let body:Record<string,unknown>;
 try{body=await req.json();}catch{return respond({error:"invalid"},400);}
 if(!/^[A-Za-z0-9_-]{8,32}$/.test(String(body?.handle||""))
 || !/^[0-9a-f]{64}$/.test(String(body?.sha256||""))
 || typeof body?.text!=="string" || body.text.length>200000 || body.text.length<1
 || typeof body?.bytes!=="number" || body.bytes<1 || body.bytes>20000000
 )return respond({error:"invalid"},422);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return respond({error:"config"},503);
 const result=await fetch(url+"/rest/v1/rpc/ctm_mega_ingest_full_xlsx",{
 method:"POST",
 headers:{"apikey":key,"authorization":"Bearer "+key,"content-type":"application/json"},
 body:JSON.stringify({p_token:token,p_handle:body.handle,p_sha:body.sha256,p_bytes:body.bytes,p_text:body.text}),
 signal:AbortSignal.timeout(30000)
 }).catch(()=>null);
 if(!result)return respond({error:"upstream"},503);
 if(!result.ok)return respond({error:"rejected"},result.status===403?403:422);
 const parsed=await result.json().catch(()=>null);
 return respond({ok:true,stored:parsed?.stored===1,characters:parsed?.characters||0},200);
});


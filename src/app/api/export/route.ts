import {NextRequest,NextResponse} from 'next/server';
import {getContext} from '@/lib/session';
import {CSV_FORMATS,csvEscape,isTransferResource,type TransferResource} from '@/lib/import-csv';

export const dynamic='force-dynamic';
const FIELDS:Record<TransferResource,string>={
 companies:'name,eik,address,status',
 employees:'company_id,full_name,job_title,reference_code',
 worksites:'company_id,name,address,active',
 job_positions:'company_id,title,department,active',
 risk_assessments:'company_id,workplace,hazard,risk_level,protective_measures,assessment_date,review_due'
};
const LIMIT=5000,PAGE=500;
function response(message:string,status:number){
 return new NextResponse(message,{status,headers:{'Cache-Control':'private, no-store'}});
}
export async function GET(request:NextRequest){
 const ctx=await getContext();
 if(!ctx.tenant||!['admin','specialist'].includes(ctx.role))return response('Forbidden',403);
 const resource=new URL(request.url).searchParams.get('resource')||'';
 if(!isTransferResource(resource))return response('Unsupported resource',400);
 const columns=CSV_FORMATS[resource],rows:string[]=[columns.join(';')];
 const companyCodes=new Map<string,string>();
 let count=0;
 for(let page=0;page<=LIMIT/PAGE;page++){
  const result=await ctx.supabase.from(resource).select(FIELDS[resource])
   .eq('tenant_id',ctx.tenant).order('id').range(page*PAGE,page*PAGE+PAGE-1);
  if(result.error)return response('Export failed',500);
  const records=(result.data??[]) as unknown as Record<string,unknown>[];
  if(count+records.length>LIMIT)return response('Export limit: 5000 rows',413);
  if(resource!=='companies'){
   const missing=[...new Set(records.map(row=>String(row.company_id||'')).filter(id=>id&&!companyCodes.has(id)))];
   if(missing.length){
    const firms=await ctx.supabase.from('companies').select('id,eik')
     .eq('tenant_id',ctx.tenant).in('id',missing);
    if(firms.error)return response('Unable to resolve permitted companies',500);
    for(const firm of firms.data??[])companyCodes.set(firm.id,firm.eik);
   }
   if(records.some(row=>!companyCodes.has(String(row.company_id))))return response('Company inaccessible',409);
  }
  for(const record of records){
   rows.push(columns.map(k=>csvEscape(k==='company_eik'?companyCodes.get(String(record.company_id)):record[k])).join(';'));
  }
  count+=records.length;
  if(records.length<PAGE)break;
 }
 return new NextResponse('\uFEFF'+rows.join('\r\n')+'\r\n',{
  status:200,
  headers:{
   'Content-Type':'text/csv; charset=utf-8',
   'Content-Disposition':'attachment; filename="ctm-'+resource+'.csv"',
   'Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff'
  }
 });
}
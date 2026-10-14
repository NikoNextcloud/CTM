import {NextRequest,NextResponse} from 'next/server';
import {getContext} from '@/lib/session';
const columns={companies:['name','eik','address','status'],employees:['full_name','job_title','reference_code']} as const;
function cell(v:unknown){const s=String(v??'').replace(/^[=+@\-\t\r]/,'\u0027$&');return '"'+s.replace(/"/g,'""')+'"';}
export async function GET(req:NextRequest){const c=await getContext();if(!c.tenant||!['admin','specialist'].includes(c.role))return new NextResponse('Forbidden',{status:403});const resource=new URL(req.url).searchParams.get('resource');if(resource!=='companies'&&resource!=='employees')return new NextResponse('Unknown resource',{status:400});
const cols=columns[resource];const all:Record<string,unknown>[]=[];for(let page=0;page<40;page++){const r=await c.supabase.from(resource).select(cols.join(',')).eq('tenant_id',c.tenant).order('id').range(page*1000,page*1000+999);if(r.error)return new NextResponse('Export error',{status:500});all.push(...(r.data||[]));if((r.data||[]).length<1000)break;}
if(all.length>=40000)return new NextResponse('Export limit reached: use a controlled server-side export job',{status:413});
const csv='\uFEFF'+[cols.join(';'),...all.map(row=>cols.map(k=>cell(row[k])).join(';'))].join('\r\n');return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${resource}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

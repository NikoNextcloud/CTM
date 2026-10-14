import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
export async function getContext(){
 const supabase=await createClient();if(!supabase) redirect('/login?error=config');
 const {data:{user},error}=await supabase.auth.getUser();if(error||!user)redirect('/login');
 const memberships=await supabase.from('tenant_members').select('tenant_id,role,tenants(name)').eq('user_id',user.id).eq('active',true).limit(1);
 const m=(memberships.data||[])[0] as unknown as {tenant_id:string;role:string;tenants:{name:string}|{name:string}[]|null}|undefined;
 if(!m) return {supabase,user,tenant:null,role:'pending',tenantName:'Няма достъп'};
 const t=Array.isArray(m.tenants)?m.tenants[0]:m.tenants;
 return {supabase,user,tenant:m.tenant_id,role:m.role,tenantName:t?.name||'СТМ'};
}

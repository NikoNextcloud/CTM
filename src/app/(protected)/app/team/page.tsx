import { getContext } from '@/lib/session';
import { TeamManager } from '@/components/team-manager';

export const dynamic = 'force-dynamic';

type Member = { user_id: string; email: string | null; role: string; active: boolean };
type Company = { id: string; name: string; eik: string };
type Access = { user_id: string; company_id: string };

export default async function TeamPage() {
  const ctx = await getContext();
  if (!ctx.tenant || ctx.role !== 'admin') {
    return <div className="content"><div className="notice warn">Само администратори могат да управляват потребителите.</div></div>;
  }
  const [members, companies, access] = await Promise.all([
    ctx.supabase.from('tenant_members').select('user_id,email,role,active').eq('tenant_id', ctx.tenant).order('created_at'),
    ctx.supabase.from('companies').select('id,name,eik').eq('tenant_id', ctx.tenant).order('name').limit(100),
    ctx.supabase.from('company_access').select('user_id,company_id').eq('tenant_id', ctx.tenant).limit(1000)
  ]);
  if (members.error || companies.error || access.error) {
    return <div className="content"><div className="notice warn">Неуспешно зареждане на екипа. Провери миграцията и правата.</div></div>;
  }
  return <TeamManager
    ownUserId={ctx.user.id}
    members={(members.data ?? []) as unknown as Member[]}
    companies={(companies.data ?? []) as unknown as Company[]}
    access={(access.data ?? []) as unknown as Access[]}
  />;
}

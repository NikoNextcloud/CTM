import {getContext} from '@/lib/session';
import {Sidebar} from '@/components/sidebar';
export const dynamic='force-dynamic';
export default async function AppLayout({children}:{children:React.ReactNode}){const c=await getContext();if(!c.tenant)return <div className="pending"><h1>Изчаква се разрешение</h1><p>Акаунтът е удостоверен, но още няма членство в организация. Обърнете се към администратора.</p></div>;return <div className="workspace"><Sidebar tenant={c.tenantName} role={c.role} email={c.user.email||'Потребител'}/><main className="workspace-main"><header className="topbar"><span>Организация: <b>{c.tenantName}</b></span><span className="protected-label">● Защитена сесия</span></header>{children}</main></div>}

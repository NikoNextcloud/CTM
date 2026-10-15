import {getContext} from '@/lib/session';
import {signOut} from '@/app/login/actions';
import {Sidebar} from '@/components/sidebar';
export const dynamic='force-dynamic';
export default async function AppLayout({children}:{children:React.ReactNode}){
 const c=await getContext();
 if(!c.tenant) return <main className="auth-screen"><section className="auth-card"><p className="eyebrow">ДОСТЪПЪТ Е ОГРАНИЧЕН</p><h1>Изчаква се разрешение</h1><p>Акаунтът е удостоверен, но няма активно членство в организация. Администраторът трябва да разреши достъпа в Supabase.</p><p className="muted">Ако това е първият акаунт, следвайте процедурата в docs/ADMIN_BOOTSTRAP.md.</p><form action={signOut}><button className="btn primary" type="submit">Изход от акаунта</button></form></section></main>;
 return <div className="workspace"><Sidebar tenant={c.tenantName} role={c.role} email={c.user.email||'Потребител'}/><main className="workspace-main"><header className="topbar"><span>Организация: <b>{c.tenantName}</b></span><span className="protected-label">● Защитена сесия</span></header>{children}</main></div>;
}

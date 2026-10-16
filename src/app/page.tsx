import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default async function Home(){
 const client=await createClient();
 if(client){
  const {data:{user}}=await client.auth.getUser();
  if(user)redirect('/app');
 }return <main className="welcome"><div className="mark">+</div><div className="eyebrow">НОВА РАБОТНА СРЕДА</div><h1>СТМ <span>2.0</span></h1><p>Единно пространство за фирми, служители, трудова медицина и документи — с контрол на достъпа и проследимост на промените.</p><div className="welcome-actions"><Link href="/login" className="btn primary">Вход в системата →</Link><Link href="/preview" className="btn ghost">Разгледай демонстрация</Link></div><div className="banner">Защитените регистри и списъците за миграция се виждат след вход. Медицинските архиви не са публикувани.</div></main>}

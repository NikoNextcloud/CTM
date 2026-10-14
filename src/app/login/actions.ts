'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
export async function signIn(form:FormData) {
  const client = await createClient();
  if (!client) redirect('/login?error=config');
  const email = String(form.get('email')||'').trim();
  const password = String(form.get('password')||'');
  if (!email.includes('@') || !password || email.length>254 || password.length>512) redirect('/login?error=invalid');
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error) redirect('/login?error=denied');
  redirect('/app');
}
export async function signOut(){const client=await createClient();if(client)await client.auth.signOut();redirect('/login');}

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getConfig } from '@/lib/config';

export async function createClient() {
  const c = getConfig();
  if (!c) return null;
  const cookieStore = await cookies();
  return createServerClient(c.url, c.key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(toSet) {
        try { toSet.forEach(({name,value,options}) => cookieStore.set(name,value,options)); }
        catch { /* Server Components cannot set cookies; proxy handles refresh */ }
      }
    }
  });
}

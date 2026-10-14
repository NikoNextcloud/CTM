import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getConfig } from '@/lib/config';
export async function proxy(request: NextRequest) {
  const c = getConfig();
  let response = NextResponse.next({request});
  response.headers.set('Cache-Control','private, no-store');
  if (!c) return response;
  const client = createServerClient(c.url, c.key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(toSet, headers) {
        toSet.forEach(({name,value}) => request.cookies.set(name,value));
        response = NextResponse.next({request});
        toSet.forEach(({name,value,options}) => response.cookies.set(name,value,options));
        if (headers) for (const [k,v] of Object.entries(headers)) response.headers.set(k,v);
        response.headers.set('Cache-Control','private, no-store');
      }
    }
  });
  await client.auth.getClaims();
  return response;
}
export const config = {matcher:['/app/:path*','/login','/auth/:path*','/api/:path*']};

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getConfig } from '@/lib/config';

export async function proxy(request: NextRequest) {
  const c = getConfig();
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');
  if (!c) return response;

  const client = createServerClient(c.url, c.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        response.headers.set('Cache-Control', 'private, no-store');
      }
    }
  });

  await client.auth.getClaims();
  return response;
}

export const config = { matcher: ['/app/:path*', '/login', '/auth/:path*', '/api/:path*'] };

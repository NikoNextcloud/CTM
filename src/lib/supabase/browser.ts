'use client';
import { createBrowserClient } from '@supabase/ssr';
import { getConfig } from '@/lib/config';
export function createClient() {
  const c = getConfig();
  if (!c) return null;
  return createBrowserClient(c.url, c.key);
}

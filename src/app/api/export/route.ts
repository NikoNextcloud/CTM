import { NextRequest, NextResponse } from 'next/server';
import { getContext } from '@/lib/session';

const columns = {
  companies: ['name', 'eik', 'address', 'status'],
  employees: ['full_name', 'job_title', 'reference_code']
} as const;

function cell(value: unknown) {
  const sanitized = String(value ?? '').replace(/^[=+@\-\t\r]/, '\u0027$&');
  return '"' + sanitized.replace(/"/g, '""') + '"';
}

export async function GET(req: NextRequest) {
  const context = await getContext();
  if (!context.tenant || !['admin', 'specialist'].includes(context.role)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const resource = new URL(req.url).searchParams.get('resource');
  if (resource !== 'companies' && resource !== 'employees') {
    return new NextResponse('Unknown resource', { status: 400 });
  }

  const cols = columns[resource];
  const rowsToExport: Record<string, unknown>[] = [];

  for (let page = 0; page < 40; page++) {
    const result = await context.supabase
      .from(resource)
      .select(cols.join(','))
      .eq('tenant_id', context.tenant)
      .order('id')
      .range(page * 1000, page * 1000 + 999);

    if (result.error) {
      return new NextResponse('Export error', { status: 500 });
    }

    // Supabase cannot infer row types from a runtime-built select() string.
    // The requested columns are fixed by the allowlist above.
    const pageRows = (result.data ?? []) as unknown as Record<string, unknown>[];
    rowsToExport.push(...pageRows);
    if (pageRows.length < 1000) break;
  }

  if (rowsToExport.length >= 40000) {
    return new NextResponse('Export limit reached: use a controlled server-side export job', { status: 413 });
  }

  const csv = '\uFEFF' + [
    cols.join(';'),
    ...rowsToExport.map(row => cols.map(key => cell(row[key])).join(';'))
  ].join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${resource}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

# CTM v0.11 — Visibility of staged EMS-STM company names

## Root cause reproduced against production data (2026-10-16)

Production Vercel is READY at v0.10, and Supabase contains:
- 92 company candidates awaiting verification.
- 0 companies in the confirmed company register.
- 0 employees, examinations and documents.
- 1 manually provisioned admin with an active tenant membership.

The dashboard queried confirmed tables only. It showed 0 companies and 0 employees,
while the staging companies were available exclusively on a separate administrative page.
An admin-RLS transaction confirmed all 92 candidates are readable by that admin.

## Changes

- Returning authenticated users opening / redirect to /app.
- The protected dashboard shows a prominent, admin-only staged-company list with count,
  source, status and a link to the full verification queue.
- The Companies register displays pending archive candidates separately from confirmed companies;
  a zero confirmed-company count remains truthful.
- Migration also surfaces the same queue, and a dedicated sidebar link helps locate it.
- Worksites and job positions now have actual registry pages and appropriate import/export links,
  rather than a Worksites dashboard tile incorrectly linking to Companies.
- Empty-state copy explains why a registry has no records.

## Safety gates

The new server component checks the authenticated tenant and admin role before fetching.
Supabase RLS restricts candidate rows to admins. No candidate is promoted by visiting
these pages; no EIK, employee IDs, EGN or clinical data are invented. Anonymous requests
remain redirected to sign-in. EMS-STM stays active.

## Validation

- Live database aggregate counts and RLS-admin visibility confirmed.
- Production NEXT_PUBLIC_SUPABASE_URL verified to point to the intended project, without
  disclosing the value or any credentials.
- GitHub CI must run full static and production-build tests.
- Vercel READY and deployment SHA must match the commit before marking shipped.
- Signed-in browser E2E with the manually provisioned administrator remains outstanding
  unless authenticated browser automation is made available.

The system is **not** declared ready for real medical records.

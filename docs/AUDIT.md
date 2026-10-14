# Internal review v0.1 — findings and mitigations

## Round 1: functionality
- Historical desktop SQLite prototype did not contain all file bytes. Current cloud scaffold intentionally does NOT claim full migration.
- Real login is implemented via Supabase Auth but cannot function until a separate project/credentials are configured.
- UI modules are placeholders or minimum registries; full occupational medicine workflows not complete.

## Round 2: security
- Removed EGN-derived field from public employees table; only a non-sensitive reference code is exposed.
- Kept sick leave records to doctor access only, and omitted diagnosis/medical file payloads.
- Medical documents metadata deny admin and employer; private Storage remains disabled until audited.
- Corrected audit trigger to avoid referencing OLD on insert.
- Added CSV spreadsheet formula neutralization.
- Supabase SQL **not executed or RLS penetration-tested** without a dedicated project; blocking risk.

## Round 3: infrastructure
- Vercel created separate project with protected preview URLs.
- Lovable design-agent start attempted but service rejected because the workspace has no credits.
- GitHub API connector supports file writes to existing repositories but has no `create_repository` action; private repo creation still needed.
- Supabase create project requires user choice of organization and explicit cost confirmation; existing unrelated project left untouched.
- Local npm install/build blocked by sandbox network DNS; CI build/deploy is still pending.

## Current quality gate
**Development foundation only, NOT production-ready, NOT 100% equivalent to EMS-STM.**

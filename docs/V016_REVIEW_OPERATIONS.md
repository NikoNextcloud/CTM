# CTM v0.16 — verified link workflows, approvals and manageable archive

## What is implemented

- Company candidate confirmation with visible controls and explicit EIK/evidence check.
- User membership requires separate administrator approval; Supabase Auth account
  creation stays exclusively manual. Revoking CTM access does not delete the Auth user.
- Company and employee detail pages have dedicated lifecycle controls with explicit
  confirmation and optimistic revision checks. Archive/restore preserves records
  and database audit triggers. Archived employees are filtered from active registry
  lists and can be restored from the archived list.
- Encrypted archive personnel records have a review action to link to an existing
  company whose archived candidate has a reviewed EIK. The function verifies
  administrator role, tenant, matched firm name, EGN checksum and duplicates.
  Records are created in the employee registry as PENDING, not automatically active.
- The original archive remains immutable. Source linkage is tracked separately in
  private.ctm_archive_employee_links and is not directly accessible through
  the Supabase Data API.
- EGN/TELK/diagnosis/doctor notes are transferred into encrypted clinical storage
  only if the source values pass validation. If invalid, the entire operation is
  refused without a partial employee and the source remains in protected archive.
- Import wizard displays three plain-language steps; advanced column mapping
  remains accessible but is collapsed by default.
- MEGA file-extension counts are no longer in the primary navigation or the
  archive dossier UI. Old technical deep links redirect to archived personnel.

## What is NOT automated

- EIK values are not guessed or bulk written from similar company names. Verified
  evidence remains mandatory per company, using primary business registry records.
- No silent merges of people with matching names.
- Records with invalid EGN are not promoted automatically. Their original
  encrypted archive rows remain available for review.
- Medical scans, PDFs, historic EMS-STM backup and document attachments have not
  been transferred or represented as complete medical dossiers.
- No hard deletion of medical, employment or company history. Administrative
  delete-style actions are reversible archive/deactivation, with audit.

## Security

- All privilege decisions happen on the server and in restricted DB functions;
  client/UI hiding does not replace RLS.
- Admin-only promotion, archive viewing, company candidates and member approval.
- Employer access is limited by existing company_access and database policies.
- Private tables have RLS and revoked anon/authenticated direct grants.
- Public RPC wrappers are SECURITY INVOKER with anon execution revoked.
- Backups must include Supabase Vault key material; restore drill remains
  necessary before declaring medical data migration production ready.

## Test requirements

- GitHub Actions static security gates and Next.js build.
- SQL role-denial tests and synthetic rollback test for atomic archive promotion.
- Browser signed-in approval, archive→employee linkage, and repeat import.
- Check dashboard and listings show confirmed/archived counts consistently.

This release does not claim complete EMS-STM migration or "10/10" readiness.

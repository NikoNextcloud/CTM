# CTM v0.10 - Company identity reconciliation

## Verified input boundary (16 Oct 2026)
- Public GitHub main previously at v0.9 c6ecdc111a96cb5a8c8d354b488d47f32dcbda03.
- Supabase already contains the applied v10_company_candidates_staging migration and 92 candidates.
- Of those candidates: 83 have source_kind mega_root, 9 ems_xlsx; 84 distinct normalized names; 27 with uncertain confidence.
- All 92 candidate EIK values are NULL and review_status pending. This does NOT establish 92 legal entities.
- The original public MEGA folder was not independently downloaded and enumerated in this release. Source candidates came from prior staged extraction and must be reconciled against primary records.
- The private 61-person spreadsheet has unverified employer identity for some records, including 21 rows without work number. Do not attach people to firms by folder name.

## Version control reconciliation
The earlier Supabase migration 20261015141338 / v10_company_candidates_staging was not present in GitHub.
The file supabase/migrations/20261015141338_v10_company_candidates_staging.sql is a reconstruction from the actual current catalog: table, constraints, indexes, policies, grants, immutability and audit triggers. It is included to make new installations reproducible; it is not the historical original SQL text, and it does not contain the 92 data rows.

## New confirmed-company workflow
- An authenticated admin opens /app/migration/companies.
- The candidate name, source and duplicate-name count are shown before review.
- The admin checks official registry identity, types the name verbatim, supplies the EIK and a 24-500 character evidence description, then explicitly confirms.
- A single SECURITY INVOKER PostgreSQL function validates live admin membership, tenant RLS, EIK checksum, exact source name, evidence length and collisions.
- The transaction inserts a company only when necessary; new companies start inactive. It links the source candidate and writes audit events. Repeating the same decision returns the original link.
- Different names assigned to the same EIK and identical names assigned to different EIKs fail rather than inventing a resolution.
- Admins may mark candidates conflict or excluded with an audit trail; none of the 92 existing candidates is automatically approved by the migration.

Formal EIK checksum validation is not legal proof of a company's existence. Confirmation must be grounded in the original contract and the Registry Agency portal: https://portal.registryagency.bg/
BULSTAT law: https://justice.government.bg/home/normdoc/2135503074

## Technical controls
- RLS remains active. All review and promotion actions check current membership with tenant context.
- anon cannot read candidate rows or execute the promoting RPC.
- A two-part foreign key prevents links to firms of a different tenant.
- Candidate source name and hash remain immutable; verified links cannot be silently reassigned.
- Staging mutations are auditable; an approved link is not an active service contract.
- Existing EMS-STM remains operational.

## Evidence and what is NOT completed
- SQL schema and promotion regression tests: transaction-only checks on synthetic candidate data.
- Static UI and authorization tests, Next.js production build and npm dependency audit: must pass before production deployment.
- Browser sign-in -> candidate review -> RLS -> database -> UI confirmation requires an authenticated admin browser session; no automatic Auth users.
- No production medical import: EGN/TELK/diagnoses cannot use the administrative CSV importer. Separate special-category data controls, lawful basis, retention, logs, private storage and tested restore remain required.
- No guessed EIK or synthetic employee IDs. Counts and hashes of accepted source files must reconcile before EMS-STM cutover.

## Next work
Primary contract metadata ingest without health/person data, official UIC reconciliation, worker identity linkages and authenticated Playwright role/tenant tests for all five manually provisioned roles.

## Staging additional company names from Excel
Administrators can use the same protected review page to select a workbook, worksheet,
header row and source-name column. This does not send the original workbook. Only
chosen names and a bounded source label reach the server.
A single UPSERT statement with ON CONFLICT DO NOTHING records additional names
in public.ctm_company_candidates with source_kind uploaded_companies and
review_status pending. The deterministic (source filename + normalized company name)
SHA-256 prevents repeat imports of the same source. Duplicate names within the
source are collapsed and counted; names from distinct sources remain separate
evidence candidates, never silently merged into companies. No EIK is invented.
The database computes normalized_name as a GENERATED ALWAYS column;
the server never attempts to write to it. SQL transaction regression confirms
that re-importing a name from the same source leaves one candidate.
The client explicitly excludes all other columns and the server rejects
obvious personal-ID and medical-content patterns in names.
This flow is not suitable for worker rosters or clinical archives.

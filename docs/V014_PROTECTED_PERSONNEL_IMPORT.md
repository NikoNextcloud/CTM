# CTM v0.14 - protected archived personnel XLSX import

Date: 16 October 2026

## Functionality
The existing CTM app now includes an admin-only Excel import workflow at /app/migration/personnel.
It reads XLSX workbooks in the browser, detects header rows, allows explicit column remapping,
previews missing identifiers and source duplicates, and preserves all supported source fields.
EGN, TELK, primary doctor, diagnosis and additional notes are stored as encrypted archive data
in private.ctm_archive_rows through the Supabase Vault key from the previously applied v013 migration.

Each file gets a SHA-256 source identity. Each source row keeps its worksheet and Excel row index.
Repeated uploads are idempotent; changed content for the same source ID is rejected, not overwritten.
A final database count is checked before the UI reports success. No source workbook is stored
in GitHub, a public bucket, or a Vercel deployment.

## Real source limitations
The previously collected 01_STM_sluzhiteli_IMPORT.xlsx has 61 personnel records, headings on
Excel row 3, 21 rows with no work number, and 1 without EGN. The partial extracts and MEGA
inventory are not an original database export of EMS-STM. MEGA has 8,650 files in 1,985 folders;
only 20 aggregate extension counts have been staged. No clinical scans or PDF documents have
been migrated by this release.

## Roles and states
Only active administrators in the proper tenant can import or open unverified archive entries.
Clinical fields of confirmed employees remain in the existing encrypted medical module,
where admin and doctor roles are permitted. Employer, specialist and auditor do not receive
archive medical/personnel access. Manual Auth account creation remains the only supported option.
Archival employees are displayed clearly as unverified; they are not silently made active employees,
because company EIK and worker-company links still require primary-source reconciliation.

## How to use
Sign in to CTM as admin, open Migration -> Archived Personnel, select the original XLSX, confirm the
workbook sheet, heading row and column mapping, review the number of records and warnings,
and confirm the encrypted import. The resulting archive list and dossier pages show the actual
stored rows. A matching row count is verified at the end.

## Release limits
A logged-in browser end-to-end test with the owner's credentials requires that browser session.
Original EMS-STM database/backup and clinical file attachments remain outstanding. This release
does not assert complete historic migration or permission to treat archive evidence as confirmed.

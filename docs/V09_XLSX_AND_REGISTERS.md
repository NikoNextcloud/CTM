# CTM v0.9: Excel mapping and connected registry actions

## Root cause fixed
The previous XLSX import wrongly enforced one worksheet, exact per-row column width and English headers on row one. Legacy workbooks may contain three worksheets, title lines, headings after several rows, 13 source columns, and inconsistent trailing empty cells.

The updated administrative importer now:
1. Parses XLSX locally in the browser, selects a worksheet, finds the most likely header row and allows manual header-row override.
2. Recognizes Bulgarian and English heading synonyms, includes manually selectable source columns and constant defaults such as a verified company EIK.
3. Allows extra source columns without rejecting the entire workbook; clearly lists excluded column names.
4. Blocks mapping of EGN/TELK/medical data into administrative fields, never sending their cell values to the server action.
5. Requires the current CSV validation, authenticated server preview, SHA-256 confirmation and RLS-protected transactional SQL commit.
6. Offers a local mapping JSON download containing column names and row counts, never cell values.
7. Continues to enforce 100 records, 2 MB XLSX / 128 KB CSV data limits and the development import restrictions on the server.

## Connected actions
- Doctor-only examination scheduling with pending state and no diagnoses.
- Doctor-only unverified sick-leave period registration.
- Role-scoped document metadata registration with unverified state; no file upload.
- Administrator-only migration source registration with pending state.
- Existing company, employee, worksite, position and risk forms remain operational.

## Privacy and migration
The available legacy employee workbook has 61 rows on a sheet with header row 3 and 13 columns; additional sheets must not be discarded.
The source lacks a verified company EIK field. Some employee reference codes are empty and must not be generated or assumed. Separate clinical columns are not mapped into public administrative records.
A structural mapping is not a production-ready import: manually verify company identity, missing identifiers, duplicates and historical status. Do not upload raw sensitive workbooks to GitHub, Vercel or the development Supabase instance.
Medical rollout requires private storage with appropriate access controls, audit of reads, tested restore, retention and legal basis/DPA/DPIA approval.
EMS-STM must remain operating until signed reconciliation and acceptance.

## Evidence required before declaring finished
- Run static tests, synthetic 3-sheet XLSX decoding and Next.js build before one release.
- Verify GitHub main and deployment commit, Vercel READY and read-only health advisors.
- Browser-to-API-to-database testing with manually created test users in all five roles remains a release gate for personal/clinical data.
- Public-client denial and RLS tests must continue to pass.

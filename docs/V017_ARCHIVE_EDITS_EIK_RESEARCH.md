# CTM v0.17 — Archive employee editor and researched employer candidates

## Corrected employee editing

The employees table is empty until personnel are linked to verified employers.
Previously, the EditEmployeePanel existed only for active/linked employee dossiers.

The archival employee detail route now provides **Edit employee data** directly.
Admin-only server action calls restricted RPCs. All source columns may be corrected
except original provenance keys (source, sheet, Excel row). Every edit appends an
AES256-encrypted revision to private.ctm_archive_employee_changes and writes
an audit event, without rewriting the original archive row.

Archive listings and future promotion consult the latest revision. Previously
promoted employees cannot be edited through the original archive; their linked
employee and clinical dossiers have separate controlled editors.

The main employee profile includes a visible top-page Edit button and its
administrative edit form is expanded by default. Confidential medical fields
retain the existing separate permission path.

## Public company research

All 92 company-candidate records are represented in the research table.
As of initial release, 63 have *proposed* EIK and supporting source URL,
6 have ambiguous names, and 23 are unresolved. Some duplicates originate from
both the EMS-STM Excel and the archival folder inventory.

**No proposed EIK is automatically confirmed.** The candidate page displays
the suggested identifier and source link, including official Bulgarian registry,
with a mandatory manual name and EIK verification before promoting a company.
Historical name and legal-form differences require additional scrutiny.

Avoid bulk active-company promotion, automatic joining of employees, or
propagating medical data to a same-name company.

## Security/operational guarantees

- Only active CTM administrators can read or edit confidential archive rows.
- RLS enabled, direct authenticated/anonymous table access revoked.
- Public RPCs are SECURITY INVOKER wrappers; private implementation verifies
  the authenticated administrator and tenant.
- Updates cannot mutate provenance, add/drop column keys, or modify records
  linked to a promoted employee.
- Revision number prevents silent loss through simultaneous edits.
- Changed EGN is checked at the server; existing invalid EGN remains in source
  until a deliberate correction.
- Re-run migrations on synthetic rollback and verify all five role denials.
- Do not put original XLSX files, clinical rows or database keys into GitHub.

## Remaining gaps

- Browser end-to-end interaction through a real authenticated session is
  still required; unauthenticated HTTP checks cannot prove it.
- 23 businesses have no reliable identifier from accessible public sources.
- 6 company names are ambiguous. Official original documents and employer
  records are required to resolve such cases.
- Full legal/medical migration and deletion-retention verification remain pending.

This release is not described as "10/10" or fully completed.

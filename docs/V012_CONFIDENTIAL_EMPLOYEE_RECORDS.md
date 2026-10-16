# CTM v0.12 — Protected employee identifiers and medical notes

## Business request

The administrator requested the removal of a blanket ban on entering EGN and
medical fields in the employee workflow. The warning in the employee form and
employee detail has been replaced with an editable confidential section on the
employee detail page.

## Implementation

- Administrative employee and employer records remain separate from clinical data.
- For a manually created employee, an admin or doctor can enter EGN,
  TELK/expert decisions, diagnoses and medical notes directly in the employee dossier.
- The user reaches the employee detail immediately after creating a new employee.
- A dedicated PostgreSQL table in the non-exposed `private` schema stores only
  PGP/AES-256 encrypted JSON and a keyed HMAC of EGN for within-company duplicate checks.
- The encryption key is created randomly inside Supabase Vault, not in GitHub,
  Vercel client code or user logs. Protected backup of the Vault key is essential.
- A public SECURITY INVOKER wrapper calls a private SECURITY DEFINER function which
  authenticates the user, checks current tenant membership (admin/doctor only)
  and verifies the employee is part of that tenant. Direct table access is revoked.
- Every read and write creates an audit event without medical contents.
  Audit log visibility for these confidential events is restricted to admin.
- Employer, specialist, auditor and unauthenticated sessions do not receive
  EGN, TELK, diagnoses or medical notes.
- Optimistic revision checks prevent silent overwrites from concurrent edits.
- EGN is validated against the date format and national check digit; blank is
  allowed while an identifier is unknown.
- No EGN, diagnoses or other medical content enters the general CSV export.
- Existing EMS-STM archives are not imported or changed by this release.

## Security limits still requiring evidence

- Review GDPR Article 9 grounds, Bulgarian occupational health and professional
  confidentiality obligations, retention and lawful authorized personnel.
- Carry out DPIA where required and document DPA/subprocessor arrangements.
- Verify backups and a restore drill including Vault secrets (losing the key loses
  the ability to decrypt the records).
- Configure explicit incident handling, medical data retention and encrypted
  private document upload (file attachments not implemented in this release).
- Verify the five roles with independently provisioned test identities in a
  signed-in browser and review production access logs.
- Confirm database encryption, access grants, failure behavior and reproducible
  migration against an isolated test tenant before production data entry.

Only manually entered, explicitly authorized records can be stored through
this new section. The generic administrative CSV/XLSX importer still excludes
medical columns and cannot safely import historic clinical documents.

Version numbers, CI success and deployment READY are not substitutes for
compliance review or authenticated browser end-to-end testing.

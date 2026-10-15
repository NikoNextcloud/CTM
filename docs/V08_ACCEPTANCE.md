# CTM v0.8 - Acceptance gate
## Implemented
- Browser-side one-sheet XLSX conversion to CSV for five synthetic administrative registers; existing preview, hash-confirmation and transactional import.
- Duplicate protection for nonempty employee reference codes per tenant/company.
- Fixed stale company access on employer-to-other-role changes.
## Verified before deployment
- Existing v0.7 CI build was READY.
- v0.8 isolated Node 24 production build and static tests succeeded before release.
- Anonymous production export redirected to login (HTTP 307).
- Transactional simulation on v0.7 confirmed employer could see only assigned company; it also revealed stale employer grant leaked one employee to an auditor, targeted by v0.8 SQL fix.
## Outstanding
- Browser E2E with five independently authenticated manually created test users, XLSX preview/commit, CSV download, duplicate rejection.
- SQL migration applied and verified, complete backup/restore drill and legal GDPR Art. 9 / DPIA / DPA sign-off.
- No real personal or medical records may be uploaded in development.
- EMS-STM remains operational until explicit signed migration acceptance.

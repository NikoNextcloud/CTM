# CTM v0.22 — EIK discovered from archival company documents

This is a **documentary enrichment release**, not a declaration that all EMS-STM contracts and medical dossiers have been migrated.

## Evidence processing
- 91 initially pending candidates were researched in v0.21; 89 remain pending after two archival candidates were linked to the one inactive PL PROJECT company.
- Source research found a repeated EIK in unrelated company folders; this is likely the document preparer / sender. Generic repeated identifiers are excluded from candidate-company EIK suggestions.
- The worker collected checksum-valid nine-digit numbers appearing near EIK/BULSTAT/UIC labels. Each number is attached to an existing archived company source folder and cryptographic source fingerprints.
- A tenant-private, RLS-protected \`ctm_candidate_doc_eik_evidence\` table holds **23 EIK proposals across 20 archive candidates**. 11 proposals are evidenced by documents that also contain the candidate's name; 13 are additionally name-matched in two independent secondary public directories. Conflicts and aliases remain visible, not silently merged.
- **Seven company candidate source rows** with the strongest evidence were given a PROPOSED EIK in \`ctm_company_research\` (raising proposals to 75 of 92). All seven keep \`ctm_company_candidates.review_status='pending'\`; the seven actions were independently audited in \`public.audit_events\`.
- 17 firm candidate source rows still have no proposed EIK. The register contains two inactive companies and 44 pending employees. There are 17 unresolved archived employees.

## Source quality
Third-party directories are not current Trade Register certificates. Some original documents name multiple legal entities, one number can appear as a service-provider EIK, and several companies share similar names. For every identity and affiliation, a human must check the current Trade Register record and employer contract, plus confirm current workforce data before activation.

## Security
Names and paths of original MEGA documents and source extracts remain encrypted in Supabase. The new private table has RLS and no direct \`anon\` or \`authenticated\` grants. Admin-only RPC functions check active tenant membership and restrict output to public company metadata. No EGN, personal identifiers, diagnoses, original documents, credentials or full MEGA URL have been added to GitHub.

## Outstanding
- Official current Trade Register and contract verification for 89 pending company candidates.
- 17 historic employees still lack sufficient evidence: 12 lack independent evidence, four have invalid EGN checksum, one has missing EGN.
- Three additional XLSX files were found inside MEGA ZIPs, but protected transfer of their potentially sensitive contents was blocked. No migration was performed from those files; temporary job tokens were revoked.
- Complete extraction/OCR of scanned medical documents, original binary storage capacity, verification of clinical histories by the correct medical role, and authenticated role-by-role browser E2E remain outstanding.


# CTM v0.21: documentary reconciliation report (17 October 2026)

This is a PARTIAL migration. Do not declare occupational-health contracts, current employment, or clinical conclusions active.

Company verification: 91 originally pending candidates were checked individually against publicly accessible sources; 56 matched names and proposed EIK in two independent SECONDARY directories, 7 in one, 4 had name discrepancies, and 24 had no proposed EIK. These are not official current Trade Register certificates. Two archival source candidates for PL PROJECT OOD, EIK 204012087, have an additional identity match in an official Bulgarian ISUN project publication; both map to one INACTIVE legal-entity record. Other candidates remain pending.

Archived employee matching: 61 records from the original EMS-STM list, all historically attributed to PL PROJECT. 56 checksum-valid EGN, 4 invalid, 1 missing. The original Excel source was retrieved separately from MEGA, checked at 17,336 bytes with SHA256 5d9f395900f80b75f27e2328ef834282a5606d246454d127990867bf42f1191e, and its entire 57-row content was encrypted separately in private PostgreSQL storage. The 44 matches require valid EGN and exact full name appearing IN THE SAME ROW of the second source. 44 records are inserted in the main register with current_status=pending. 44 source records have immutable evidence crosswalks and migration audit events; none of the original 61 archive sources was deleted. No active medical conclusion or current clinical record was imported.

Unresolved 17: 12 not corroborated by the second original file, 4 invalid EGN and 1 no EGN. They remain in the encrypted archive and explicit review queue.

Sensitive fields, EGN, diagnosis, or the MEGA decryption key must never be committed to GitHub or written to a public report. All evidence tables have RLS and no direct anonymous/authenticated table privileges. Admin-only RPCs separately verify active tenant administrator access. Employer SELECT on employees requires current_status=active. A privileged, audited single system migration job executed the one-time reconciliation and is not exposed to application roles.

Completion still requires independent current Trade Register checks for the other 89 company candidates, documentary validation of occupational health contracts and employment statuses, review of 17 unresolved employees, and role-authenticated browser E2E tests. The original EMS-STM remains operational; no source archives were modified.


# Задължителни условия за реални пациенти / здравни документи

- [ ] Separate production Supabase organization/project, approved region and data residency review
- [ ] Written controller/processor responsibilities and DPAs, independent GDPR/legal review
- [ ] Data Protection Impact Assessment (DPIA) for processing health data
- [ ] Strict user identities and enforced MFA, invitations; offboarding; least privilege
- [ ] Automated RLS allow+deny tests with multiple tenants, users, employers, doctors
- [ ] End-to-end user tests, CSRF and rate limiting, session cookie security
- [ ] Document Storage: private bucket, ownership policies, signed access, malware scanning
- [ ] Encryption strategy for EGN, full medical details and keys; data minimization
- [ ] Independent security assessment, restore drill, disaster-recovery objectives
- [ ] Source-file inventory + SHA256 comparison + doctor-approved migrations
- [ ] Observability logs devoid of EGN and medical fields; tamper-resistant audit
- [ ] Bulgarian occupational-medicine law and retention rules confirmed with specialist

**Until every relevant item has passed, test data ONLY.**

## V0.6 стоп-условия
- [ ] GitHub CI успешно изпълнява всичките пет статични серии и v06Security; няма регресии.
- [ ] Възстановяване на пълна изолирана БД и отделните файлове е успешно изпробвано.
- [ ] Пълни тестови employer/doctor/auditor/specialist роли и поне две фиктивни фирми.
- [ ] Зададена MFA политика и защита от компрометирани пароли.
- [ ] Договор за търговско използване на Vercel и обработващи данни подизпълнители.
- [ ] Медицинските документи минават отделен storage/security/legal gate.

# CTM 2.0: Administration of users (development stage)

Entry point: /app/team, visible only to an active tenant administrator. No public sign-up or anonymous access.

## Configure once in Supabase

1. Authentication > URL Configuration: set Site URL to https://ctm-pearl.vercel.app and add https://ctm-pearl.vercel.app/auth/accept-invite to the Redirect URL allow list.
2. Configure SMTP for organizational email delivery. Default Supabase mailer has restrictive delivery quotas.
3. Enable leaked-password checking where supported and review MFA requirements.
4. Vercel production must have NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and server-only SUPABASE_SERVICE_ROLE_KEY belonging to the same Supabase project. Never put service keys in NEXT_PUBLIC fields or GitHub.
5. Apply supabase/migrations/202610150002_team_admin.sql before inviting users.

## Workflow

- Administrator can invite a new user by email; recipient sets their own password at /auth/accept-invite.
- Existing Supabase Auth users can be added to organization membership.
- Employer role requires one or more company assignments. Enforced by PostgreSQL.
- Roles are admin, doctor, specialist, employer and auditor.
- Access can be disabled; no self-demotion and no deactivation of the last active administrator.
- Audit events record changes in tenant membership, with no clinical contents.

## Important limitations

- Test invite delivery and password creation end-to-end using a non-production mailbox.
- If email invitation succeeds but assigning access fails, a user can exist without membership; retry from the UI.
- Medical, employer isolation and permission boundaries require separate integration and legal testing before any real data are imported.
- Server service-role grants bypass RLS, so the key must be restricted to trusted server deployment and admin access to Supabase must be controlled.
- The team UI currently lists up to 100 companies and 1000 access records, and needs pagination before large-scale usage.
- No production claim is made for confidential health records, regulatory compliance, backups or audit certification.

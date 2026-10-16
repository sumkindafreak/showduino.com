# HauntSync: Account and Creator Launch Checklist

Working checklist, 16 October 2026. Website main branch is the public source; do not confuse merged code with tested deployment.

## Account settings to review

1. In your Showduino Supabase project, open Authentication settings.
2. Allow email/password signup and require email confirmation.
3. Set server-side minimum new password length to 12 characters. The website signup and password-reset forms also request 12 characters.
4. Leaked-password screening is available on Pro and above. The current Supabase organisation uses the Free plan. Upgrading is optional and has **not** been performed.
5. Verify the permitted redirect addresses match account confirmation and recovery pages on your own HTTPS domain.
6. Before public launch, set up a production email sender, verify delivery, and consider CAPTCHA with the matching frontend integration.
7. Review Supabase Security Advisor warnings, row access rules and publication privacy.

## End-to-end tests

| Test | Expected result |
| --- | --- |
| Homepage to Join HauntSync | Branded three-step welcome screen |
| Welcome to account | One shared Showduino ID |
| New weak password | Registration stops below 12 characters |
| Signup and email confirmation | Test email arrives; confirmation link returns successfully |
| Sign in and out | Session and private controls change correctly |
| Password recovery | Email link and new password work |
| First profile | Private by default; saved username and photo persist |
| Opt-in publication | Creator directory shows only the public snapshot |
| Unpublish | Public creator disappears, private profile remains |
| Share .shdo | File is sanitised, user confirms, and preview never runs hardware |
| Mobile | All forms, links and confirmation screens remain usable |
| Unrelated account | Cannot read private projects or private profile |

Use a controlled test account and save screenshots of the results. Static JavaScript checks cannot verify production email delivery.

## Remaining launch considerations

- Production email delivery and CAPTCHA are external configuration and integration tasks.
- Self-service account deletion and personal data export are not built yet; privacy requests currently go through support.
- Following other creators, comments, likes and notifications are future community features.
- Cloud services must never be a dependency of the P4's local show execution.

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

## Enable Google sign-in (Google Cloud + Supabase)

The website now calls Supabase Auth's `signInWithOAuth({provider:'google'})` and returns to `https://show-duino.com/welcome.html`. This **does not** enable Google in Supabase automatically: the owner must create a Google OAuth client and enter its ID/secret in the protected Supabase Dashboard. Never commit a Google OAuth client secret or any Supabase secret/service key to a public website repository.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and create or select a Google Cloud app. Configure branding and audience. Choose **External** for public sign-in and publish the consent screen when ready; while in test mode, add authorised test-user accounts.
2. In [Google Auth Platform Clients](https://console.cloud.google.com/auth/clients), create an OAuth client ID with application type **Web application**.
3. Under **Authorized JavaScript origins** add `https://show-duino.com`.
4. Under **Authorized redirect URIs** add Supabase's Auth callback:
   `https://fczxcvlyydcqdhjkejmd.supabase.co/auth/v1/callback`
   This Google destination is not the site's welcome page.
5. In the [Showduino Supabase Auth providers dashboard](https://supabase.com/dashboard/project/fczxcvlyydcqdhjkejmd/auth/providers), open **Google**, enable the provider and enter Google's **Client ID** and **Client Secret** in the protected settings. Save.
6. In [Supabase URL Configuration](https://supabase.com/dashboard/project/fczxcvlyydcqdhjkejmd/auth/url-configuration), add `https://show-duino.com/welcome.html` to the Redirect URLs allowlist; preserve the existing confirmation and password-reset redirects.
7. Open `https://show-duino.com/account.html?next=welcome` in a private browser. Press **Continue with Google**, consent using a permitted Google test account and verify you return to the welcome page signed in.
8. Save a HauntSync creator username/photo and test returning to that same profile using Google. Confirm sign-out, cancelled consent, disabled provider errors, and mobile login.

Important: Google sign-in shares the Supabase authentication system, but identity linking and account merging depend on verification/identity-link policies. Verify a returning email/password user's behaviour before advertising automatic account merging.

References: [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## End-to-end tests

| Test | Expected result |
| --- | --- |
| Homepage to Join HauntSync | Branded three-step welcome screen |
| Welcome to account | One shared Showduino ID |
| New weak password | Registration stops below 12 characters |
| Signup and email confirmation | Test email arrives; confirmation link returns successfully |
| Google login | Google consent returns signed in to HauntSync welcome and existing profile is accessible |
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

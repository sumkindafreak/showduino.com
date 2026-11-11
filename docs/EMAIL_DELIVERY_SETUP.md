# Account email delivery (confirmation and password reset)

Status on 11 November 2026: **not verified.** Nothing in this repository can show whether
Supabase is using a custom SMTP sender; that setting is only visible in the dashboard.

## What was checked

| Check | Result |
| --- | --- |
| Accounts in the live project | 1 (the owner), created 7 August 2026 |
| Confirmation or reset emails recorded for any other address | None |
| Auth requests in the last 24 hours of logs | None |
| Google sign-in | Off (`features.googleSignIn: false`), provider not enabled |
| Turnstile bot check | Off (`captcha.siteKey` empty) |

So no member of the public has ever received a Showduino email. Delivery is untested.

## Why this blocks launch

Supabase's built-in sender is for testing only. Its documentation says it sends only to
addresses that belong to the project's own team and is limited to a few messages per hour.
If the project is still on it, a visitor who signs up gets no email, and the website shows
the same neutral "check your inbox" message either way. That message is deliberate (it stops
people testing which addresses have accounts), so the page cannot reveal the problem.

## Set up (owner, in the dashboards; no secrets go in this repository)

1. Choose a transactional email provider and verify a sending domain or address with it.
   Add the SPF and DKIM records it gives you at your DNS host, and a DMARC record.
2. Supabase dashboard → Authentication → Emails → SMTP Settings → enable custom SMTP.
   Enter the provider's host, port, username and password, sender address and sender name.
3. Authentication → Rate Limits: set the hourly email limit for the launch you expect.
4. Authentication → URL Configuration: Site URL `https://show-duino.com`; redirect allow-list
   contains `https://show-duino.com/account.html`, `https://show-duino.com/account.html?confirmed=1`
   and `https://show-duino.com/welcome.html`.
5. Authentication → Emails → Templates: paste `supabase/email-templates/confirm-signup.html`
   and `supabase/email-templates/recovery.html`.
6. Authentication → Sign In / Providers → Email: confirm email ON, minimum password length 12.
   Set the email OTP expiry to one hour or less (the security advisor currently warns about this).

## Prove it (use an address that is NOT a member of the Supabase organisation)

| # | Step | Expected |
| --- | --- | --- |
| 1 | Sign up on `account.html` with the 14+ box ticked | Email arrives within a minute, from your sender, not in spam |
| 2 | Open the link | Lands on `account.html?confirmed=1`; sign-in works |
| 3 | "Resend confirmation" for a second new address | A second email arrives |
| 4 | "Forgot password?" | Reset email arrives; link opens the new-password form; new password works |
| 5 | Wait past the link expiry, open an old link | The page explains the link expired and offers a new one |
| 6 | Schedule account deletion, then cancel it | Status shows scheduled, then cancelled |
| 7 | Delete the test account when finished | Account gone |

Record the date, the provider and the result of each row in `docs/WEBSITE_ACCEPTANCE_RESULTS.md`.
Until rows 1 to 4 pass, do not describe sign-up as working.

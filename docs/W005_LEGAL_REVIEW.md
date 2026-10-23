# W005: legal pages, founder confirmations and legal review

**Status: drafts.** `privacy.html`, `terms.html` and `guidelines.html` describe how the site
works today, but they are not legal advice and have not been reviewed by a lawyer. Each
detail only the founder can supply is shown on the page as a highlighted **To confirm** item.

`node tests/w005-legal-pages.test.cjs` lists the open items. The launch gate is
`LEGAL_FINAL=1 node tests/w005-legal-pages.test.cjs`, which fails while any item or the draft
banner remains.

## Founder confirmations (fill in on the pages)

| Item | Page |
|---|---|
| Legal name of the person or company running Showduino; sole trader or limited company (company number) | privacy `#who` |
| Postal address for data protection correspondence | privacy `#who` |
| ICO data protection fee registration, or the exemption relied on | privacy `#who` |
| Email delivery provider used by Supabase Auth (custom SMTP) | privacy `#processors` |
| Transfer safeguard for each provider (Supabase, Cloudflare, email provider, jsDelivr) | privacy `#processors` |
| Retention: Supabase auth logs (plan), resolved reports, moderation log, support emails, backups | privacy `#data`, `#deletion` |
| Target time for deletion requests | privacy `#deletion` |
| Minimum age for a Showduino ID | privacy `#age`, terms `#account` |
| Target response time for appeals and complaints | terms `#complaints` |
| Any further limitation of liability | terms `#liability` |
| Governing law and courts | terms `#law` |

## For a qualified reviewer

- Lawful bases in the privacy notice table (contract, legitimate interests, legal obligation).
- Content licence wording in terms `#content`, and the CC BY 4.0 / CC0 1.0 choice for shared shows.
- Liability and consumer-rights wording.
- **Online Safety Act 2023.** HauntSync lets UK users post content others can see, so it is a
  user-to-user service. Ofcom expects an illegal content risk assessment and a children's
  access assessment to be done and recorded, with terms that explain reporting and
  complaints. The pages now describe reporting, moderation, illegal-content removal and
  appeals; the assessments themselves have not been done.
- **Data (Use and Access) Act 2025.** From 19 June 2026 controllers must have a data
  protection complaints process; the privacy notice commits to acknowledging complaints
  within 30 days.
- The retired Firebase forum (`HauntSyncForum_Configured/`, project `hauntsync-forum-4b992`)
  is no longer served, but any personal data still in that Firebase project is not covered by
  the new notice. Decide whether to export and delete it.

## What the pages promise that the founder must be able to do

- Answer access, correction, deletion and portability requests within one month.
- Delete an account on request, including stored profile photos and post images
  (database rows cascade; storage files must be removed through the Storage API or dashboard).
- Remove apparently illegal content as soon as it is reported.
- Review every appeal and reply with the outcome.

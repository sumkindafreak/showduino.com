/* W005 (W5-04): the privacy notice, terms and community guidelines cover what the UK launch
 * needs, describe the site as it actually works, never claim legal approval, and mark every
 * detail still awaiting the founder. Set LEGAL_FINAL=1 for the launch gate: it then fails
 * while any "To confirm" marker or the draft banner remains. */
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const privacyHtml = read('privacy.html'); const termsHtml = read('terms.html'); const guideHtml = read('guidelines.html');
const privacy = text(privacyHtml); const terms = text(termsHtml); const guide = text(guideHtml);
let n = 0; const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const has = (body, re, msg) => ok(re.test(body), msg + ` (expected ${re})`);

// Privacy notice: UK GDPR content the brief lists.
has(privacy, /UK GDPR/, 'privacy names the UK GDPR');
has(privacy, /Data Protection Act 2018/, 'privacy names the DPA 2018');
has(privacyHtml, /href="https:\/\/ico\.org\.uk\/make-a-complaint\/"/, 'privacy links to the ICO complaint page');
for (const right of [/copy of your personal data/, /correct data/, /delete your data/, /restrict/, /object/, /portability/]) has(privacy, right, 'privacy lists the right');
has(privacy, /within one month/, 'privacy gives the response time for rights requests');
has(privacy, /acknowledge it within 30 days/, 'privacy sets out the complaints process (DUAA 2025)');
for (const p of [/Supabase/, /Cloudflare/, /jsDelivr/, /London \(AWS eu-west-2\)/, /Turnstile/]) has(privacy, p, 'privacy names the processor or location');
has(privacy, /outside the UK/, 'privacy covers international transfers');
for (const topic of [/posts/, /comments/, /follow/, /shared show/, /Reports/, /Moderation records/, /restricted or suspended/]) has(privacy, topic, 'privacy covers community data');
has(privacy, /How long/, 'privacy states retention');
has(privacyHtml, /id="deletion"/, 'privacy explains account deletion');
has(privacy, /remove your profile photo and post images from storage/, 'deletion covers stored images');
has(privacyHtml, /id="age"/, 'privacy has an age section');
has(privacy, /strictly necessary/, 'privacy explains device storage');
has(privacy, /Payments are switched off/, 'privacy says payments are off');
ok(!/If you choose Google sign-in/.test(privacy), 'privacy must not describe Google sign-in as available while it is switched off');
has(privacy, /Google sign-in is not currently offered/, 'privacy states Google sign-in is not offered');

// Terms.
for (const t of [/Reporting and moderation/, /Complaints and appeals/, /not certified life-safety equipment/, /CC BY 4\.0/, /CC0 1\.0/, /You keep ownership/, /death or personal injury/, /Payments are switched off/, /Starter, Pro and Studio memberships are proposed/]) has(terms, t, 'terms cover');
has(terms, /one administrator: the founder/, 'terms say the founder is the only administrator');

// Guidelines.
for (const g of [/Appeal/, /illegal/, /look-alike spellings/, /not by an automated tool/, /Who you follow is shown only while both creator pages are published/]) has(guide, g, 'guidelines cover');

// No claim of legal approval or certification anywhere.
for (const [name, body] of [['privacy', privacy], ['terms', terms], ['guidelines', guide]]) {
  ok(!/(legally (approved|reviewed|compliant)|fully compliant|GDPR[- ]compliant|approved by (a )?(lawyer|solicitor))/i.test(body), `${name} must not claim legal approval`);
}

// Founder-confirmation markers: consistent, visible, and gated for launch.
const markers = [];
for (const [file, html] of [['privacy.html', privacyHtml], ['terms.html', termsHtml], ['guidelines.html', guideHtml]]) {
  const found = html.match(/<span class="legal-todo" data-legal-todo>[\s\S]*?<\/span>/g) || [];
  found.forEach((m) => { ok(/>To confirm: /.test(m), `${file}: marker must start "To confirm:"`); markers.push(`${file}: ${text(m).trim()}`); });
  ok((html.match(/data-legal-todo/g) || []).length === found.length, `${file}: every marker uses the standard markup`);
  const banner = /class="legal-status"/.test(html);
  if (found.length) ok(banner, `${file}: a page with open items must show the draft banner`);
  if (process.env.LEGAL_FINAL === '1') {
    ok(!found.length, `${file}: ${found.length} founder item(s) still open`);
    ok(!banner, `${file}: remove the draft banner once reviewed`);
  }
}
const email = /showduino38@gmail\.com/;
for (const [name, html] of [['privacy', privacyHtml], ['terms', termsHtml], ['guidelines', guideHtml]]) has(html, email, `${name} gives the contact address`);

console.log(`PASS: ${n} legal page checks.`);
console.log(`Open founder items (${markers.length}):\n  - ` + markers.join('\n  - '));

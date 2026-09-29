# Legal audit of the codebase and public legal documents

**Date:** 29 September 2026
**Commit reviewed:** `origin/main` at the time this document was written
**Scope:** Public legal pages in `apps/rowboat-www`, the root `LICENSE` and `NOTICE`, the docs-site license page, and the product code those documents describe (web console, desktop app, Go API).
**Method:** Read the published text, then traced the corresponding behavior in source. Findings below are limited to what the repository can prove.

This is an engineering compliance review. It is not a legal opinion, not attorney work product, and not a certification under the GDPR, UK GDPR, CCPA/CPRA, or any other law. A lawyer should decide which items to change in the public documents, the product, or both. Contracts with vendors (DPAs, SCCs, Stripe tax settings, OpenRouter account privacy settings, WorkOS configuration) are outside the repository and are marked unverified.

## What is published

| Surface | Path | Effective date |
| --- | --- | --- |
| Privacy Policy | `apps/rowboat-www/app/(legal)/privacy/page.tsx` | 8 September 2026 |
| Terms of Service | `apps/rowboat-www/app/(legal)/terms/page.tsx` | 8 September 2026 |
| Responsible Disclosure | `apps/rowboat-www/app/(legal)/responsible-disclosure/page.tsx` | 8 September 2026 |
| Security and privacy (product description, not a policy) | `apps/rowboat-www/app/(marketing)/sim-landing/subpages/sim-security-page.tsx` | none |
| Apache License 2.0 | `LICENSE` | n/a |
| Fork notice | `NOTICE` | copyright 2026 |
| Docs license page | `apps/docs/docs/getting-started/license.mdx` | still points at upstream Rowboat Labs |

Footer and sitemap link Privacy, Terms, and Responsible Disclosure (`apps/rowboat-www/app/(marketing)/site.ts`, `apps/rowboat-www/app/sitemap.ts`). There is no public cookie policy, subprocessors page, data processing addendum, or `/.well-known/security.txt`.

Sign-in and sign-up show “By continuing, you agree to our Terms and Privacy Policy” next to the Google button (`apps/rowboat-www/components/auth/auth-shell.tsx`). That is a link, not a stored acceptance record.

## Severity summary

| ID | Severity | Topic |
| --- | --- | --- |
| L-01 | High | Desktop analytics is on by default, and the renderer client ignores the privacy switch. The security page says analytics is fail-closed until the user enables it. |
| L-02 | High | Hosted model calls go to OpenRouter with no in-request training or logging prohibition. The privacy policy says model providers are contractually barred from training on customer data, and it makes a Google Limited Use promise. |
| L-03 | High | The repository is Apache 2.0. The Terms forbid competing products and reverse engineering. Copyright holders do not match. |
| L-04 | High | No subprocessors list and no published DPA, while the policy says Oppulence is a processor for connected-source data and relies on SCCs. |
| L-05 | Medium | Account-deletion and disconnect behavior does not match the retention and export promises. |
| L-06 | Medium | “We honor Global Privacy Control” has no implementation. |
| L-07 | Medium | Several processors receive personal data and are not named. Analytics is described as first-party. |
| L-08 | Medium | Controller identity is incomplete and inconsistent across legal name, brand, and product identifiers. |
| L-09 | Medium | Arbitration and age terms are not recorded in the product. |
| L-10 | Low | Third-party license notices are incomplete for redistribution. |
| L-11 | Low | Responsible-disclosure operational commitments are not backed by a machine-readable contact file. |

## L-01 — Analytics consent does not match the public description

**Privacy Policy, “Cookies and similar technologies”:** the Service uses strictly necessary cookies and “first-party product analytics.” It does not say analytics is off until the user opts in.

**Security page:** “PostHog analytics is fail-closed until you enable it. You can turn it off.”

**Desktop default is on.** `shareUsageData` defaults to `true`, and the comment says that is intentional so existing installs keep analytics (`apps/x/packages/shared/src/privacy.ts`). A missing `privacy.json` parses to that default (`apps/x/packages/core/src/config/privacy.ts`). Startup then calls `setAnalyticsEnabled(config.shareUsageData)`, so a new install sends analytics as soon as the main-process client is configured.

The in-memory flag in `apps/x/packages/core/src/analytics/posthog.ts` starts `false`, which is fail-closed only until `applyPrivacyConfig()` runs. After that, the stored default turns it on. That is opt-out, not opt-in.

**The renderer client is not behind the switch.** `apps/x/apps/renderer/src/main.tsx` mounts `PostHogProvider` whenever `VITE_PUBLIC_POSTHOG_KEY` is set, with `capture_exceptions: true`. The `analytics:bootstrap` IPC handler returns the installation id, API URL, and app version, and does not read `privacy.json` (`apps/x/apps/main/src/ipc.ts`). Renderer events in `apps/x/apps/renderer/src/lib/analytics.ts` and `useAnalyticsIdentity.ts` call `posthog-js` directly. They record sign-in, OAuth provider connection flags, chat sessions, transcription metadata, and a count of notes in the workspace. Turning off “share usage data” stops the Node client. It does not stop this renderer client.

**Identified, not anonymous.** When the main-process client is enabled, `identifyIfSignedIn` sends the account id, email, plan, and subscription status to PostHog (`apps/x/packages/core/src/analytics/identify.ts`). The privacy schema comment calls this “anonymous product analytics.” The events are tied to a person.

**Web is closer to opt-in, and the two products disagree.** The Go console default leaves `ShareUsageData` false (`defaultPreferences()` in `apps/rowboat-api/internal/console/service.go`). The web wrapper waits for that flag before capture and strips property keys that look like email, name, prompt, or relationship content (`apps/rowboat-www/lib/analytics/analytics.ts`). The settings control treats a missing value as unchecked (`apps/rowboat-www/components/features/settings/app-settings/app-settings.tsx`). A web user who never opts in should not be captured. A desktop user is captured unless they find the switch, and even then the renderer may keep sending.

**Why it matters.** The security page is the page that claims to describe implementation. It currently describes a control the desktop does not implement. In the EEA and UK, non-essential analytics generally needs consent before the identifier is set (ePrivacy), separate from a GDPR legitimate-interest argument. A default-on identified stream that includes email is a weak legitimate-interest case and is not consent. Calling the stream “first-party” is also inaccurate: both clients post to `https://us.i.posthog.com` unless an env override changes the host.

No Meta, Google Ads, Hotjar, FullStory, Segment, Mixpanel, or Amplitude tags showed up in the web or desktop renderer. The “no advertising cookies / no sale for cross-context advertising” statements are consistent with the code that was searched. PostHog is still a third-party analytics processor and should be named.

**What to change.** Pick one rule and make the page, the desktop default, and the renderer client follow it. If the security page is the intended rule, default `shareUsageData` to false and gate `PostHogProvider` (and every direct `posthog-js` call) on that flag before initialization. If analytics stays on by default, rewrite the security page and add a consent step before any EEA/UK identifier is created. Name PostHog in the privacy policy either way.

## L-02 — Model-provider promises are not enforced on the request

**Privacy Policy, “AI processing” and “Google user data”:** relevant content is sent to model providers who “are prohibited from using your data to train their models.” Google user data is not used to train generalized models, and humans do not read it except in the stated cases. The product also says it minimizes context and redacts sensitive values “where feasible.”

**What the gateway does.** Hosted chat completions are routed to OpenRouter (`apps/rowboat-api/internal/llm/router_test.go` documents that `openai/*`, Anthropic, and Google models go to `openrouter.ai`). The outbound request sets `Authorization`, an idempotency key, `HTTP-Referer: https://app.solomon-ai.co`, and `X-Title: Solomon AI` (`apps/rowboat-api/internal/llm/chat.go`). There is no `provider.data_collection: "deny"`, no zero-data-retention route, and no header that tells OpenRouter or the upstream lab to disable prompt logging or training.

OpenRouter’s account-level privacy setting, if one exists in a dashboard this repo cannot see, might still be strict. The code does not enforce it. A dashboard toggle can be changed without a code review. Google’s Limited Use rules also restrict transfer of Google user data to third parties except as needed for the user-facing feature. Sending Gmail or Calendar content through an aggregator that may log prompts is the kind of transfer that needs a written subprocessor term and a technical control, not only a policy sentence.

The referer and title still say Solomon AI and `app.solomon-ai.co`. The public legal entity on the policies is Playbook Media, Inc., doing business as Oppulence. Upstream providers will attribute the traffic to the old name.

**What to change.** Set the no-training / no-retention option on every hosted completion, and test that the upstream request actually contains it. Name OpenRouter and the labs it fans out to. Align the referer and title with the public brand. Keep the “where feasible” redaction sentence only if a specific redaction step exists for the payloads that leave the machine; this audit did not find a gateway-level redactor on the chat request.

## L-03 — Apache 2.0 and the Terms describe different deals

The root `LICENSE` is the Apache License 2.0. `NOTICE` says this tree is a fork of Rowboat (Apache 2.0) and that redistribution must keep the notice. Apache 2.0 grants recipients a copyright and patent license to use, modify, and distribute the work, including in competing products. It does not allow a downstream Terms of Service to take those rights back from someone who received the source under Apache.

The Terms say the opposite about the desktop application, which they define as part of the Service:

- a limited, revocable license for internal business purposes;
- no reverse engineering except where the law forbids that restriction;
- no access in order to build a similar or competing product, and no benchmarking for a competitor;
- Oppulence owns the software, models, design, and documentation.

Those restrictions can govern a hosted service. They cannot sit on top of an Apache-2.0 grant for the same bits without telling the reader which grant wins. Right now a person can clone the public tree under Apache 2.0 and also be told, if they use the desktop app, that they may not compete or benchmark.

Copyright notices do not agree:

| Place | Holder |
| --- | --- |
| Privacy, Terms, Responsible Disclosure | Playbook Media, Inc. |
| Marketing footer (`site.ts`) | “Playbook Media” (no “Inc.”) |
| `NOTICE` | Oppulence Engineering, 2026 |
| `LICENSE` appendix | `Copyright [2024] [RowBoat Labs]` — brackets still present; the Apache appendix says to remove them |
| Docs license page | Links to `github.com/rowboatlabs/rowboat` and pastes the same unfilled appendix |
| LLM gateway headers | Solomon AI, `app.solomon-ai.co` |

`NOTICE` also understates the fork. It lists the Electron app, CI, and packaging. The tree contains the Go API, the marketing and product web app, billing, and connectors. A NOTICE that says the modifications are “including but not limited to” three items is not false, but it is a poor record of what a downstream redistributor is supposed to attribute.

**What to change.** Decide whether the public repository stays Apache 2.0. If it does, narrow the Terms so they govern the hosted service and accounts, and add a sentence that source received under Apache 2.0 is governed by that license. If the product is meant to be proprietary, replace `LICENSE` and stop distributing the tree under Apache. Either way, put one legal name in the copyright line, fill the appendix, and update `apps/docs/docs/getting-started/license.mdx` so it does not send readers to the upstream project’s license as if it were this product’s only notice.

## L-04 — Processor role is claimed; the processor paperwork is not in the product

The privacy policy says that for connected-source data Oppulence is generally a processor, and that transfers out of Europe rely on Standard Contractual Clauses and the UK addendum, which people can request by email.

The repository has:

- no data processing addendum or customer-facing SCC exhibit;
- no subprocessors list, and no in-product way to subscribe to subprocessor changes (GDPR Article 28 expects this when the vendor is a processor);
- no disclosed EU or UK representative (Article 27), and no statement that one is unnecessary because of an establishment there;
- no per-purpose legal-basis map. The European section lists four bases. It does not say which basis covers analytics, support chat, or hosted inference.

That is normal for a policy that points at contracts kept outside git. It is not enough for a customer who is told, on the website, that those safeguards exist. The audit cannot confirm the contracts.

**What to change.** Publish a subprocessors page that matches the code (see L-07) and a DPA customers can execute. If there is no EU establishment, name an Article 27 representative or document why none is required.

## L-05 — Retention, deletion, and export

**What the policy says.**

- Disconnecting a source stops sync. Previously synced data “is deleted according to your workspace settings or on request.”
- Account deletion deletes or de-identifies personal information within 30 days, except for legal, tax, security, or dispute holds. Backups are purged on a rolling schedule.
- People can export “much of” their content in product. The Terms say that after termination, data stays available for a reasonable period so the customer can export it.
- State and European sections promise access, deletion, and portability, exercised by emailing `privacy@oppulence.io`.

**What the code does.**

`DELETE /v1/me` (`apps/rowboat-api/internal/account/handler.go`) is a real deletion path: confirmation word, step-up proof, Stripe subscriptions cancelled first, connector grants revoked, then a database cascade, then WorkOS session revocation and user deletion. Immediate deletion satisfies a “within 30 days” ceiling for rows the cascade actually removes.

Gaps:

1. **WorkOS deletion can fail open.** If `DeleteUser` fails, the handler logs “delete it manually” and still returns success with `identityDeleted: false`. Name and email can remain at the identity provider with no queued retry in this handler. The 30-day promise then depends on someone reading logs.
2. **Local billing rows are destroyed, not retained.** The handler comment says the subscription is loaded “for the dispute and tax trail” and then notes that the cascade deletes the billing rows. The trail that remains is an application log line containing `plan` and `stripe_customer_id`. The policy says tax and dispute records are kept. The database does not keep them. Stripe may, which is an unverified vendor setting, and it is not disclosed.
3. **Disconnect revokes the grant and does not delete synced content.** `DELETE /v1/connections/{name}` calls `revokeConnection` and returns 204 (`apps/rowboat-api/internal/connectors/handler.go`). The internal pilot data map says the same thing in plainer language: disconnect stops collection and “does not silently erase historical evidence” (`docs/trustworthy-first-account-beta/pilot-data-map.md`). The privacy policy tells the user the opposite unless they already know to look for a workspace retention setting. This audit did not find a disconnect path that deletes previously synced mail, calendar, Slack, or CRM bodies.
4. **There is no account export.** The export route found is commitment export (`ExportCommitment`), plus local desktop notes. There is no “download my account” API that would meet a portability request for connected-source content without an operator. Email-to-`privacy@oppulence.io` can still be the legal channel. The in-product sentence should not imply a self-serve archive that does not exist.
5. **Backup purge is not in the repo.** Cryptographic erasure is designed for tenant evidence keys (`apps/rowboat-api/ent/schema/tenant_evidence_key.go`: destroying wrapped keys is meant to make ciphertext and backups unreadable). That is not the same as a job that purges every backup of every table within a stated window. Database snapshot retention is an infrastructure setting this audit cannot see.

**What to change.** Rewrite the disconnect sentence to match the data map, or delete synced content on disconnect. Retry WorkOS deletion until it succeeds. Decide whether tax records live in Stripe, in a retained billing table, or both, and say so. Add a self-serve export or narrow the portability sentence to the email request.

## L-06 — Global Privacy Control is promised and not read

The privacy policy says Oppulence honors Global Privacy Control signals as opt-out requests where the law requires it, and that the practical effect is limited because personal information is not sold or shared for advertising.

Nothing in the web app, desktop app, or API reads `Sec-GPC` or `navigator.globalPrivacyControl`. A claim that a signal is honored usually means the server records it and applies the opt-out. Here the opt-out has no code path. The hedge (“practical effect is limited”) reduces the harm if the no-sale statement is true. It does not make the “we honor” sentence true.

**What to change.** Either implement a GPC listener that, at minimum, forces analytics off and logs the request, or delete the sentence and keep the no-sale disclosure.

## L-07 — Recipients in the code that the policy does not name

The policy lists categories (“vendors that host infrastructure, process payments, provide model inference and transcription, send email, and provide product analytics and error monitoring”). Categories are allowed. Named disclosure is what customers and regulators ask for, and a few of these recipients are easy to miss because the policy’s examples are Google, Slack, and HubSpot only.

| Recipient | Evidence | Personal data visible in code |
| --- | --- | --- |
| PostHog (US ingest) | `posthog-node`, `posthog-js`, CSP `connect-src https://us.i.posthog.com` | Installation id, user id, email, plan, exception stacks, product events |
| WorkOS | Auth BFF and `DeleteUser` | Account identity, sessions, email |
| Stripe | Billing and `CancelSubscriptions` | Customer id, subscription, plan. Card numbers are not stored in this API, which matches the policy |
| OpenRouter, then upstream labs | `internal/llm` | Prompts, which can include connected-source content |
| Plain (UK chat) | `components/features/support/support-chat`, CSP allows `chat.uk.plain.com` and Plain S3 buckets | Email, WorkOS user id, chat content. Anonymous marketing visitors can open the widget |
| Google Fonts | CSP `style-src https://fonts.googleapis.com` | IP address of the browser loading the font |
| Google, as the only documented sign-in method | Auth shell copy: “Continue with Google” | Matches the Terms. The privacy examples say “for example, Google,” which leaves room for more IdPs. Code reviewed here is Google via WorkOS |

Plain is a support processor in the UK. The privacy policy’s international-transfer section is written as if the United States were the only destination that needs an explanation. A UK vendor is a transfer too, even though the UK has an adequacy relationship with the EU.

Exception text sent to PostHog can contain whatever the thrown error interpolated, including user content. `capture_exceptions: true` on the renderer does not pass through the web client’s sensitive-key filter.

**What to change.** Publish the table above, kept current, as the subprocessors list. Mention Plain and Google Fonts in the privacy policy. Filter exception messages before they leave the desktop.

## L-08 — Who the controller is, and where they are

The policies name Playbook Media, Inc. and give `privacy@oppulence.io`, `legal@oppulence.io`, `security@oppulence.io`, and `accessibility@oppulence.io`. They do not give a postal address.

California Civil Code section 1789.3, which the Terms themselves cite, requires the name and address of the provider. The Terms give the legal name and then the address of the California Department of Consumer Affairs, which is the complaint unit, not the company. CAN-SPAM requires a physical postal address in commercial email. No marketing-email template in this repo was found to carry one. GDPR notices are expected to identify the controller with contact details a person can use; an email alone is often accepted, a missing address is still the first thing a reviewer flags.

The footer says “Playbook Media” without “Inc.” Small, but invoices, the privacy policy, and the copyright line should be the same entity.

**What to change.** Add the company’s postal address to the privacy policy, the Terms, and any commercial email. Use one legal name everywhere, including `NOTICE`.

## L-09 — Terms that depend on a record the product does not keep

**Arbitration.** The Terms require individual JAMS arbitration, a class waiver, and a 30-day email opt-out to `legal@oppulence.io`. Sign-in shows the Terms link beside “By continuing, you agree.” There is no checkbox, no stored timestamp or Terms version on the user row, and no in-product opt-out. Courts in several US states treat this kind of flow as weaker than a clickwrap that records assent, especially for a class waiver. The informal-resolution and batching clauses are policy text only; nothing in the product implements them, which is normal, but the absence of an assent record is not.

**Age.** Both documents say the Service is not for anyone under 18. Sign-up does not ask for an age or record an attestation. For a business product that is often enough, because the customer represents they are 18 when they continue. It is not a control. There is also no child-deletion workflow beyond the instruction to email `privacy@oppulence.io`.

**Price changes and auto-renewal.** The Terms say paid plans renew until cancelled, fees are non-refundable except where the law requires, and price changes get 30 days’ notice. The API can open a Stripe billing portal (`PortalSession` in `apps/rowboat-api/internal/billing/stripe.go`) and account deletion cancels live subscriptions immediately. Whether the portal is configured to let a customer cancel in two clicks, and whether checkout shows the auto-renewal terms required by California and other state auto-renewal statutes, depends on the Stripe dashboard and the checkout page copy. This repo does not contain that confirmation.

**What to change.** Store the Terms version and the time of assent. Offer the arbitration opt-out in the product or accept the email-only path as a legal risk. Add an age attestation if counsel wants more than a browsewrap representation. Confirm the Stripe portal and checkout disclosures against the auto-renewal sentence.

## L-10 — Open-source notices for software you ship

Apache 2.0 section 4 requires the license, modification notices, and retained third-party notices. `NOTICE` does not list third-party components.

Observed gaps:

- `apps/x/vendor/whisper` builds a static `whisper-cli` from a pinned whisper.cpp tag (MIT). The binary is staged into the Electron app by CI. The Forge config does not copy a whisper.cpp `LICENSE`, and the vendor directory does not contain one.
- `sharp` / `libvips` (LGPL-3.0-or-later) is in the web and other Node lockfiles. Dynamic linking is usually compatible with LGPL; the notice still belongs in a third-party notices file if those binaries ship.
- Electron and the rest of the desktop dependency tree have their own MIT, BSD, and Apache notices. No `THIRD_PARTY_NOTICES` file and no license-inventory script showed up at the repo root.
- The docs site duplicates the entire Apache text and attributes it to the upstream GitHub URL, so a correction to `LICENSE` will not reach the docs site.

**What to change.** Generate a third-party notice as part of the desktop package and the web image. Put the whisper.cpp MIT text next to the binary. Point the docs license page at this repo’s `LICENSE` and `NOTICE`.

## L-11 — Responsible disclosure is a real policy with no discovery file

The responsible-disclosure page is specific: `security@oppulence.io`, scope, out-of-scope items, a safe-harbor statement, no public bug bounty, acknowledgement within 3 business days, an initial assessment within 10, and a 90-day aim for high-severity fixes. Those timelines are operational promises. The repository cannot prove the inbox is monitored.

There is no `security.txt` (RFC 9116) under the web app. Researchers and scanners look for `/.well-known/security.txt` before they read a marketing page.

The safe harbor is a company promise not to sue good-faith researchers. It does not bind third parties. The page already says Oppulence will tell a third party the research was authorized. That is as far as a policy in this repo can go.

**What to change.** Serve `security.txt` with the contact address and the policy URL. Treat the 3-day and 10-day clocks as support SLAs and make sure the mailbox matches.

## Statements that match the code

These are included so the audit is not only a list of gaps.

- **No ad-tech tags** were found in the web app or desktop renderer. The no-sale and no-advertising-cookie sentences are consistent with that search.
- **Card numbers** are not stored on Oppulence tables. Billing keeps Stripe customer and subscription ids. That matches “we do not store full payment card numbers.”
- **Session cookies** are HTTP-only, `SameSite=Lax`, `Secure` in production, and sealed with AES-256-GCM (`apps/rowboat-www/lib/auth/cookies.ts`). The browser does not receive the WorkOS access token. That matches the security page. The cookie is not a `__Host-` cookie; the web app’s own engineering guide already flags that as a follow-up, not as a policy claim.
- **Security response headers** on the web app include CSP, HSTS, `nosniff`, a referrer policy, and a permissions policy (`apps/rowboat-www/next.config.ts`).
- **Connector credentials** are stored encrypted, which matches the narrower promise “encryption at rest for sensitive stored credentials and tokens.” The policy does not claim that every database column is encrypted.
- **Meeting disclosure defaults to off.** Relationship evidence flags for transcripts, attendance, and model contact extraction default to false (`apps/x/packages/core/src/voice/transcription-config.test.ts`). The privacy policy correctly leaves participant-consent law with the customer.
- **Account deletion exists** and refuses to delete an account whose Stripe subscription cannot be cancelled. That is stronger than a policy that only promises deletion “within 30 days.”
- **Web analytics** waits for `shareUsageData` and defaults that flag to false. The desktop does not (L-01).
- **The security page refuses invented compliance marks.** It says the team does not invent a SOC 2 or HIPAA claim. This audit found no such badge in that page. Do not add one until the audit report exists.
- **Human approval before external writes** is how the security page and the Terms describe Gmail, Slack, and HubSpot. This audit did not re-prove every action executor. The internal data map still says to start read-only and review write scope before enabling it. If any production path sends mail or writes CRM without a confirmation step, that would break both documents and should be treated as a new high finding.

## Claims this repository cannot prove

Counsel or operations should confirm these outside git. They are not findings of contradiction. They are unverified assertions.

- Standard Contractual Clauses and the UK addendum are actually executed with each non-adequate recipient.
- PostHog, OpenRouter, Plain, WorkOS, and Stripe contracts forbid secondary use, including model training and advertising.
- OpenRouter’s project setting disables prompt logging even though the request does not say so.
- Backup snapshots are purged on a rolling schedule, and disk encryption covers the database.
- Humans do not read Google user data except in the cases the policy lists.
- `privacy@`, `legal@`, `security@`, and `accessibility@` are monitored, and the 3-day and 10-day disclosure clocks are met.
- Stripe Checkout and the customer portal satisfy state auto-renewal disclosure and cancellation rules.
- The product meets WCAG 2.1 AA. The Terms say “we aim to conform,” which is an aim, not a warranty. This audit did not test accessibility.
- Export-control screening. The Terms contain a customer representation. There is no geo-block in the code that was reviewed. A representation without a screen is common and is not, by itself, a false statement.

## Order to fix

1. Make desktop analytics match the security page, or rewrite the page. Gate the renderer PostHog client. Stop sending email until that choice is explicit in the privacy policy.
2. Enforce no-training / no-retention on hosted model requests, and name the processors.
3. Resolve Apache 2.0 versus the Terms, and make the copyright holder one legal entity with a postal address.
4. Publish subprocessors and a DPA. Align the disconnect and deletion sentences with `DELETE /v1/me` and with what disconnect actually leaves behind.
5. Implement or remove the Global Privacy Control sentence. Add `security.txt`. Ship third-party license notices with the desktop binary.

Do not edit the privacy policy or Terms in the same change as a code fix unless counsel has approved the new sentence. A code change that makes the product match the current sentence is the safer default for L-01 and L-02.

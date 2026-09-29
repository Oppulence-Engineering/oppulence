# Plan: make the product match the published legal documents

**Date:** 29 September 2026
**Status:** Items 1 through 6 are implemented in this branch. Item 7 stays out of scope.
**Source of truth:** the Privacy Policy, Terms of Service, and Responsible Disclosure page (effective 8 September 2026), plus the security page where it states how the product behaves. The audit those sentences were checked against is `docs/legal/2026-09-29-codebase-legal-audit.md`.

This plan does not ask a lawyer to bless new promises. It makes the running code do what those pages already say, and it changes a published sentence only when the sentence cannot be made true in code without inventing a fact (a street address, an executed contract, a relicensing of Apache code).

## Rule for conflicts

1. If the security page describes a control and the privacy policy describes the same practice in more general words, implement the control. General words stay true: “we use product analytics” remains true when the user has turned analytics on.
2. If a sentence names a fact the repository does not contain, do not invent it. Leave the sentence for the company to fill, and record that here.
3. Do not replace the Apache 2.0 grant on the Rowboat upstream with a proprietary license. That would break the license we received. The Terms can govern accounts and the hosted service. They cannot take back Apache rights in source someone received under Apache.

## Work

### 1. Analytics is off until the user turns it on

**Sentence to satisfy.** Security page: “PostHog analytics is fail-closed until you enable it. You can turn it off.” Privacy policy: analytics is product analytics, not an advertising network.

**Code.**

- Default `shareUsageData` to `false` in `apps/x/packages/shared/src/privacy.ts`. A missing `privacy.json` must not send events. A file that already says `true` stays on.
- `analytics:bootstrap` returns that flag. `apps/x/apps/renderer/src/main.tsx` does not construct `PostHogProvider` until the flag is true. Direct `posthog-js` calls in the renderer no-op while the flag is false, including the queue that `posthog-js` would otherwise flush on a later `init`.
- Toggling the desktop setting applies immediately to both the Node client and the renderer.
- `identifyIfSignedIn` does not attach an email address. Account email is account data in the privacy policy, not usage data.
- Web capture already waits for `shareUsageData`, which defaults to false. Keep that.

**Policy sentence that code cannot make true.** “First-party product analytics” while events are posted to `us.i.posthog.com`. Change that phrase so the policy names PostHog as a service provider and says capture is off until the user enables it. That matches the security page. It does not add a new practice.

**Done when.** A fresh desktop profile with no `privacy.json` produces no PostHog client and no capture from renderer hooks. Turning the setting on starts capture. Turning it off stops both clients before the next event. Tests cover the default and the renderer gate.

### 2. Hosted model requests refuse training and prompt logging

**Sentence to satisfy.** Privacy policy, “AI processing” and “Google user data”: model providers are prohibited from using customer data to train their models, and Google user data is not used to train generalized models.

**Code.** One helper used by `ChatComplete`, `Complete`, and the streaming proxy in `apps/rowboat-api/internal/llm`. For every OpenRouter request it sets `provider.data_collection` to `deny` on the JSON body (OpenRouter then limits routing to providers that do not collect prompts) and sets `HTTP-Referer` and `X-Title` to Oppulence (`https://oppulence.io`, `Oppulence`) instead of Solomon AI.

**Not in this change.** A gateway redactor for “where feasible,” and the contracts that bind each lab. The request flag is what the repo can enforce. Dashboard-only privacy settings are not sufficient because they can change without a code review.

**Done when.** A unit test decodes the outbound body and headers and fails if `data_collection` is not `deny` or if the Solomon AI referer is still set.

### 3. Honor Global Privacy Control

**Sentence to satisfy.** Privacy policy: “We honor Global Privacy Control signals as opt-out requests where applicable law requires.”

**Code.** On the web, if `navigator.globalPrivacyControl` is true, or the document request carried `Sec-GPC: 1`, analytics consent resolves to false and a later opt-in in the same browser does not override the signal. Strictly necessary session cookies stay. The policy says the practical effect is limited because personal information is not sold; the effect we can implement is the analytics opt-out.

**Done when.** A test with the GPC flag set does not call `posthog.capture`.

### 4. Deletion, disconnect, and export

**Sentences to satisfy.**

- Account deletion deletes or de-identifies personal information within 30 days, except legal, tax, security, and dispute holds.
- Disconnecting a source stops sync. Previously synced data is deleted according to workspace settings or on request.
- People can export much of their content. After termination, data remains available for a reasonable period so they can export it.

**Code, in this order.**

1. Retry WorkOS session revocation and user deletion inside `DELETE /v1/me` before returning. A logged failure with `identityDeleted: false` does not meet the 30-day sentence on its own. Keep the receipt honest when retries are exhausted.
2. Stop treating the cascade of local billing rows as the tax trail. Persist the minimum the policy says we keep for tax and disputes (plan, Stripe customer id, amounts and periods already on the subscription row) in a retention table that account deletion does not cascade, with no card data. If that table cannot be added without a migration and `make verify`, do the migration.
3. On connector disconnect, stop new sync (already true) and delete previously synced source bodies for that connection when the workspace has no longer retention window. Do not delete another tenant’s rows. Do not delete audit records the Terms say survive for dispute resolution; delete content (message bodies, attachments metadata tied to the source, CRM payloads) and keep the tombstone that sync has stopped.
4. Add an authenticated export of the account’s own content the product already stores (notes and relationship records the user can see), separate from single-commitment export. The privacy email channel remains for anything the export does not cover. The in-product sentence says “much of,” not “all.”

**Done when.** Tests show: WorkOS delete is retried; a billing retention row survives `DeleteAccount`; disconnect of one connection removes that connection’s synced content and leaves another user’s rows; export returns only the caller’s content.

The Terms used to say that after termination we would keep data for a reasonable period so the person could export it. Deletion runs in the same request, which is what the privacy policy’s “when you delete your account” sentence describes. Holding the data after that confirmation would keep personal information the person just asked us to delete. The Terms sentence now says export is available while the account is open, and deletion follows the privacy policy. That is the one Terms sentence this item rewrote, because the two published sentences could not both be true.

### 5. Terms assent, age, and the Apache boundary

**Sentences to satisfy.** Terms: use of the service is acceptance; the user must be at least 18; arbitration may be opted out within 30 days by email. Apache 2.0: source we received under Apache stays under Apache.

**Code and one Terms sentence.**

- On first sign-in, store the Terms effective date and the time of assent on the user. The sign-in page already says “By continuing, you agree.”
- The sign-in page states that continuing confirms the person is at least 18. Do not collect a date of birth.
- Add one sentence to the Terms license section: source obtained under the Apache License 2.0 is governed by that license; these Terms govern accounts and the hosted Service. Do not relicense `LICENSE`.
- Point `apps/docs/docs/getting-started/license.mdx` at this repository’s `LICENSE` and `NOTICE`.
- Update `NOTICE` so the copyright line is Playbook Media, Inc. and the fork description includes the API and web app, not only the Electron shell. Fill the `LICENSE` appendix so the brackets are gone and the copyright is Playbook Media, Inc., while keeping the Apache 2.0 terms and the Rowboat attribution.

**Not in this change.** An in-product arbitration opt-out. The Terms already specify email to `legal@oppulence.io`. Building a second channel would be a new promise.

### 6. Discovery and notices

**Sentence to satisfy.** Responsible disclosure: reports go to `security@oppulence.io`.

**Code.** Serve `/.well-known/security.txt` (RFC 9116) with that address, the policy URL, and the languages we will accept (`en`). Add a `THIRD_PARTY_NOTICES` file that names whisper.cpp (MIT) and the LGPL libvips builds pulled in by `sharp`, and copy it into the desktop package extra resources if Forge already has an extra-resource list. Do not pretend that file is a complete scan of every transitive dependency.

### 7. Explicitly not fixed here

| Gap | Why it stays open |
| --- | --- |
| Postal address on the policies | The repo does not contain Playbook Media, Inc.’s street address. Inventing one would make the policies false. |
| Executed DPAs and SCCs | Those are contracts, not code. |
| EU/UK Article 27 representative | Not in the repo. Do not name a person who is not appointed. |
| Subprocessor legal terms | The privacy policy already allows disclosure by category. Item 1 names PostHog in the policy because “first-party” is false. A full public subprocessors page is a new legal artifact and waits on counsel. |
| SOC 2, HIPAA, WCAG certification | The security page already refuses invented badges. The Terms say we aim at WCAG 2.1 AA. This work does not claim we achieved it. |
| Human access to Google data | An operational control. No code change can prove that staff do not read mail. |

## Order

1. Analytics gate and default (item 1), including the privacy-policy phrase that cannot stay “first-party.”
2. OpenRouter `data_collection: deny` and Oppulence attribution (item 2).
3. Global Privacy Control (item 3).
4. Deletion retry, billing retention, disconnect deletion, export (item 4).
5. Assent record, age sentence, Apache boundary, notices, `security.txt` (items 5 and 6).

Each item lands with tests that fail if the policy control is removed. `make verify` in `apps/rowboat-api` runs after Go edits. Desktop privacy tests run in `apps/x`. Web analytics tests run in `apps/rowboat-www`.

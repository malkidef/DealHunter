# Privacy rights operations (GDPR)

Status: implementation specification only. This document does **not** mean DealHunter is GDPR-compliant or that a rights-request workflow is live. A privacy lead/legal reviewer must validate the controller/processor roles, notices, legal bases, retention periods, international transfers and response templates before launch.

## 1. Supported request types

The intake workflow must support:
- access and copy of personal data (GDPR Article 15);
- rectification (Article 16);
- erasure (Article 17), subject to applicable exceptions;
- restriction (Article 18);
- portability where Article 20 conditions are met;
- objection (Article 21);
- withdrawal of consent where consent is the legal basis.

A request must never be rejected merely because the user selected the wrong category. An operator should reclassify it.

## 2. Deadlines and identity

- Record the date received and calculate the normal response deadline: one month from receipt.
- Where permitted because of complexity or number of requests, an extension of up to two further months may be used; tell the requester within the first month and explain why.
- Respond without undue delay and in any event within the applicable deadline.
- Verify identity using proportionate means. Start with the authenticated account and a confirmation to its already verified channel. Ask for additional information only when there are reasonable doubts; do not request identity documents by default.
- If the request is manifestly unfounded or excessive, any refusal or reasonable fee requires a documented assessment and legal review.
- Record when a request is clarified, paused pending necessary identity information, extended, completed or refused, with reasons.

Reference: GDPR Articles 12 and 15–22. See the official consolidated text in the links below.

## 3. Firestore request record — proposed schema

Collection: `privacyRequests/{requestId}`

Client may create a request and read only their own request. Client must not update its status, reviewer fields, decision, internal notes or completion timestamps. Only a trusted server/admin process may change those fields.

Allowed client fields:
- `ownerUid`: authenticated UID, must equal request.auth.uid;
- `requestType`: one of `access`, `rectification`, `erasure`, `restriction`, `portability`, `objection`, `withdraw_consent`;
- `description`: optional plain text, maximum 2,000 characters; warn users not to include sensitive documents or third-party data;
- `createdAt`: server timestamp only;
- `status`: initial value `received` only.

Server-only fields:
- `receivedAt`, `dueAt`, `identityStatus`, `assignedTo`, `status`, `decisionCode`, `decisionReason`, `extensionNotifiedAt`, `completedAt`, `auditEventIds`.

Do not store identity documents, bank details, health data or free-form copies of the user's full account in this collection. Store only the minimum operational metadata. Do not expose internal notes to the requester.

Suggested status lifecycle:
`received → identity_check (only if needed) → in_review → action_required (if clarification needed) → completed | partially_completed | refused`.

Every transition must be server-authorized and append an immutable audit event with actor, timestamp, action and reason code. Do not log the request description or personal-data export contents.

## 4. Data inventory and fulfilment map

Before implementing exports/deletion, maintain a versioned inventory of all personal-data locations. Initial areas to inspect:

| Area | Examples | Required handling |
|---|---|---|
| Authentication | Firebase Auth UID, email, provider identifiers | Disable/delete account only after request review; preserve minimum lawful records if required |
| User profile | profile fields, preferences, worker profile | Export, rectify, restrict or erase as applicable |
| Listings | publicOffers, publicNeeds, publicServiceOffers, publicServiceRequests, publicWorkerProfiles, publicWorkOpenings | Unpublish immediately when justified; remove or anonymise personal data, including copies and search indexes |
| Matching | matches and service/work match requests | Remove public visibility and personal identifiers; consider the other participant's rights |
| Conversations | matchMessages, serviceMatchMessages, workMatchMessages | Assess both participants' rights; redact personal data rather than exposing another person's messages |
| Deals | deals, confirmations, transaction metadata | Do not automatically erase records that must be retained for legal claims, accounting or statutory duties; restrict access and minimise |
| Verification | verificationRequests and evidence references | Delete unnecessary evidence; retain only justified decision/audit metadata |
| External sources | imported listings, caches, source snapshots | Apply source terms, identify controller responsibilities, propagate deletion/rectification where required |
| Backups/logs | Firebase backups, GitHub Actions logs, exports | Document provider retention; prevent normal access; expire according to a defined schedule |

The inventory must include every Firestore collection, Auth, logs, backups, analytics, email provider, payment provider and any external data processor. This table is a starting checklist, not a complete inventory.

## 5. Erasure is not a blind cascade delete

For each request, determine:
1. whether the requester is the data subject or is authorised to act for them;
2. which data is personal data about them;
3. the applicable legal basis and whether an Article 17 ground applies;
4. whether a legal obligation, legal claim, freedom of expression/information or another exception requires limited retention;
5. whether data can be erased, anonymised, pseudonymised, restricted or simply unpublished;
6. whether recipients/processors must be notified under Article 19;
7. how remaining data will be protected and when it will be deleted.

Never delete a shared conversation or deal in a way that removes another participant's rights or required transaction evidence without a documented decision. Keep the minimum legally necessary data, separate it from active product use, lock down access and define its expiry.

## 6. Export requirements

An access response should be human-readable and must not disclose another person's personal data or protected confidential information. A portability export, when Article 20 applies, should be machine-readable and limited to data provided by the person under the conditions in that article.

- Generate exports only in a trusted server environment.
- Use short-lived, single-use download links; never public storage URLs.
- Verify requester identity immediately before issuing a link.
- Record export creation and expiry, not the exported contents.
- Expire and delete temporary export files automatically.
- Never email raw exports as attachments.

## 7. Security and abuse controls

- Firestore rules: owner-only create/read; no client status updates; no client delete; server/Admin SDK only for review actions.
- Admin access: custom claim `dealhunterAdmin: true`, assigned only by a trusted operator outside the client app.
- Enforce App Check/rate limits where available; cap pending requests per account and prevent duplicate spam without blocking legitimate rights.
- Never put secrets, full exports or sensitive evidence in GitHub, source code, client logs or analytics.
- Keep an audit trail that records decisions without copying the personal data under review.
- Test cross-account access denial, forged ownerUid, status tampering, oversized descriptions, duplicate submissions and admin-only transitions in the Firestore emulator.

## 8. Launch gates

Do not claim the rights workflow is operational until all are complete:
- [ ] Controller identity, contact point and privacy notice approved.
- [ ] Data inventory and lawful bases reviewed.
- [ ] Retention schedule approved for each data category, including backups and logs.
- [ ] Firestore rules and emulator tests implemented.
- [ ] Trusted server handlers for identity checks, deadlines, exports, restriction, rectification and erasure implemented.
- [ ] Processor contracts and international transfer safeguards reviewed.
- [ ] Operator runbook, escalation path and response templates approved.
- [ ] End-to-end tests completed with at least two accounts and a third-party data scenario.
- [ ] Security review and legal review signed off.

## Official references

- [GDPR — official EUR-Lex consolidated text (French)](https://eur-lex.europa.eu/legal-content/FR/ALL/?uri=CELEX:32016R0679)
- [CNIL — GDPR overview and data-subject rights](https://www.cnil.fr/fr/reglement-europeen-protection-donnees)

This specification is engineering guidance, not legal advice. The controller must validate the final process for each country and business model before collecting real user data.

# MailShield AI — Phase 1

A Next.js, TypeScript, and Tailwind CSS university demo. All email records and analysis reports are fictional. No Gmail access, GPT calls, email delivery, credentials, or malware are included.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. The sample inbox starts connected for immediate exploration. Connection & settings supports disconnecting, reconnecting, syncing, and resetting.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The build exports a static site to `out/`. No server-side integration is required.

## Demo behavior

- One fictional personal workspace (Alex Morgan); each browser keeps its own state locally. There is no real login or multi-user authentication in Phase 1.
- Twelve starting messages. Sync adds one predefined message once, creates its notification, and uses a fixed demo clock. Repeat syncing does not create duplicates.
- Search, filters, charts, totals, and alerts derive from the same email dataset.
- Notification reads, simulated connection, sync state, and email-alert preview preference persist under `mailshield-fictional-demo-v1`. Only fictional state is stored. Reset restores the original connected inbox and unread alerts.
- Email bodies render as escaped text. URLs are non-clickable text. Attachment metadata has no download action or file content.
- Reports are predefined and deterministic; risk is an estimated indicator, confidence is separate, and failed or unassessed messages receive no score.

## Structure and future boundaries

`components/` contains interface components; `lib/demo-data.ts` contains fictional content; `lib/state.ts` contains shared selectors and transitions; `lib/types.ts` defines reports and typed `GmailRetrieval` / `ThreatAnalyzer` boundaries. Those interfaces have no real implementations. Real per-user authentication, Gmail OAuth, incoming-message retrieval, GPT analysis, scheduled sync, and alert delivery belong to later phases.

The sample content includes an analyzer-manipulation attempt and explains why email content must be treated as untrusted evidence. No report verifies safety or claims malware from attachment metadata alone.

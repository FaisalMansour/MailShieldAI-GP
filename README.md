# MailShield AI — Phase 4

## Phase 4: near-real-time Gmail monitoring

Phase 4 adds an optional Gmail inbox watch through one shared Google Cloud Pub/Sub topic and one authenticated push subscription. A notification starts bounded Gmail history synchronization, the existing analysis pipeline, Gmail warning-label reconciliation, and an in-app report notification for medium/high reports. Delivery and AI analysis may be delayed. **Sync now** remains available even when monitoring is off. The separate fictional `/demo` does not use Gmail.

### Google Cloud and OAuth setup

1. Enable the Gmail API and Pub/Sub API in the OAuth client's project. Declare `gmail.readonly` and `gmail.modify` on the OAuth consent screen. Existing users can keep read-only scanning and reports if they decline the separate **Upgrade Gmail permission** action. `gmail.modify` is required to change labels on individual messages; Google's scope also permits reading, composing, sending, and changing mail. This app only calls read, watch, label creation, and message label modification methods. It never calls send, trash, delete, archive, or spam methods. These Gmail scopes are **restricted** and a public deployment may require OAuth verification and a security assessment for server-side restricted data; use authorized test users for the university demo. [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes), [message modify reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify).
2. Create **one** Pub/Sub topic, for example `projects/PROJECT_ID/topics/mailshield-gmail`. Grant `roles/pubsub.publisher` on this topic to `gmail-api-push@system.gserviceaccount.com`. Do not make a topic or subscription per user. [Gmail push guide](https://developers.google.com/workspace/gmail/api/guides/push).
3. Create a user-managed service account for push identity. Create **one** push subscription on the topic with endpoint `https://YOUR_HOST/api/gmail/pubsub`, authentication enabled with that service account, and audience set to the exact same endpoint URL. The Pub/Sub service agent `service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com` needs `roles/iam.serviceAccountTokenCreator` on the push service account. The administrator configuring the subscription needs permission to act as that account. [Authenticated push setup](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
4. Set `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_SUBSCRIPTION`, `GMAIL_PUBSUB_ENDPOINT`, `GMAIL_PUBSUB_AUDIENCE`, and `GMAIL_PUBSUB_SERVICE_ACCOUNT` in the server environment. The topic and subscription must be fully qualified names. The endpoint and audience must match exactly and use HTTPS. Set a separate random `MONITORING_CRON_SECRET` of at least 32 characters. Never expose these values to the browser or store credentials in PostgreSQL.
5. Deploy the Next.js Node runtime with a public HTTPS route and a persistent PostgreSQL database; apply the Phase 4 Prisma migration with a **direct** PostgreSQL connection before deployment. Then enable analysis consent and monitoring per mailbox. Enabling calls Gmail `users.watch` with `INBOX` filtering. A successful watch creates a stored expiration and preserves any existing history cursor. Gmail sends an initial notification, which can confirm the delivery path in the settings view. [Watch reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch).

The webhook verifies the Google-signed OIDC bearer token, expected audience, issuer, verified service-account email, and subscription name. It validates a bounded Base64URL payload and finds a stored active mailbox by email; a payload cannot nominate a MailShield user. A non-2xx response asks Pub/Sub to retry a genuine processing failure. Notification IDs, unique Gmail message IDs, a mailbox sync lock, and report status transitions make redelivery safe. The private diagnostics endpoint `/api/gmail/diagnostics` shows only the signed-in user's internal run IDs and statuses, without email bodies or tokens.

### Scheduler and recovery

Schedule an authenticated **POST** to `/api/gmail/maintenance` every 15 minutes in the deployment environment, with `Authorization: Bearer MONITORING_CRON_SECRET`. For example, use Google Cloud Scheduler's HTTP target with a secure secret header. The endpoint processes at most 20 mailboxes per invocation, renews watches expiring within 48 hours (at least daily when the scheduler runs), continues bounded history pages, and catches up changes missed by push. `MONITORING_RECOVERY_MINUTES` controls the minimum periodic sync interval, default 15 minutes. Scheduler setup and any provider charges are manual; no paid resources are provisioned by this repository. One request also runs renewal manually during development:

```powershell
$headers = @{ Authorization = "Bearer $env:MONITORING_CRON_SECRET" }
Invoke-RestMethod -Method Post -Uri "$env:APP_URL/api/gmail/maintenance" -Headers $headers
```

Each history request handles up to 50 new message IDs, stores continuation state, and advances the committed cursor only after those messages are imported. It ignores Gmail label-only changes, which prevents MailShield's own labels from triggering new analysis. If Gmail returns an expired history cursor, a recovery sync checks only the latest **50** inbox messages and establishes a new baseline. It cannot guarantee recovery of older missed mail. Failed operations have bounded retries and backoff; use **Sync now** for manual recovery. The Gmail watch lasts at most seven days, and Google recommends daily renewal. Notifications can be delayed or dropped. [Gmail sync guide](https://developers.google.com/workspace/gmail/api/guides/sync), [push guide](https://developers.google.com/workspace/gmail/api/guides/push).

To test locally, run the app on `127.0.0.1:3000`, expose only `/api/gmail/pubsub` through a trusted HTTPS tunnel, and update the subscription push endpoint, audience, and the matching environment variables to the new HTTPS URL. Restart the app. Use **Renew monitoring** to refresh the watch. Send a harmless subject such as “MailShield demo normal” to the dedicated demo Gmail account; inspect settings and `/api/gmail/diagnostics`. Use an authorized test sender and fictional content for a simulated phishing message. Do not use real malicious links or credentials. There is no unsigned development bypass.

For reports with provisional scores 40–69 or 70–100, MailShield reuses or creates the user labels **MailShield - Medium Risk** and **MailShield - High Risk**, stores their Gmail IDs, and applies only the correct one to the individual message. Low-risk and corrected “Not a threat” messages have no MailShield severity label. Undoing a correction or saving a new analysis reconciles the labels again. Other Gmail labels are untouched. These are MailShield classifications, not native Gmail security warnings. If permission or a label API call fails, website reports remain available and the label status is shown separately.

To completely disable monitoring, choose **Disable automatic monitoring** for each connected mailbox. This calls Gmail `stop` where possible and turns off local processing; **Sync now** still works. For all users, also stop the scheduler, remove the push subscription or topic in Google Cloud, and clear the Phase 4 Pub/Sub environment values. Disconnecting Gmail also stops its watch and revokes its stored token when possible.

Pub/Sub is usage priced. The current [official pricing page](https://cloud.google.com/pubsub/pricing) lists the first **10 GiB of Message Delivery Basic throughput per billing account per calendar month** as free; other throughput, transfer, retention, and scheduler charges may apply. Check the pricing page and billing controls before enabling a demo project.

This phase does not include a Gmail sidebar, Outlook, email alerts, attachment-content malware scanning, quarantine, deletion, or model fine-tuning.

MailShield AI is a university email-security project. Phase 3 added real analysis for imported Gmail messages and uploaded EML files. It combines versioned deterministic checks with a server-side AI analyst, stores structured reports in PostgreSQL, and includes a separate labeled-dataset evaluation workflow.

This phase does **not** claim that a foundation model was trained or fine-tuned. The AI is specialized through a version-controlled security prompt, a small set of reviewed examples, strict structured output, deterministic evidence, and evaluation.

The fictional Phase 1 demo remains at `/demo` and never mixes with private workspace data.

## Requirements and setup

- Node.js 20.9 or newer
- PostgreSQL 15 or newer
- A Google Cloud OAuth web client for sign-in, Gmail read access, and an optional Gmail modify upgrade for labels
- A DeepSeek or OpenAI API key only if real AI analysis is desired

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

Open exactly `http://127.0.0.1:3000`. `APP_URL`, `AUTH_URL`, the browser host, and Google redirect URIs must use the same host.

Generate local secrets without committing them:

```powershell
npx auth secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use the second value for `TOKEN_ENCRYPTION_KEY`. Use a separate random value for `CLEANUP_SECRET`.

## Google Cloud setup

1. Enable the Gmail API.
2. Configure an External OAuth consent screen in Testing for a university demo and add each account under Test users.
3. Declare `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`, and `https://www.googleapis.com/auth/gmail.modify`. The app requests modify only during the explicit upgrade.
4. Create a Web application OAuth client.
5. Add these exact redirect URIs:

   ```text
   http://127.0.0.1:3000/api/auth/callback/google
   http://127.0.0.1:3000/api/gmail/callback
   ```

Google sign-in establishes the MailShield account. Gmail access is a separate consent flow. Read-only access supports scanning and website reports. A later explicit upgrade requests Gmail modify permission for labels. When monitoring is enabled and the scheduler and Pub/Sub path are configured, work can continue while the site is closed.

## AI configuration

MailShield supports DeepSeek and OpenAI through the maintained `openai` JavaScript SDK and the providers' Responses APIs. Strict JSON Schema output is validated again with Zod before storage. API keys are never sent to the browser, written to PostgreSQL, included in application logs, or returned in user-facing errors.

For DeepSeek, add these values to `.env.local`:

```dotenv
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY="your-server-side-key"
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-flash"
DEEPSEEK_INPUT_USD_PER_MILLION="0.30"
DEEPSEEK_OUTPUT_USD_PER_MILLION="1.20"
```

Do not paste the key into source code, Git, or chat. Restart `npm run dev` after changing `.env.local`.

DeepSeek's current official documentation lists `https://api.deepseek.com` as the OpenAI-compatible base URL, supports Responses API JSON Schema output, and lists `deepseek-flash` as the latest Flash model. As checked on 28 September 2026, peak cache-miss input/output prices are $0.30/$1.20 per million tokens; off-peak pricing and cache-hit input pricing are lower. MailShield defaults to the conservative peak cache-miss estimate because a report's aggregate input count does not distinguish every billed category. Confirm current pricing before a demonstration:

- [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)
- [DeepSeek models and pricing](https://api-docs.deepseek.com/quick_start/pricing/)

OpenAI remains available as an alternative:

```dotenv
AI_PROVIDER="openai"
OPENAI_API_KEY="your-server-side-key"
OPENAI_MODEL="gpt-6-luna"
OPENAI_INPUT_USD_PER_MILLION="0.10"
OPENAI_OUTPUT_USD_PER_MILLION="0.50"
```

The model is configured rather than hardcoded. For the OpenAI example, the following references were checked on 28 September 2026:

- [GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API pricing](https://platform.openai.com/pricing)

At DeepSeek Flash peak cache-miss rates, an illustrative 4,000 input tokens and 800 output tokens is approximately $0.00216. Actual input size, output size, caching, time of day, processing mode, regional pricing, and future price changes affect cost. MailShield stores provider-reported token usage when available; its displayed cost is only an estimate.

The zero-cost alternative is deterministic-only inspection with AI disabled. A future provider adapter could target a locally hosted open-weight model, but no local-model integration is included or claimed in Phase 3.

To stop all AI calls immediately, remove or blank the selected provider's API key, restart the server, and optionally disable analysis in the workspace. The rest of the site, deterministic checks, Gmail import, and EML parsing continue working.

## Privacy and consent

AI analysis is disabled per user by default. The user must enable the workspace setting before any private message can be sent to the configured AI provider.

For each automatically analyzed message, MailShield may send:

- sender, reply-to, subject, and up to 24,000 characters of server-normalized plain text;
- extracted URLs and selected unverified headers;
- attachment filename, MIME type, and size metadata;
- deterministic findings.

It does not send account tokens, sessions, database IDs, unrelated messages, raw HTML, the original EML file, or attachment bodies. The API request uses `store: false`. After consent is enabled, newly imported Gmail and EML messages are analyzed automatically. Users can reanalyze one message, delete a stored report, delete an uploaded EML record, disable future analysis, or delete all stored data.

Emails and their dependent reports use the existing 30-day retention timestamp. Expired email is hidden immediately. Physical cleanup uses the protected `POST /api/cleanup` endpoint; no automatic scheduler is added in this phase.

## Analysis pipeline

1. Authorize the user and load only their unexpired stored email.
2. Normalize the email and cap the body sent to the provider.
3. Extract URL hosts, IP addresses, authentication evidence, and attachment metadata.
4. Run versioned deterministic checks.
5. Send only the selected normalized evidence to the configured model after consent and budget checks.
6. Require strict structured output and retry invalid/provider failures at most once.
7. Combine the AI score and deterministic contribution with one versioned formula.
8. Store a new immutable report version, evidence, findings, usage, and any medium/high notification in one transaction.
9. Mark the email `COMPLETED`, `NEEDS_REVIEW`, or `FAILED`.

Statuses include `NOT_ANALYZED`, `QUEUED`, `ANALYZING`, `COMPLETED`, `FAILED`, and `NEEDS_REVIEW`. A database status transition prevents duplicate concurrent analysis. A completed email is analyzed once unless the user explicitly chooses reanalysis, which creates a new report version rather than overwriting history.

Automatic analysis processes pending messages with bounded concurrency after imports, uploads, consent changes, and workspace visits. The per-user daily limit defaults to 50 and is configurable from 1–50. There are no paid overages; work runs within the triggering Vercel request lifecycle rather than a permanent worker.

## Deterministic checks

Version `checks-1.0.0` implements:

- missing or malformed sender;
- display-name email versus actual sender mismatch;
- sender and reply-to domain mismatch;
- urgency, credential, payment, gift-card, invoice, wire-transfer, and bank-detail language;
- URL hostname extraction, numeric-IP URLs, maintained local shortener list, punycode, and common look-alike patterns;
- visible-link destination mismatch when HTML anchor metadata is available;
- unusual, double, executable, and script attachment extensions;
- SPF, DKIM, and DMARC values parsed from Authentication-Results.

Authentication headers are shown as unverified message-header evidence. MailShield does not independently validate DNS or the header chain. URLs are never visited. Attachment bodies are never opened, executed, retained, or malware-scanned.

## Structured report and scoring

Reports distinguish observed evidence, deterministic findings, AI interpretation, suspicious locations, possible attack method, recommended actions, limitations, and user corrections. Technical details retain model, prompt, checks, scoring versions, timestamp, truncation, and token usage.

The provisional severity thresholds remain:

- Low: 0–39
- Medium: 40–69
- High: 70–100

Scoring version `hybrid-1.0.0` assigns deterministic findings 4/9/16 points for low/medium/high, capped at 40. The displayed score is `round(AI score × 0.75 + deterministic contribution)`, capped to 0–100. This is an estimated risk indicator, not a verified probability. A low score never certifies safety.

“Mark as not a threat” creates a reversible user correction. It does not overwrite the original report and does not imply model retraining.

## EML upload

- Accepts `.eml` only, maximum 5 MB.
- Validates message structure instead of trusting the filename or browser MIME type.
- Limits MIME nesting and aggregate headers.
- Parses common multipart email, prefers text, and converts HTML-only messages to plain text.
- Extracts headers, URLs/link text, and attachment metadata.
- Hashes the original bytes with SHA-256 to deduplicate per user.
- Discards the original uploaded file after successful parsing.
- Never renders raw HTML, loads remote images, executes embedded content, or makes extracted URLs clickable.

MSG is not supported in Phase 3.

## Evaluation workflow

`evaluation/sample-dataset.json` is an original synthetic CC0 sample. It records item ID, content, sender fields, expected class, source, license, split, and sanitization notes. Private or copyrighted email must not be added without documented permission. Prompt examples and the held-out `test` split are separate.

Run the free deterministic baseline:

```powershell
npm run evaluate
```

Run a small live-model evaluation only when explicitly intended:

```powershell
$env:LIVE_EVAL="true"
npm run evaluate
```

This requires the selected provider's API key/model settings and spends API credits. Evaluation cases, runs, results, model/prompt/scoring/dataset versions, duration, failures, and optional human-review fields are stored separately from private user reports.

Compare two stored runs:

```powershell
npm run evaluate -- --compare RUN_ID_1 RUN_ID_2
```

The workflow reports a confusion matrix, precision, recall, F1, false-positive rate, false-negative count, category results, average time, and invalid/failed analyses. Precision measures how often flagged examples are truly threats; recall measures how many expected threats were found; F1 balances precision and recall. False positives are legitimate examples incorrectly flagged, while false negatives are expected threats missed.

The bundled sample is intentionally tiny and cannot support a production-grade accuracy claim. Evaluation should grow with representative, legally usable, human-reviewed data. OpenAI also recommends task-specific, continuously iterated evaluations rather than subjective “looks good” testing: [evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

## Verification

```powershell
npm run typecheck
npm test
npm run evaluate
npm run build
npm run format:check
```

Automated tests mock or bypass the AI provider and never spend API credits. Live analysis is tested only when a key and explicit live configuration are present.

## Phase boundaries

Implemented through Phase 4: fictional demo, private accounts, PostgreSQL, manual and monitored Gmail sync, EML upload, deterministic checks, consent-gated AI analysis, stored versioned reports, notifications, Gmail labels, usage controls, and evaluation.

Deliberately absent: Gmail extension/sidebar, Outlook integration, Resend alerts, attachment-content malware scanning, and model fine-tuning.

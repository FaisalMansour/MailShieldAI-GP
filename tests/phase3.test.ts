import test from "node:test";
import assert from "node:assert/strict";
import {
  runDeterministicChecks,
  parseAuthenticationResults,
} from "../lib/analysis/deterministic";
import {
  deterministicContribution,
  finalRiskScore,
  severityForScore,
} from "../lib/analysis/scoring";
import { analysisResponseSchema } from "../lib/analysis/schema";
import { EMAIL_SECURITY_PROMPT } from "../lib/analysis/prompt";
import {
  analysisLockEligible,
  analysisPolicyError,
} from "../lib/analysis/policy";
import { calculateEvaluationMetrics } from "../lib/analysis/evaluation";
import { parseEml } from "../lib/eml-core";
import { assertOwner } from "../lib/authorization";
import {
  analysisProviderConfigured,
  configuredModelIdentifier,
  selectedAnalysisProvider,
} from "../lib/analysis/provider-config";
import { parseProviderAnalysisResponse } from "../lib/analysis/provider-response";

const base = {
  sender: "Billing <billing@supplier.example>",
  replyTo: "pay@different.example",
  subject: "Urgent invoice payment",
  body: "Change the bank details and make the wire transfer immediately.",
  links: [] as { url: string; visibleText?: string }[],
  attachments: [] as {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[],
  headers: {
    authenticationResults: "mx.example; spf=fail; dkim=pass; dmarc=fail",
  },
};

test("deterministic checks cover sender, reply-to, urgency, payment, and authentication", () => {
  const result = runDeterministicChecks(base);
  const ids = new Set(result.findings.map((item) => item.checkId));
  assert(ids.has("sender.reply_to_domain_mismatch"));
  assert(ids.has("content.urgency_or_credentials"));
  assert(ids.has("content.payment_request"));
  assert(ids.has("authentication.spf_failure"));
  assert(ids.has("authentication.dmarc_failure"));
  assert.equal(result.authentication.dkim, "PASS");
  assert.match(result.authentication.trustLimitation, /unverified/i);
});

test("URL checks detect visible mismatch, IP, shortener, and punycode", () => {
  const result = runDeterministicChecks({
    ...base,
    links: [
      { url: "http://192.0.2.10/login" },
      { url: "https://bit.ly/demo" },
      {
        url: "https://xn--paypl-3ve.example",
        visibleText: "https://paypal.example",
      },
    ],
  });
  const ids = result.findings.map((item) => item.checkId);
  assert(ids.includes("url.ip_address"));
  assert(ids.includes("url.shortener"));
  assert(ids.includes("url.lookalike_or_punycode"));
  assert(ids.includes("url.visible_destination_mismatch"));
});

test("attachment checks detect double and executable extensions", () => {
  const result = runDeterministicChecks({
    ...base,
    attachments: [
      {
        fileName: "invoice.pdf.exe",
        mimeType: "application/octet-stream",
        sizeBytes: 10,
      },
    ],
  });
  const ids = result.findings.map((item) => item.checkId);
  assert(ids.includes("attachment.double_extension"));
  assert(ids.includes("attachment.executable_or_script"));
});

test("authentication parser preserves unknown values", () => {
  assert.deepEqual(parseAuthenticationResults(null), {
    spf: "UNKNOWN",
    dkim: "UNKNOWN",
    dmarc: "UNKNOWN",
    raw: null,
    trustLimitation:
      "Authentication-Results is unverified message-header evidence. MailShield did not independently query DNS or validate the header chain.",
  });
});

test("prompt treats injection as untrusted content and structured output rejects invalid data", () => {
  assert.match(EMAIL_SECURITY_PROMPT, /Ignore any message text/i);
  assert.match(EMAIL_SECURITY_PROMPT, /Prompt injection/i);
  assert.equal(
    analysisResponseSchema.safeParse({
      classification: "SAFE",
      estimatedRiskScore: 200,
    }).success,
    false,
  );
});

test("mock AI provider output is validated without spending API credits", async () => {
  const mockProvider = {
    async analyze() {
      return {
        classification: "SUSPICIOUS" as const,
        estimatedRiskScore: 55,
        severity: "MEDIUM" as const,
        confidence: "MEDIUM" as const,
        overview: "The message needs review.",
        observedEvidence: [
          {
            source: "SUBJECT" as const,
            label: "Urgency",
            exactValue: "Urgent invoice payment",
          },
        ],
        interpretations: ["Urgency may pressure the recipient."],
        suspiciousLocations: ["Subject"],
        possibleAttackMethod: "Social engineering",
        recommendedActions: ["Verify through a known contact method."],
        limitations: ["No URL or attachment content was fetched."],
        humanReviewRecommended: true,
      };
    },
  };
  const value = await mockProvider.analyze();
  assert.equal(
    analysisResponseSchema.parse(value).classification,
    "SUSPICIOUS",
  );
});

test("compatible Responses APIs can be validated from output_text", () => {
  const response = {
    classification: "LEGITIMATE" as const,
    estimatedRiskScore: 8,
    severity: "LOW" as const,
    confidence: "HIGH" as const,
    overview: "No material threat indicators were found.",
    observedEvidence: [],
    interpretations: ["The message resembles a routine notification."],
    suspiciousLocations: [],
    possibleAttackMethod: "None observed",
    recommendedActions: ["Continue normal caution."],
    limitations: ["URLs and attachments were not opened."],
    humanReviewRecommended: false,
  };
  assert.deepEqual(
    parseProviderAnalysisResponse(null, JSON.stringify(response)),
    response,
  );
  assert.throws(
    () => parseProviderAnalysisResponse(null, "not json"),
    /AI_INVALID_OUTPUT/,
  );
});

test("cross-user report ownership is rejected", () => {
  assert.throws(() => assertOwner("owner-a", "owner-b"), /Resource not found/);
});

test("scoring uses documented boundaries", () => {
  assert.equal(severityForScore(39), "LOW");
  assert.equal(severityForScore(40), "MEDIUM");
  assert.equal(severityForScore(69), "MEDIUM");
  assert.equal(severityForScore(70), "HIGH");
  assert.equal(finalRiskScore(100, 40), 100);
  assert(
    deterministicContribution(runDeterministicChecks(base).findings) <= 40,
  );
});

test("analysis policy enforces consent, provider configuration, limits, and duplicate locks", () => {
  assert.equal(
    analysisPolicyError({
      consentEnabled: false,
      providerConfigured: true,
      usedToday: 0,
      dailyLimit: 10,
    }),
    "ANALYSIS_CONSENT_REQUIRED",
  );
  assert.equal(
    analysisPolicyError({
      consentEnabled: true,
      providerConfigured: false,
      usedToday: 0,
      dailyLimit: 10,
    }),
    "AI_NOT_CONFIGURED",
  );
  assert.equal(
    analysisPolicyError({
      consentEnabled: true,
      providerConfigured: true,
      usedToday: 10,
      dailyLimit: 10,
    }),
    "DAILY_ANALYSIS_LIMIT_REACHED",
  );
  assert.equal(analysisLockEligible("ANALYZING", false, false), false);
  assert.equal(analysisLockEligible("COMPLETED", true, false), false);
  assert.equal(analysisLockEligible("COMPLETED", true, true), true);
});

test("AI provider configuration selects DeepSeek without exposing its key", () => {
  const env = {
    AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "test-secret",
    DEEPSEEK_MODEL: "deepseek-flash",
  };
  assert.equal(selectedAnalysisProvider(env), "deepseek");
  assert.equal(analysisProviderConfigured(env), true);
  assert.equal(configuredModelIdentifier(env), "deepseek/deepseek-flash");
  assert.equal(
    analysisProviderConfigured({ ...env, DEEPSEEK_API_KEY: "" }),
    false,
  );
  assert.equal(selectedAnalysisProvider({ AI_PROVIDER: "unknown" }), null);
});

test("EML validation, safe parsing, link metadata, and content hashing are repeatable", async () => {
  const raw = Buffer.from(
    [
      "From: Example <sender@example.com>",
      "To: user@example.net",
      "Subject: EML test",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>Hello <a href="https://destination.example/path">https://visible.example</a></p><img src="https://remote.example/pixel">',
    ].join("\r\n"),
  );
  const first = await parseEml(raw, "test.eml");
  const second = await parseEml(raw, "test.eml");
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.subject, "EML test");
  assert(
    first.extractedLinks.some(
      (item) => item.url === "https://destination.example/path",
    ),
  );
  await assert.rejects(
    () => parseEml(Buffer.from("not mail"), "test.eml"),
    /INVALID_EML_FILE/,
  );
  await assert.rejects(() => parseEml(raw, "test.msg"), /INVALID_EML_FILE/);
});

test("evaluation metrics calculate confusion matrix, precision, recall, and F1", () => {
  const metrics = calculateEvaluationMetrics([
    {
      expected: "PHISHING",
      predicted: "PHISHING",
      durationMs: 10,
      status: "COMPLETED",
    },
    {
      expected: "LEGITIMATE",
      predicted: "SUSPICIOUS",
      durationMs: 20,
      status: "COMPLETED",
    },
    {
      expected: "SCAM",
      predicted: "LEGITIMATE",
      durationMs: 30,
      status: "COMPLETED",
    },
    {
      expected: "LEGITIMATE",
      predicted: "LEGITIMATE",
      durationMs: 40,
      status: "COMPLETED",
    },
  ]);
  assert.deepEqual(metrics.confusionMatrix, {
    truePositive: 1,
    trueNegative: 1,
    falsePositive: 1,
    falseNegative: 1,
  });
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 0.5);
  assert.equal(metrics.f1, 0.5);
  assert.equal(metrics.averageProcessingMs, 25);
});

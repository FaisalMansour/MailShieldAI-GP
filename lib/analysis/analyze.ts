import "server-only";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../db";
import { assertOwner } from "../authorization";
import { runDeterministicChecks } from "./deterministic";
import {
  deterministicContribution,
  finalRiskScore,
  severityForScore,
} from "./scoring";
import { createAnalysisProvider, type AnalysisProvider } from "./provider";
import { analysisProviderConfigured } from "./provider-config";
import {
  ANALYSIS_BATCH_LIMIT,
  ANALYSIS_BODY_LIMIT,
  CHECK_VERSION,
  PROMPT_VERSION,
  SCORING_VERSION,
  normalizeStoredLinks,
  type AnalysisEmail,
} from "./types";
import { analysisPolicyError } from "./policy";

function startOfUtcDay(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function dailyUsage(userId: string, now = new Date()) {
  return prisma.analysisUsage.aggregate({
    where: { userId, usageDate: { gte: startOfUtcDay(now) } },
    _sum: {
      analyzedMessages: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostMicros: true,
    },
  });
}

export async function analyzeStoredEmail(
  userId: string,
  emailId: string,
  options: { reanalyze?: boolean; provider?: AnalysisProvider } = {},
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { analysisEnabled: true, dailyAnalysisLimit: true },
  });
  if (!user) throw new Error("AUTH_REQUIRED");
  const used = await dailyUsage(userId);
  const policyError = analysisPolicyError({
    consentEnabled: user.analysisEnabled,
    providerConfigured:
      Boolean(options.provider) || analysisProviderConfigured(),
    usedToday: used._sum.analyzedMessages || 0,
    dailyLimit: user.dailyAnalysisLimit,
  });
  if (policyError) throw new Error(policyError);

  const email = await prisma.storedEmail.findFirst({
    where: { id: emailId, userId, expiresAt: { gt: new Date() } },
    include: {
      attachments: true,
      reports: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!email) throw new Error("EMAIL_NOT_FOUND");
  assertOwner(email.userId, userId);
  if (!options.reanalyze && email.reports.length)
    throw new Error("ALREADY_ANALYZED");

  const allowed = options.reanalyze
    ? ([
        "NOT_ANALYZED",
        "QUEUED",
        "FAILED",
        "NEEDS_REVIEW",
        "COMPLETED",
        "PARSE_PARTIAL",
      ] as const)
    : ([
        "NOT_ANALYZED",
        "QUEUED",
        "FAILED",
        "NEEDS_REVIEW",
        "PARSE_PARTIAL",
      ] as const);
  const acquired = await prisma.storedEmail.updateMany({
    where: { id: email.id, userId, processingStatus: { in: [...allowed] } },
    data: { processingStatus: "ANALYZING" },
  });
  if (!acquired.count) throw new Error("ANALYSIS_ALREADY_RUNNING");

  try {
    const bodyTruncated = email.plainTextBody.length > ANALYSIS_BODY_LIMIT;
    const normalized: AnalysisEmail = {
      sender: email.sender,
      replyTo: email.replyTo,
      subject: email.subject,
      body: email.plainTextBody.slice(0, ANALYSIS_BODY_LIMIT),
      links: normalizeStoredLinks(email.extractedLinks),
      attachments: email.attachments.map((item) => ({
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      })),
      headers: (email.selectedHeaders || {}) as Record<string, string | null>,
    };
    const deterministic = runDeterministicChecks(normalized);
    const provider = options.provider || createAnalysisProvider();
    const ai = await provider.analyze(normalized, deterministic);
    const deterministicPoints = deterministicContribution(
      deterministic.findings,
    );
    const score = finalRiskScore(
      ai.report.estimatedRiskScore,
      deterministicPoints,
    );
    const severity = severityForScore(score);
    const needsReview =
      ai.report.humanReviewRecommended || ai.report.confidence === "LOW";
    const version = (email.reports[0]?.version || 0) + 1;
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      const report = await tx.analysisReport.create({
        data: {
          storedEmailId: email.id,
          userId,
          version,
          classification: ai.report.classification,
          aiScore: ai.report.estimatedRiskScore,
          deterministicContribution: deterministicPoints,
          finalScore: score,
          severity,
          confidence: ai.report.confidence,
          overview: ai.report.overview,
          interpretations: ai.report.interpretations as Prisma.InputJsonValue,
          suspiciousLocations: ai.report
            .suspiciousLocations as Prisma.InputJsonValue,
          attackMethod: ai.report.possibleAttackMethod,
          recommendedActions: ai.report
            .recommendedActions as Prisma.InputJsonValue,
          limitations: [
            ...ai.report.limitations,
            ...(bodyTruncated
              ? [
                  `The body sent to the AI provider was truncated to ${ANALYSIS_BODY_LIMIT.toLocaleString()} characters.`,
                ]
              : []),
            "URLs were not visited and attachment contents were not downloaded or scanned.",
          ] as Prisma.InputJsonValue,
          humanReviewRecommended: needsReview,
          bodyTruncated,
          checkVersion: CHECK_VERSION,
          promptVersion: PROMPT_VERSION,
          scoringVersion: SCORING_VERSION,
          modelIdentifier: ai.model,
          inputTokens: ai.inputTokens,
          outputTokens: ai.outputTokens,
          estimatedCostMicros: ai.estimatedCostMicros,
          evidence: {
            create: ai.report.observedEvidence.map((item) => ({
              source: item.source,
              label: item.label,
              exactValue: item.exactValue,
            })),
          },
          findings: { create: deterministic.findings },
        },
      });
      await tx.analysisUsage.create({
        data: {
          userId,
          reportId: report.id,
          usageDate: now,
          inputTokens: ai.inputTokens,
          outputTokens: ai.outputTokens,
          estimatedCostMicros: ai.estimatedCostMicros,
        },
      });
      if (severity !== "LOW") {
        await tx.notification.create({
          data: {
            userId,
            storedEmailId: email.id,
            reportId: report.id,
            severity,
            title: `${severity === "HIGH" ? "High" : "Medium"}-risk email finding`,
            message: `${email.subject || "(No subject)"}: ${ai.report.overview.slice(0, 240)}`,
          },
        });
      }
      await tx.storedEmail.update({
        where: { id: email.id },
        data: {
          processingStatus: needsReview ? "NEEDS_REVIEW" : "COMPLETED",
          gmailLabelStatus: email.gmailConnectionId
            ? "PENDING"
            : "NOT_REQUIRED",
          gmailLabelRetries: 0,
          automaticAnalysisRetries: 0,
          automaticAnalysisNextAt: null,
        },
      });
      if (email.gmailConnectionId)
        await tx.gmailConnection.update({
          where: { id: email.gmailConnectionId },
          data: { lastAnalysisAt: now },
        });
      return report;
    });
  } catch (error) {
    await prisma.storedEmail.updateMany({
      where: { id: email.id, userId, processingStatus: "ANALYZING" },
      data: {
        processingStatus: "FAILED",
        automaticAnalysisRetries: { increment: 1 },
        automaticAnalysisNextAt: new Date(
          Date.now() +
            Math.min(60, 2 ** Math.min(email.automaticAnalysisRetries, 5)) *
              60_000,
        ),
      },
    });
    throw error;
  }
}

export async function analyzeUnprocessedBatch(
  userId: string,
  provider?: AnalysisProvider,
) {
  const [user, used] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { analysisEnabled: true, dailyAnalysisLimit: true },
    }),
    dailyUsage(userId),
  ]);
  if (!user) throw new Error("AUTH_REQUIRED");
  const usedToday = used._sum.analyzedMessages || 0;
  const policyError = analysisPolicyError({
    consentEnabled: user.analysisEnabled,
    providerConfigured: Boolean(provider) || analysisProviderConfigured(),
    usedToday,
    dailyLimit: user.dailyAnalysisLimit,
  });
  if (policyError) throw new Error(policyError);
  const remainingToday = user.dailyAnalysisLimit - usedToday;
  const messages = await prisma.storedEmail.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
      processingStatus: { in: ["NOT_ANALYZED", "FAILED", "PARSE_PARTIAL"] },
      automaticAnalysisRetries: { lt: 4 },
      OR: [
        { automaticAnalysisNextAt: null },
        { automaticAnalysisNextAt: { lte: new Date() } },
      ],
    },
    select: { id: true },
    orderBy: { importedAt: "asc" },
    take: Math.min(ANALYSIS_BATCH_LIMIT, remainingToday),
  });
  if (!messages.length) return { completed: 0, failed: 0 };
  await prisma.storedEmail.updateMany({
    where: { id: { in: messages.map((item) => item.id) }, userId },
    data: { processingStatus: "QUEUED" },
  });
  let completed = 0;
  let failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < messages.length) {
      const message = messages[cursor++];
      try {
        await analyzeStoredEmail(userId, message.id, { provider });
        completed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, messages.length) }, () => worker()),
  );
  return { completed, failed };
}

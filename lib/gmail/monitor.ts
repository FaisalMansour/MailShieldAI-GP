import "server-only";
import { prisma } from "../db";
import { analysisProviderConfigured } from "../analysis/provider-config";
import { analyzeUnprocessedBatch } from "../analysis/analyze";
import { gmailFor } from "./client";
import { hasModifyScope, notificationDisposition } from "./monitor-core";
import { syncNewMail } from "./sync";
import { syncPendingLabels } from "./labels";
import { GMAIL_SCOPE, GMAIL_MODIFY_SCOPE } from "./oauth";

function safeCode(error: unknown) {
  const value = error as { code?: number; response?: { status?: number } };
  const status = value.code || value.response?.status;
  if (status === 401) return "GMAIL_AUTH";
  if (status === 403) return "GMAIL_PERMISSION";
  if (status === 429) return "GMAIL_RATE_LIMIT";
  if (typeof status === "number" && status >= 500) return "GMAIL_UNAVAILABLE";
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z_]{3,60}$/.test(message)
    ? message
    : "MONITORING_OPERATION_FAILED";
}

export function monitoringConfig() {
  const topic = process.env.GMAIL_PUBSUB_TOPIC || "";
  const subscription = process.env.GMAIL_PUBSUB_SUBSCRIPTION || "";
  const audience = process.env.GMAIL_PUBSUB_AUDIENCE || "";
  const serviceAccount = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT || "";
  const endpoint = process.env.GMAIL_PUBSUB_ENDPOINT || "";
  const configured =
    /^projects\/[^/]+\/topics\/[^/]+$/.test(topic) &&
    /^projects\/[^/]+\/subscriptions\/[^/]+$/.test(subscription) &&
    /^https:\/\//.test(endpoint) &&
    audience === endpoint &&
    /^[^\s@]+@[^\s@]+$/.test(serviceAccount);
  return {
    topic,
    subscription,
    audience,
    serviceAccount,
    endpoint,
    configured,
  };
}

export async function renewWatch(userId: string, enable = false) {
  const connection = await prisma.gmailConnection.findUnique({
    where: { userId },
    include: { user: { select: { analysisEnabled: true } } },
  });
  if (!connection || connection.status !== "CONNECTED")
    throw new Error("GMAIL_NOT_CONNECTED");
  if (!enable && !connection.monitoringEnabled)
    throw new Error("MONITORING_DISABLED");
  if (!connection.user.analysisEnabled || !analysisProviderConfigured())
    throw new Error("ANALYSIS_CONSENT_REQUIRED");
  if (
    !connection.grantedScopes
      .split(/\s+/)
      .some((scope) => scope === GMAIL_SCOPE || scope === GMAIL_MODIFY_SCOPE)
  )
    throw new Error("GMAIL_SCOPE_NOT_GRANTED");
  const config = monitoringConfig();
  if (!config.configured) throw new Error("PUBSUB_NOT_CONFIGURED");
  const now = new Date();
  const acquired = await prisma.gmailConnection.updateMany({
    where: {
      id: connection.id,
      OR: [{ watchLockUntil: null }, { watchLockUntil: { lt: now } }],
    },
    data: { watchLockUntil: new Date(now.getTime() + 2 * 60_000) },
  });
  if (!acquired.count) throw new Error("WATCH_ALREADY_RUNNING");
  try {
    const gmail = await gmailFor(connection);
    const response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: config.topic,
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
      },
    });
    if (!response.data.historyId || !response.data.expiration)
      throw new Error("WATCH_INVALID_RESPONSE");
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        monitoringEnabled: true,
        watchExpiresAt: new Date(Number(response.data.expiration)),
        watchRenewedAt: new Date(),
        historyId: connection.historyId || response.data.historyId,
        monitoringError: null,
        retryCount: 0,
        retryAfter: null,
      },
    });
  } catch (error) {
    const code = safeCode(error);
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        monitoringError: code,
        status: code === "GMAIL_AUTH" ? "RECONNECT_REQUIRED" : undefined,
        monitoringEnabled: code === "GMAIL_AUTH" ? false : undefined,
        watchExpiresAt: code === "GMAIL_AUTH" ? null : undefined,
        retryCount: { increment: 1 },
        retryAfter: new Date(Date.now() + 15 * 60_000),
      },
    });
    throw error;
  } finally {
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: { watchLockUntil: null },
    });
  }
}

export async function disableMonitoring(userId: string) {
  const connection = await prisma.gmailConnection.findUnique({
    where: { userId },
  });
  if (!connection) throw new Error("GMAIL_NOT_CONNECTED");
  let error: string | null = null;
  if (connection.status === "CONNECTED" && connection.monitoringEnabled) {
    try {
      const gmail = await gmailFor(connection);
      await gmail.users.stop({ userId: "me" });
    } catch {
      error =
        "Gmail stop could not be confirmed; the local watch is disabled and notifications will be ignored.";
    }
  }
  await prisma.gmailConnection.update({
    where: { id: connection.id },
    data: {
      monitoringEnabled: false,
      watchExpiresAt: null,
      monitoringError: error,
    },
  });
}

export async function processMailbox(
  userId: string,
  source: "PUSH" | "RECOVERY" | "MANUAL",
) {
  const connection = await prisma.gmailConnection.findUniqueOrThrow({
    where: { userId },
  });
  const run = await prisma.gmailSyncRun.create({
    data: { connectionId: connection.id, source, status: "STARTED" },
  });
  try {
    const result = await syncNewMail(userId);
    let analysis = { completed: 0, failed: 0 };
    try {
      analysis = await analyzeUnprocessedBatch(userId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "ANALYSIS_FAILED";
      if (
        ![
          "DAILY_ANALYSIS_LIMIT_REACHED",
          "ANALYSIS_CONSENT_REQUIRED",
          "AI_NOT_CONFIGURED",
        ].includes(code)
      )
        throw error;
    }
    if (hasModifyScope(connection.grantedScopes))
      await syncPendingLabels(userId);
    await prisma.gmailSyncRun.update({
      where: { id: run.id },
      data: {
        status: result.hasMore
          ? "PARTIAL"
          : analysis.failed
            ? "ANALYSIS_FAILED"
            : "COMPLETED",
        imported: result.imported,
        duplicate: result.duplicate,
        finishedAt: new Date(),
      },
    });
    if (source !== "MANUAL")
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          lastAutomaticSyncAt: new Date(),
          monitoringError: result.hasMore
            ? "More Gmail history is queued for the next recovery run."
            : null,
          retryCount: 0,
          retryAfter: null,
        },
      });
    return result;
  } catch (error) {
    const code = safeCode(error);
    await prisma.gmailSyncRun.update({
      where: { id: run.id },
      data: {
        status: code === "SYNC_ALREADY_RUNNING" ? "DEFERRED" : "FAILED",
        errorCode: code,
        finishedAt: new Date(),
      },
    });
    if (code !== "SYNC_ALREADY_RUNNING")
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          monitoringError: code,
          retryCount: { increment: 1 },
          retryAfter: new Date(
            Date.now() +
              Math.min(60, 2 ** Math.min(connection.retryCount, 5)) * 60_000,
          ),
        },
      });
    throw error;
  }
}

export async function processNotification(
  pubsubId: string,
  mailbox: string,
  historyId: string,
) {
  const connection = await prisma.gmailConnection.findFirst({
    where: {
      mailboxEmail: { equals: mailbox, mode: "insensitive" },
    },
  });
  if (!connection) return "UNKNOWN_MAILBOX";
  if (connection.status !== "CONNECTED" || !connection.monitoringEnabled)
    return "IGNORED";
  const receipt = await prisma.gmailPushNotification.upsert({
    where: { pubsubId },
    create: { connectionId: connection.id, pubsubId, historyId },
    update: {},
  });
  await prisma.gmailConnection.update({
    where: { id: connection.id },
    data: { lastNotificationAt: new Date() },
  });
  const disposition = notificationDisposition(
    receipt.status,
    receipt.attempts,
    historyId,
    connection.historyId,
    Boolean(connection.continuationPageToken) ||
      (Array.isArray(connection.pendingMessageIds) &&
        connection.pendingMessageIds.length > 0),
  );
  if (disposition === "DUPLICATE") return "DUPLICATE";
  if (disposition === "RETRY_EXHAUSTED") {
    await prisma.gmailPushNotification.update({
      where: { id: receipt.id },
      data: { status: "RETRY_EXHAUSTED" },
    });
    return "RETRY_EXHAUSTED";
  }
  if (disposition === "OLD") {
    await prisma.gmailPushNotification.update({
      where: { id: receipt.id },
      data: { status: "COMPLETED", processedAt: new Date() },
    });
    return "OLD";
  }
  try {
    await prisma.gmailPushNotification.update({
      where: { id: receipt.id },
      data: { attempts: { increment: 1 }, status: "PROCESSING" },
    });
    const result = await processMailbox(connection.userId, "PUSH");
    await prisma.gmailPushNotification.update({
      where: { id: receipt.id },
      data: {
        status: result.hasMore ? "PARTIAL" : "COMPLETED",
        processedAt: new Date(),
        lastError: null,
      },
    });
    return result.hasMore ? "PARTIAL" : "COMPLETED";
  } catch (error) {
    const code = safeCode(error);
    await prisma.gmailPushNotification.update({
      where: { id: receipt.id },
      data: {
        status: code === "SYNC_ALREADY_RUNNING" ? "RECEIVED" : "FAILED",
        lastError: code,
        attempts:
          code === "SYNC_ALREADY_RUNNING" ? { decrement: 1 } : undefined,
      },
    });
    throw error;
  }
}

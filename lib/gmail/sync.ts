import "server-only";
import { Prisma } from "../generated/prisma/client";
import type { gmail_v1 } from "googleapis";
import { prisma } from "../db";
import { assertOwner } from "../authorization";
import { gmailFor } from "./client";
import { parseGmailMessage } from "./parser";
import { uniqueMessageIds } from "./sync-core";
export { cursorAfterPage, uniqueMessageIds } from "./sync-core";

const RETENTION_DAYS = 30;
const HISTORY_MESSAGE_LIMIT = 50;
export type SyncResult = {
  imported: number;
  duplicate: number;
  hasMore: boolean;
  recovered: boolean;
};

export function expiresAt(importedAt = new Date()) {
  return new Date(importedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function connectionFor(userId: string) {
  const connection = await prisma.gmailConnection.findUnique({
    where: { userId },
  });
  if (!connection) throw new Error("GMAIL_NOT_CONNECTED");
  assertOwner(connection.userId, userId);
  return connection;
}
async function persistMessage(
  userId: string,
  connectionId: string,
  message: gmail_v1.Schema$Message,
) {
  let parsed: ReturnType<typeof parseGmailMessage>;
  try {
    parsed = parseGmailMessage(message);
  } catch {
    throw new Error("EMAIL_PARSE_FAILED");
  }

  try {
    const result = await prisma.storedEmail.upsert({
      where: {
        gmailConnectionId_gmailMessageId: {
          gmailConnectionId: connectionId,
          gmailMessageId: parsed.gmailMessageId,
        },
      },
      update: {},
      create: {
        userId,
        gmailConnectionId: connectionId,
        gmailMessageId: parsed.gmailMessageId,
        gmailThreadId: parsed.gmailThreadId,
        sender: parsed.sender,
        replyTo: parsed.replyTo,
        recipients: parsed.recipients as Prisma.InputJsonValue,
        subject: parsed.subject,
        receivedAt: parsed.receivedAt,
        plainTextBody: parsed.plainTextBody,
        extractedLinks: parsed.extractedLinks,
        selectedHeaders: parsed.selectedHeaders,
        contentTruncated: parsed.contentTruncated,
        parseNote: parsed.parseNote,
        processingStatus: parsed.contentTruncated
          ? "PARSE_PARTIAL"
          : "NOT_ANALYZED",
        expiresAt: expiresAt(),
        attachments: { create: parsed.attachments },
      },
      select: { importedAt: true },
    });
    return result.importedAt;
  } catch {
    throw new Error("DATABASE_WRITE_FAILED");
  }
}
async function locked<T>(
  userId: string,
  work: (connection: Awaited<ReturnType<typeof connectionFor>>) => Promise<T>,
) {
  const connection = await connectionFor(userId);
  if (connection.status !== "CONNECTED") throw new Error("GMAIL_NOT_CONNECTED");
  const acquired = await prisma.gmailConnection.updateMany({
    where: {
      id: connection.id,
      userId,
      syncInProgress: false,
      status: "CONNECTED",
    },
    data: { syncInProgress: true, lastErrorCode: null, lastErrorMessage: null },
  });
  if (!acquired.count) throw new Error("SYNC_ALREADY_RUNNING");
  try {
    return await work(connection);
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  } finally {
    await prisma.gmailConnection.updateMany({
      where: { id: connection.id, userId },
      data: { syncInProgress: false },
    });
  }
}
function errorStatus(error: unknown) {
  const value = error as { code?: number; response?: { status?: number } };
  return value.code || value.response?.status;
}
async function recordSyncError(id: string, error: unknown) {
  const status = errorStatus(error);
  const code = error instanceof Error ? error.message : "";
  const reconnect = status === 401;
  const permission = status === 403;
  const rate = status === 429;
  const parsing = code === "EMAIL_PARSE_FAILED";
  const database = code === "DATABASE_WRITE_FAILED";
  await prisma.gmailConnection
    .update({
      where: { id },
      data: {
        status: reconnect ? "RECONNECT_REQUIRED" : undefined,
        lastErrorCode: reconnect
          ? "GMAIL_AUTH"
          : permission
            ? "GMAIL_PERMISSION"
            : rate
              ? "GMAIL_RATE_LIMIT"
              : parsing
                ? "EMAIL_PARSE_FAILED"
                : database
                  ? "DATABASE_WRITE_FAILED"
                  : "SYNC_FAILED",
        lastErrorMessage: reconnect
          ? "Gmail access expired or was revoked. Reconnect Gmail."
          : permission
            ? "Google denied the required Gmail read permission. Reconnect Gmail and approve read-only access."
            : rate
              ? "Google temporarily rate-limited this mailbox. Try again later."
              : parsing
                ? "A Gmail message could not be parsed. No sync cursor was advanced; retry is safe."
                : database
                  ? "An email could not be saved to PostgreSQL. No sync cursor was advanced; check the database and retry."
                  : "Synchronization did not finish. The saved cursor was not advanced.",
      },
    })
    .catch(() => {});
}

export async function importLatest20(userId: string): Promise<SyncResult> {
  return locked(userId, async (connection) => {
    const gmail = await gmailFor(connection);
    const listed = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 20,
    });
    const ids = uniqueMessageIds(
      (listed.data.messages || []).map((item) => item.id || ""),
    );
    let imported = 0,
      duplicate = 0;
    for (const id of ids) {
      const existed = await prisma.storedEmail.findUnique({
        where: {
          gmailConnectionId_gmailMessageId: {
            gmailConnectionId: connection.id,
            gmailMessageId: id,
          },
        },
        select: { id: true },
      });
      if (existed) {
        duplicate++;
        continue;
      }
      const full = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      await persistMessage(userId, connection.id, full.data);
      imported++;
    }
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return { imported, duplicate, hasMore: false, recovered: false };
  });
}

async function recoverySync(
  userId: string,
  connection: Awaited<ReturnType<typeof connectionFor>>,
): Promise<SyncResult> {
  const gmail = await gmailFor(connection);
  const listed = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    maxResults: HISTORY_MESSAGE_LIMIT,
  });
  const ids = uniqueMessageIds(
    (listed.data.messages || []).map((item) => item.id || ""),
  );
  let imported = 0,
    duplicate = 0;
  for (const id of ids) {
    const existed = await prisma.storedEmail.findUnique({
      where: {
        gmailConnectionId_gmailMessageId: {
          gmailConnectionId: connection.id,
          gmailMessageId: id,
        },
      },
      select: { id: true },
    });
    if (existed) {
      duplicate++;
      continue;
    }
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    await persistMessage(userId, connection.id, full.data);
    imported++;
  }
  const profile = await gmail.users.getProfile({ userId: "me" });
  await prisma.gmailConnection.update({
    where: { id: connection.id },
    data: {
      historyId: profile.data.historyId || connection.historyId,
      pendingHistoryId: null,
      pendingMessageIds: [] as Prisma.InputJsonValue,
      continuationPageToken: null,
      lastSyncAt: new Date(),
      lastErrorCode: "HISTORY_RECOVERED",
      lastErrorMessage: `The Gmail history cursor expired. MailShield checked the latest ${HISTORY_MESSAGE_LIMIT} inbox messages and re-established the baseline.`,
    },
  });
  return { imported, duplicate, hasMore: false, recovered: true };
}

export async function syncNewMail(userId: string): Promise<SyncResult> {
  return locked(userId, async (connection) => {
    if (!connection.historyId) throw new Error("SYNC_BASELINE_MISSING");
    const gmail = await gmailFor(connection);
    let ids = Array.isArray(connection.pendingMessageIds)
      ? connection.pendingMessageIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [];
    let pageToken = connection.continuationPageToken;
    let pendingHistoryId = connection.pendingHistoryId;
    if (!ids.length) {
      let response;
      try {
        response = await gmail.users.history.list({
          userId: "me",
          startHistoryId: connection.historyId,
          pageToken: pageToken || undefined,
          labelId: "INBOX",
          historyTypes: ["messageAdded"],
          maxResults: 100,
        });
      } catch (error) {
        if (errorStatus(error) === 404) return recoverySync(userId, connection);
        throw error;
      }
      ids = uniqueMessageIds(
        (response.data.history || []).flatMap((entry) =>
          (entry.messagesAdded || []).map((item) => item.message?.id || ""),
        ),
      );
      pageToken = response.data.nextPageToken || null;
      pendingHistoryId = response.data.historyId || pendingHistoryId;
    }
    const batch = ids.slice(0, HISTORY_MESSAGE_LIMIT);
    const remaining = ids.slice(HISTORY_MESSAGE_LIMIT);
    let imported = 0,
      duplicate = 0;
    for (const id of batch) {
      const existed = await prisma.storedEmail.findUnique({
        where: {
          gmailConnectionId_gmailMessageId: {
            gmailConnectionId: connection.id,
            gmailMessageId: id,
          },
        },
        select: { id: true },
      });
      if (existed) {
        duplicate++;
        continue;
      }
      const full = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      if (!(full.data.labelIds || []).includes("INBOX")) continue;
      await persistMessage(userId, connection.id, full.data);
      imported++;
    }
    const hasMore = remaining.length > 0 || Boolean(pageToken);
    const data = hasMore
      ? {
          pendingMessageIds: remaining as Prisma.InputJsonValue,
          continuationPageToken: pageToken,
          pendingHistoryId,
          lastSyncAt: new Date(),
          lastErrorCode: "SYNC_PARTIAL",
          lastErrorMessage:
            "More Gmail history remains. Choose Continue sync to process the next bounded batch.",
        }
      : {
          historyId: pendingHistoryId || connection.historyId,
          pendingMessageIds: [] as Prisma.InputJsonValue,
          continuationPageToken: null,
          pendingHistoryId: null,
          lastSyncAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        };
    await prisma.gmailConnection.update({ where: { id: connection.id }, data });
    return { imported, duplicate, hasMore, recovered: false };
  });
}

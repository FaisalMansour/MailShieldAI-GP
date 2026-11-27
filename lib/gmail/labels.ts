import "server-only";
import { prisma } from "../db";
import { gmailFor } from "./client";
import {
  desiredLabel,
  hasModifyScope,
  labelChanges,
  resolveMailShieldLabels,
} from "./monitor-core";

export async function ensureLabels(connectionId: string) {
  const connection = await prisma.gmailConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  if (!hasModifyScope(connection.grantedScopes))
    throw new Error("LABEL_PERMISSION_REQUIRED");
  const gmail = await gmailFor(connection);
  const { mediumLabelId, highLabelId } = await resolveMailShieldLabels(
    async () =>
      (await gmail.users.labels.list({ userId: "me" })).data.labels || [],
    async (name) => {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      if (!created.data.id) throw new Error("LABEL_CREATE_FAILED");
      return created.data.id;
    },
  );
  await prisma.gmailConnection.update({
    where: { id: connectionId },
    data: { mediumLabelId, highLabelId },
  });
  return { gmail, mediumLabelId, highLabelId };
}

export async function syncEmailLabel(userId: string, emailId: string) {
  const now = new Date();
  const acquired = await prisma.storedEmail.updateMany({
    where: {
      id: emailId,
      userId,
      OR: [{ gmailLabelLockUntil: null }, { gmailLabelLockUntil: { lt: now } }],
    },
    data: { gmailLabelLockUntil: new Date(now.getTime() + 2 * 60_000) },
  });
  if (!acquired.count) return;
  try {
    await syncEmailLabelLocked(userId, emailId);
  } finally {
    await prisma.storedEmail.updateMany({
      where: { id: emailId, userId },
      data: { gmailLabelLockUntil: null },
    });
  }
}

async function syncEmailLabelLocked(userId: string, emailId: string) {
  const email = await prisma.storedEmail.findFirst({
    where: {
      id: emailId,
      userId,
      gmailConnectionId: { not: null },
      gmailMessageId: { not: null },
    },
    include: {
      reports: {
        orderBy: { version: "desc" },
        take: 1,
        include: { corrections: { where: { revertedAt: null }, take: 1 } },
      },
      gmailConnection: true,
    },
  });
  if (!email?.gmailConnection || !email.gmailMessageId || !email.reports[0])
    return;
  const connection = email.gmailConnection;
  if (
    connection.status !== "CONNECTED" ||
    !hasModifyScope(connection.grantedScopes)
  ) {
    await prisma.storedEmail.update({
      where: { id: email.id },
      data: { gmailLabelStatus: "PERMISSION_REQUIRED" },
    });
    return;
  }
  try {
    const { gmail, mediumLabelId, highLabelId } = await ensureLabels(
      connection.id,
    );
    const desired = desiredLabel(
      email.reports[0].severity,
      email.reports[0].corrections.length > 0,
    );
    const labelId =
      desired === "MEDIUM"
        ? mediumLabelId
        : desired === "HIGH"
          ? highLabelId
          : null;
    const current = await gmail.users.messages.get({
      userId: "me",
      id: email.gmailMessageId,
      format: "minimal",
    });
    const changes = labelChanges(
      current.data.labelIds || [],
      mediumLabelId,
      highLabelId,
      labelId,
    );
    if (changes.addLabelIds.length || changes.removeLabelIds.length)
      await gmail.users.messages.modify({
        userId: "me",
        id: email.gmailMessageId,
        requestBody: changes,
      });
    const now = new Date();
    await prisma.storedEmail.update({
      where: { id: email.id },
      data: {
        gmailLabelId: labelId,
        gmailLabelStatus: labelId ? "APPLIED" : "NOT_REQUIRED",
        gmailLabelError: null,
        gmailLabelAt: now,
        gmailLabelRetries: 0,
      },
    });
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: { lastLabelAt: now },
    });
  } catch (error) {
    const value = error as { code?: number; response?: { status?: number } };
    const status = value.code || value.response?.status;
    const code =
      status === 401
        ? "GMAIL_AUTH"
        : status === 403
          ? "GMAIL_PERMISSION"
          : status === 429
            ? "GMAIL_RATE_LIMIT"
            : "LABEL_FAILED";
    if (code === "GMAIL_AUTH")
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: {
          status: "RECONNECT_REQUIRED",
          monitoringEnabled: false,
          watchExpiresAt: null,
          monitoringError: code,
        },
      });
    await prisma.storedEmail.update({
      where: { id: email.id },
      data: {
        gmailLabelStatus: "FAILED",
        gmailLabelError: code,
        gmailLabelRetries: { increment: 1 },
      },
    });
  }
}

export async function syncPendingLabels(userId: string) {
  const items = await prisma.storedEmail.findMany({
    where: {
      userId,
      gmailMessageId: { not: null },
      gmailLabelRetries: { lt: 4 },
      reports: { some: {} },
      OR: [
        {
          gmailLabelStatus: {
            in: ["PENDING", "FAILED", "PERMISSION_REQUIRED"],
          },
        },
        { gmailLabelAt: null },
      ],
    },
    select: { id: true },
    take: 20,
    orderBy: { importedAt: "asc" },
  });
  for (const item of items) await syncEmailLabel(userId, item.id);
}

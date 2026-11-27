import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { processMailbox, renewWatch } from "@/lib/gmail/monitor";
import { recoveryDue, watchNeedsRenewal } from "@/lib/gmail/monitor-core";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(header: string | null) {
  const secret = process.env.MONITORING_CRON_SECRET;
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer "))
    return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization")))
    return new Response(null, { status: 401 });
  const now = new Date();
  const interval = Math.max(
    5,
    Math.min(1440, Number(process.env.MONITORING_RECOVERY_MINUTES || 15) || 15),
  );
  const connections = await prisma.gmailConnection.findMany({
    where: {
      monitoringEnabled: true,
      status: "CONNECTED",
      OR: [{ retryAfter: null }, { retryAfter: { lte: now } }],
    },
    select: {
      userId: true,
      watchExpiresAt: true,
      lastAutomaticSyncAt: true,
      continuationPageToken: true,
      pendingMessageIds: true,
      retryCount: true,
    },
    take: 20,
  });
  let renewed = 0,
    synced = 0,
    failed = 0;
  for (const connection of connections) {
    if (connection.retryCount >= 5) continue;
    if (watchNeedsRenewal(connection.watchExpiresAt, now)) {
      try {
        await renewWatch(connection.userId);
        renewed++;
      } catch {
        failed++;
      }
    }
    if (
      recoveryDue(
        connection.lastAutomaticSyncAt,
        interval,
        Boolean(connection.continuationPageToken) ||
          (Array.isArray(connection.pendingMessageIds) &&
            connection.pendingMessageIds.length > 0),
        now,
      )
    ) {
      try {
        await processMailbox(connection.userId, "RECOVERY");
        synced++;
      } catch {
        failed++;
      }
    }
  }
  return Response.json({
    checked: connections.length,
    renewed,
    synced,
    failed,
  });
}

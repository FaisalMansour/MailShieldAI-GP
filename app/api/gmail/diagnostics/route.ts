import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user.id) return new Response(null, { status: 401 });
  const connection = await prisma.gmailConnection.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!connection) return Response.json({ runs: [], notifications: [] });
  const [runs, notifications] = await Promise.all([
    prisma.gmailSyncRun.findMany({
      where: { connectionId: connection.id },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        source: true,
        status: true,
        imported: true,
        duplicate: true,
        errorCode: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
    prisma.gmailPushNotification.findMany({
      where: { connectionId: connection.id },
      orderBy: { receivedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        attempts: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
      },
    }),
  ]);
  return Response.json({ runs, notifications });
}

import { prisma } from "@/lib/db";
import { revokeConnectionToken } from "@/lib/gmail/client";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";
import { disconnectedCredentialState } from "@/lib/data-controls";
import { disableMonitoring } from "@/lib/gmail/monitor";
export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const connection = await prisma.gmailConnection.findUnique({
      where: { userId: user.id },
    });
    if (connection) {
      if (connection.monitoringEnabled) await disableMonitoring(user.id);
      await revokeConnectionToken(connection);
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: disconnectedCredentialState(),
      });
    }
    return home(request, "gmail-disconnected");
  } catch (error) {
    return operationError(request, error);
  }
}

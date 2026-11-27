import { prisma } from "@/lib/db";
import { validDeletionConfirmation } from "@/lib/data-controls";
import { revokeConnectionToken } from "@/lib/gmail/client";
import { disableMonitoring } from "@/lib/gmail/monitor";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";
export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const form = await request.formData();
    if (!validDeletionConfirmation(form.get("confirmation"), true))
      return home(request, "account-delete-confirmation-required");
    const connection = await prisma.gmailConnection.findUnique({
      where: { userId: user.id },
    });
    if (connection) {
      if (connection.monitoringEnabled) await disableMonitoring(user.id);
      await revokeConnectionToken(connection);
    }
    await prisma.user.delete({ where: { id: user.id } });
    return home(request, "account-deleted");
  } catch (error) {
    return operationError(request, error);
  }
}

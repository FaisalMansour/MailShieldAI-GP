import { prisma } from "@/lib/db";
import { validDeletionConfirmation } from "@/lib/data-controls";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";
export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const form = await request.formData();
    if (!validDeletionConfirmation(form.get("confirmation")))
      return home(request, "delete-confirmation-required");
    const deleted = await prisma.storedEmail.deleteMany({
      where: { userId: user.id },
    });
    return home(request, `emails-deleted-${deleted.count}`);
  } catch (error) {
    return operationError(request, error);
  }
}

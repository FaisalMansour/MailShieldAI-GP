import { prisma } from "@/lib/db";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUserForMutation(request);
    const { id } = await context.params;
    const deleted = await prisma.storedEmail.deleteMany({
      where: { id, userId: user.id, source: "EML_UPLOAD" },
    });
    if (!deleted.count) throw new Error("EMAIL_NOT_FOUND");
    return home(request, "eml-deleted");
  } catch (error) {
    return operationError(request, error);
  }
}

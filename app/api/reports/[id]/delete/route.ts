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
    const report = await prisma.analysisReport.findFirst({
      where: { id, userId: user.id },
      select: { id: true, storedEmailId: true },
    });
    if (!report) throw new Error("EMAIL_NOT_FOUND");
    await prisma.$transaction(async (tx) => {
      await tx.analysisReport.delete({ where: { id: report.id } });
      const previous = await tx.analysisReport.findFirst({
        where: { storedEmailId: report.storedEmailId },
        orderBy: { version: "desc" },
        select: { humanReviewRecommended: true },
      });
      await tx.storedEmail.update({
        where: { id: report.storedEmailId },
        data: {
          processingStatus: previous
            ? previous.humanReviewRecommended
              ? "NEEDS_REVIEW"
              : "COMPLETED"
            : "NOT_ANALYZED",
        },
      });
    });
    return home(request, "report-deleted");
  } catch (error) {
    return operationError(request, error);
  }
}

import { prisma } from "@/lib/db";
import { operationError, requireUserForMutation } from "@/lib/route-helpers";
import { appOrigin } from "@/lib/server-env";
import { NextResponse } from "next/server";

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
    const active = await prisma.userCorrection.findFirst({
      where: { reportId: id, userId: user.id, revertedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      await prisma.userCorrection.update({
        where: { id: active.id },
        data: { revertedAt: new Date() },
      });
      return NextResponse.redirect(
        new URL(
          `/emails/${report.storedEmailId}?notice=correction-undone`,
          appOrigin(),
        ),
        303,
      );
    }
    await prisma.userCorrection.create({
      data: {
        reportId: id,
        userId: user.id,
        markedNotThreat: true,
        note: "User marked this report as not a threat. The original analysis remains unchanged.",
      },
    });
    return NextResponse.redirect(
      new URL(
        `/emails/${report.storedEmailId}?notice=correction-saved`,
        appOrigin(),
      ),
      303,
    );
  } catch (error) {
    return operationError(request, error);
  }
}

import { prisma } from "@/lib/db";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const form = await request.formData();
    const enabled = form.get("analysisEnabled") === "on";
    const requestedLimit = Number(form.get("dailyAnalysisLimit"));
    const dailyAnalysisLimit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(25, requestedLimit))
      : 10;
    await prisma.user.update({
      where: { id: user.id },
      data: { analysisEnabled: enabled, dailyAnalysisLimit },
    });
    return home(request, enabled ? "analysis-enabled" : "analysis-disabled");
  } catch (error) {
    return operationError(request, error);
  }
}

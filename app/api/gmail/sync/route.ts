import { syncNewMail } from "@/lib/gmail/sync";
import { scheduleAutomaticAnalysis } from "@/lib/analysis/automatic";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const result = await syncNewMail(user.id);
    if (result.imported) scheduleAutomaticAnalysis(user.id);
    return home(
      request,
      `${result.hasMore ? "sync-partial" : "sync-complete"}-${result.imported}-${result.duplicate}${result.recovered ? "-recovered" : ""}`,
    );
  } catch (error) {
    return operationError(request, error);
  }
}

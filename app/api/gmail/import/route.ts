import { importLatest20 } from "@/lib/gmail/sync";
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
    const result = await importLatest20(user.id);
    if (result.imported) scheduleAutomaticAnalysis(user.id);
    return home(
      request,
      `imported-${result.imported}-duplicates-${result.duplicate}`,
    );
  } catch (error) {
    return operationError(request, error);
  }
}

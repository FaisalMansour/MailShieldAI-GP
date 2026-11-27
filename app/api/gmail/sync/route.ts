import { processMailbox } from "@/lib/gmail/monitor";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const result = await processMailbox(user.id, "MANUAL");
    return home(
      request,
      `${result.hasMore ? "sync-partial" : "sync-complete"}-${result.imported}-${result.duplicate}${result.recovered ? "-recovered" : ""}`,
    );
  } catch (error) {
    return operationError(request, error);
  }
}

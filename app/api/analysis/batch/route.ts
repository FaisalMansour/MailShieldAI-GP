import { analyzeUnprocessedBatch } from "@/lib/analysis/analyze";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const result = await analyzeUnprocessedBatch(user.id);
    return home(request, `analysis-batch-${result.completed}-${result.failed}`);
  } catch (error) {
    return operationError(request, error);
  }
}

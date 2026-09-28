import { importLatest20 } from "@/lib/gmail/sync";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";
export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const result = await importLatest20(user.id);
    return home(
      request,
      `imported-${result.imported}-duplicates-${result.duplicate}`,
    );
  } catch (error) {
    return operationError(request, error);
  }
}

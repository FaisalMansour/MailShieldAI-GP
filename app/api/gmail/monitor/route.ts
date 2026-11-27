import { disableMonitoring, renewWatch } from "@/lib/gmail/monitor";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const form = await request.formData();
    const action = form.get("action");
    if (action === "disable") {
      await disableMonitoring(user.id);
      return home(request, "monitoring-disabled");
    }
    if (action === "enable" || action === "renew") {
      await renewWatch(user.id, action === "enable");
      return home(
        request,
        action === "enable" ? "monitoring-enabled" : "monitoring-renewed",
      );
    }
    throw new Error("INVALID_MONITORING_ACTION");
  } catch (error) {
    return operationError(request, error);
  }
}

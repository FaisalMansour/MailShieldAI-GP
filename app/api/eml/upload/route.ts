import { storeEmlUpload } from "@/lib/eml";
import {
  home,
  operationError,
  requireUserForMutation,
} from "@/lib/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const form = await request.formData();
    const file = form.get("eml");
    if (!(file instanceof File)) throw new Error("INVALID_EML_FILE");
    await storeEmlUpload(user.id, file);
    return home(request, "eml-uploaded");
  } catch (error) {
    return operationError(request, error);
  }
}

import { analyzeStoredEmail } from "@/lib/analysis/analyze";
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
    const form = await request.formData();
    await analyzeStoredEmail(user.id, id, {
      reanalyze: form.get("mode") === "reanalyze",
    });
    return NextResponse.redirect(
      new URL(`/emails/${id}?notice=analysis-complete`, appOrigin()),
      303,
    );
  } catch (error) {
    return operationError(request, error);
  }
}

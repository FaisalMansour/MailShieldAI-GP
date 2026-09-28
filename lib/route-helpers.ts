import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSameOrigin } from "./authorization";
import { appOrigin } from "./server-env";

export async function requireUserForMutation(request: Request) {
  requireSameOrigin(request, appOrigin());
  const session = await auth();
  if (!session?.user.id) throw new Error("AUTH_REQUIRED");
  return session.user;
}
export function home(request: Request, notice: string) {
  return NextResponse.redirect(
    new URL(`/?notice=${encodeURIComponent(notice)}`, appOrigin()),
    303,
  );
}
export function operationError(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const allowed = new Set([
    "AUTH_REQUIRED",
    "INVALID_ORIGIN",
    "GMAIL_NOT_CONNECTED",
    "SYNC_ALREADY_RUNNING",
    "SYNC_BASELINE_MISSING",
    "AI_NOT_CONFIGURED",
    "ANALYSIS_CONSENT_REQUIRED",
    "DAILY_ANALYSIS_LIMIT_REACHED",
    "ALREADY_ANALYZED",
    "ANALYSIS_ALREADY_RUNNING",
    "EMAIL_NOT_FOUND",
    "AI_ANALYSIS_FAILED",
    "INVALID_EML_FILE",
    "EML_TOO_LARGE",
    "DUPLICATE_EML",
  ]);
  return home(
    request,
    allowed.has(code)
      ? code.toLowerCase().replaceAll("_", "-")
      : "operation-failed",
  );
}

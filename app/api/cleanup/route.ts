import { cleanupExpiredEmails } from "@/lib/cleanup";
import { requireEnv } from "@/lib/server-env";
import { safeEqual } from "@/lib/token-crypto";
export async function POST(request: Request) {
  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  let expected = "";
  try {
    expected = requireEnv("CLEANUP_SECRET");
  } catch {
    return Response.json(
      { error: "Cleanup is not configured." },
      { status: 503 },
    );
  }
  if (!safeEqual(bearer, expected))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await cleanupExpiredEmails();
  return Response.json({ deleted: result.count });
}

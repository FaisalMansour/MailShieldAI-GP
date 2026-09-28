import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { beginOAuth, OAUTH_COOKIE } from "@/lib/gmail/oauth";
import { appOrigin } from "@/lib/server-env";

export async function GET() {
  const session = await auth();
  if (!session?.user.id)
    return NextResponse.redirect(
      new URL("/?notice=sign-in-required", appOrigin()),
    );
  const { url, cookie } = beginOAuth(session.user.id);
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });
  return response;
}

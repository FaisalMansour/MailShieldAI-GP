import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { assertMailboxMatches, assertOwner } from "@/lib/authorization";
import { encryptSecret } from "@/lib/token-crypto";
import { oauthClient, OAUTH_COOKIE, readOAuthCookie } from "@/lib/gmail/oauth";
import { appOrigin } from "@/lib/server-env";

function done(notice: string) {
  const response = NextResponse.redirect(
    new URL(`/?notice=${notice}`, appOrigin()),
  );
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) return done("sign-in-required");
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return done("gmail-consent-denied");
  if (!state || !code) return done("gmail-oauth-invalid");
  try {
    const pending = readOAuthCookie(
      (await cookies()).get(OAUTH_COOKIE)?.value,
      state,
    );
    assertOwner(pending.userId, session.user.id);
    const client = oauthClient();
    const { tokens } = await client.getToken({
      code,
      codeVerifier: pending.verifier,
    });
    client.setCredentials(tokens);
    const { google } = await import("googleapis");
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const mailbox = profile.data.emailAddress;
    if (!mailbox) throw new Error("MAILBOX_UNKNOWN");
    assertMailboxMatches(session.user.email, mailbox);
    const existing = await prisma.gmailConnection.findUnique({
      where: { userId: session.user.id },
    });
    const refresh = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : existing?.refreshTokenEncrypted || null;
    const status = refresh ? "CONNECTED" : "RECONNECT_REQUIRED";
    await prisma.gmailConnection.upsert({
      where: { userId: session.user.id },
      update: {
        mailboxEmail: mailbox,
        accessTokenEncrypted: tokens.access_token
          ? encryptSecret(tokens.access_token)
          : existing?.accessTokenEncrypted,
        refreshTokenEncrypted: refresh,
        tokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        status,
        historyId: profile.data.historyId || existing?.historyId,
        continuationPageToken: null,
        pendingHistoryId: null,
        pendingMessageIds: [],
        lastErrorCode: refresh ? null : "REFRESH_TOKEN_MISSING",
        lastErrorMessage: refresh
          ? null
          : "Google did not return offline access. Reconnect Gmail and approve access again.",
      },
      create: {
        userId: session.user.id,
        mailboxEmail: mailbox,
        accessTokenEncrypted: tokens.access_token
          ? encryptSecret(tokens.access_token)
          : null,
        refreshTokenEncrypted: refresh,
        tokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        status,
        historyId: profile.data.historyId || null,
        lastErrorCode: refresh ? null : "REFRESH_TOKEN_MISSING",
        lastErrorMessage: refresh
          ? null
          : "Google did not return offline access. Reconnect Gmail and approve access again.",
      },
    });
    return done(refresh ? "gmail-connected" : "gmail-reconnect-required");
  } catch (error) {
    return done(
      error instanceof Error && error.message === "MAILBOX_MISMATCH"
        ? "mailbox-mismatch"
        : "gmail-oauth-failed",
    );
  }
}

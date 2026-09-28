import "server-only";
import { google } from "googleapis";
import type { GmailConnection } from "../generated/prisma/client";
import { prisma } from "../db";
import { decryptSecret, encryptSecret } from "../token-crypto";
import { oauthClient } from "./oauth";

export async function gmailFor(connection: GmailConnection) {
  if (!connection.accessTokenEncrypted) throw new Error("GMAIL_NOT_CONNECTED");
  const client = oauthClient();
  client.setCredentials({
    access_token: decryptSecret(connection.accessTokenEncrypted),
    refresh_token: connection.refreshTokenEncrypted
      ? decryptSecret(connection.refreshTokenEncrypted)
      : undefined,
    expiry_date: connection.tokenExpiresAt?.getTime(),
  });
  client.on("tokens", (tokens) => {
    void prisma.gmailConnection
      .update({
        where: { id: connection.id },
        data: {
          accessTokenEncrypted: tokens.access_token
            ? encryptSecret(tokens.access_token)
            : undefined,
          refreshTokenEncrypted: tokens.refresh_token
            ? encryptSecret(tokens.refresh_token)
            : undefined,
          tokenExpiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : undefined,
          status: "CONNECTED",
        },
      })
      .catch(() => {});
  });
  return google.gmail({ version: "v1", auth: client });
}
export async function revokeConnectionToken(connection: GmailConnection) {
  try {
    const encrypted =
      connection.refreshTokenEncrypted || connection.accessTokenEncrypted;
    if (!encrypted) return;
    const token = decryptSecret(encrypted);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* Local credential deletion still proceeds if provider revocation is unavailable. */
  }
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import { appOrigin, requireEnv } from "../server-env";
import { decryptSecret, encryptSecret, safeEqual } from "../token-crypto";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_MODIFY_SCOPE =
  "https://www.googleapis.com/auth/gmail.modify";
export const OAUTH_COOKIE = "mailshield_gmail_oauth";
export interface OAuthCookie {
  userId: string;
  state: string;
  verifier: string;
  expiresAt: number;
  upgrade?: boolean;
}
export function oauthClient() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    `${appOrigin()}/api/gmail/callback`,
  );
}
export function beginOAuth(userId: string, upgrade = false) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const payload: OAuthCookie = {
    userId,
    state,
    verifier,
    expiresAt: Date.now() + 10 * 60_000,
    upgrade,
  };
  const url = oauthClient().generateAuthUrl({
    access_type: "offline",
    scope: [upgrade ? GMAIL_MODIFY_SCOPE : GMAIL_SCOPE],
    include_granted_scopes: true,
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { url, cookie: encryptSecret(JSON.stringify(payload)) };
}
export function readOAuthCookie(value: string | undefined, state: string) {
  if (!value) throw new Error("OAUTH_STATE_MISSING");
  const payload = JSON.parse(decryptSecret(value)) as OAuthCookie;
  if (payload.expiresAt < Date.now() || !safeEqual(payload.state, state))
    throw new Error("OAUTH_STATE_INVALID");
  return payload;
}

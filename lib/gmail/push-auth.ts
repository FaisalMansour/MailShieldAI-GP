import { OAuth2Client } from "google-auth-library";

const verifier = new OAuth2Client();
export async function verifyPushAuth(
  authorization: string | null,
  audience: string,
  serviceAccount: string,
  verify = verifier.verifyIdToken.bind(verifier),
) {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization || "");
  if (!match || !audience || !serviceAccount)
    throw new Error("UNAUTHORIZED_PUSH");
  try {
    const ticket = await verify({ idToken: match[1], audience });
    const payload = ticket.getPayload();
    if (
      !payload ||
      payload.email !== serviceAccount ||
      payload.email_verified !== true ||
      !["accounts.google.com", "https://accounts.google.com"].includes(
        payload.iss,
      )
    )
      throw new Error("UNAUTHORIZED_PUSH");
  } catch {
    throw new Error("UNAUTHORIZED_PUSH");
  }
}

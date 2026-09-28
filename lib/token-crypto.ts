import "server-only";
import { requireEnv } from "./server-env";
import { constantTimeEqual, openWithKey, sealWithKey } from "./crypto-core";

function key() {
  const decoded = Buffer.from(requireEnv("TOKEN_ENCRYPTION_KEY"), "base64");
  if (decoded.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return decoded;
}
export function encryptSecret(value: string) {
  return sealWithKey(value, key());
}
export function decryptSecret(value: string) {
  return openWithKey(value, key());
}
export function safeEqual(a: string, b: string) {
  return constantTimeEqual(a, b);
}

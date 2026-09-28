import "server-only";

const required = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APP_URL",
  "AUTH_URL",
  "TOKEN_ENCRYPTION_KEY",
] as const;
export function missingConfiguration() {
  return required.filter((key) => !process.env[key]);
}
export function isConfigured() {
  return missingConfiguration().length === 0;
}
export function requireEnv(name: (typeof required)[number] | "CLEANUP_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}
export function appOrigin() {
  return new URL(requireEnv("APP_URL")).origin;
}

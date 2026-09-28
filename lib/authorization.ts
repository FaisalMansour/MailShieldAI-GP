export class OwnershipError extends Error {
  constructor() {
    super("Resource not found.");
    this.name = "OwnershipError";
  }
}
export function assertOwner(resourceUserId: string, currentUserId: string) {
  if (resourceUserId !== currentUserId) throw new OwnershipError();
}
export function assertMailboxMatches(
  signedInEmail: string | null | undefined,
  mailboxEmail: string,
) {
  if (
    !signedInEmail ||
    signedInEmail.toLowerCase() !== mailboxEmail.toLowerCase()
  )
    throw new Error("MAILBOX_MISMATCH");
}
export function requireSameOrigin(
  request: Request,
  expected = new URL(request.url).origin,
) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected) throw new Error("INVALID_ORIGIN");
}

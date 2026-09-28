import "server-only";
import { prisma } from "./db";
export async function cleanupExpiredEmails(now = new Date()) {
  return prisma.storedEmail.deleteMany({ where: { expiresAt: { lte: now } } });
}

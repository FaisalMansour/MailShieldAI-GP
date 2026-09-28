import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const prismaGlobal = globalThis as unknown as { prisma?: PrismaClient };
const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://invalid:invalid@127.0.0.1:5432/invalid",
  connectionTimeoutMillis: 5000,
});
export const prisma =
  prismaGlobal.prisma ??
  new PrismaClient({
    adapter,
  });
if (process.env.NODE_ENV !== "production") prismaGlobal.prisma = prisma;

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

const buildSafeDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://mailshield:mailshield@127.0.0.1:5432/mailshield";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: buildSafeDatabaseUrl },
});

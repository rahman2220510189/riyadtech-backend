import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const DATABASE_URL = (globalThis as any)?.process?.env?.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
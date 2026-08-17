import "dotenv/config";
import { z } from "zod";

/**
 * Configuration is validated once, at boot.
 *
 * A server that starts with a missing DATABASE_URL and fails on the first
 * request is worse than one that refuses to start at all — the second tells
 * you what is wrong while you are still looking at the terminal.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SESSION_SECRET: z
    .string()
    .min(24, "SESSION_SECRET must be at least 24 characters"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  SITE_URL: z.string().default(""),
  REVALIDATE_SECRET: z.string().default(""),
  /* Optional: uploads are simply disabled until this is set. */
  CLOUDINARY_URL: z.string().default(""),
  /* Optional: notifications are simply skipped until these are set. */
  RESEND_API_KEY: z.string().default(""),
  NOTIFY_EMAIL: z.string().default(""),
  FROM_EMAIL: z.string().default("Riyad Tech <onboarding@resend.dev>"),
  ADMIN_URL: z.string().default("http://localhost:5173"),
  /* The assistant. Additional accounts go in GROQ_API_KEY_1, _2, _3 and are
     picked up without a code change. Absent, the chat simply reports itself
     unavailable and the site carries on. */
  GROQ_API_KEY: z.string().default(""),
  /* Groq retires models on a few months' notice — llama-3.3-70b-versatile was
     deprecated in June 2026 and stops answering. Keeping the name in the
     environment means the next retirement is a dashboard edit, not a deploy. */
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("\nInvalid environment:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill it in.\n");
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
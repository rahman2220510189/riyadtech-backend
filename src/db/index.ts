import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * One pool for the process.
 *
 * The pool is deliberately small. Neon's free tier sleeps when idle and this
 * API serves a handful of admin sessions plus a build-time content fetch —
 * a large pool would only hold connections open against a database that
 * charges nothing precisely because it is allowed to nap.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 15_000,
  ssl: env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export { schema };
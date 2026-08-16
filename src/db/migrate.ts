import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../env.js";

/**
 * Applies any migration that has not run yet, then exits.
 *
 * This replaces `db:push` everywhere that matters. Push compares the schema
 * file to the live database and changes whatever it finds different — which is
 * fine on a laptop and dangerous in production, because "different" includes
 * tables it has never heard of. It has already tried to delete the session
 * table once, and would have signed everyone out to do it.
 *
 * Migrations are the opposite: an ordered list of SQL files, each applied once
 * and recorded. What changed is visible in a diff, and nothing happens that
 * somebody did not write down.
 *
 * Deploy hook:  npm run db:migrate && npm start
 */
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  ssl: env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

const db = drizzle(pool);

try {
  console.info("Applying migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.info("Up to date.");
} catch (error) {
  console.error("\nMigration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
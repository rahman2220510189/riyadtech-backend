import argon2 from "argon2";
import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, pool } from "../db/index.js";
import { users } from "../db/schema.js";
import { env } from "../env.js";

/**
 * Session auth for the admin panel.
 *
 * Sessions live in Postgres rather than in memory, so a redeploy does not log
 * everyone out and a sleeping free instance wakes up still knowing who you
 * are. connect-pg-simple creates its own table on first run — one less
 * migration to remember.
 *
 * There is no signup route and there never will be. Accounts are created by
 * the seed script, from the terminal, by someone who already has the database
 * password.
 */

declare module "express-session" {
  interface SessionData {
    userId?: number;
    userName?: string;
  }
}

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  name: "riyad.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.isProd,
    /* "lax" means the browser will not send this cookie on a cross-site POST,
       which is what stops another site from submitting our admin forms. It is
       the CSRF defence here, and it is a real one. */
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

/**
 * The admin app is a separate origin, so this answers 401 rather than
 * redirecting — a fetch cannot follow a redirect to a login page usefully.
 * The app watches for 401 and shows the sign-in screen itself.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) return next();
  res.status(401).json({ error: "Not signed in" });
}

export async function verifyLogin(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  /* Hash against a dummy when the user is missing, so a wrong email and a
     wrong password take the same time to fail. Otherwise the response time
     tells an attacker which addresses exist. */
  if (!user) {
    await argon2.verify(
      "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$3+Xh1z1kZ8Qb5Yw5xQ7Z1Q",
      password,
    ).catch(() => false);
    return null;
  }

  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) return null;

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return user;
}
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./env.js";
import { pool } from "./db/index.js";
import { accountRouter } from "./routes/account.js";
import { chatRouter } from "./routes/chat.js";
import { contentRouter } from "./routes/content.js";
import { leadsRouter } from "./routes/leads.js";
import { productsRouter } from "./routes/products.js";
import { reviewsRouter } from "./routes/reviews.js";
import { sessionMiddleware } from "./lib/auth.js";
import { adminRouter } from "./routes/admin/index.js";
import { notFound, onError } from "./middleware/errors.js";

const app = express();

/* Render, and most hosts, sit behind a proxy. Without this the rate limiter
   sees one IP for the whole internet and req.ip is useless. */
app.set("trust proxy", 1);

/* This process serves JSON only — no HTML, no assets — so the default policy
   needs no holes cut in it. */
app.use(helmet());
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

/**
 * Only the browser forms need CORS — the site fetches content server-side at
 * build time, where CORS does not apply. The allowlist stays short on purpose.
 */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);

/** Cheap enough for an uptime pinger to keep a sleeping free instance awake. */
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ ok: false, database: "unreachable" });
  }
});

app.use(sessionMiddleware);
app.use("/api/v1/admin", adminRouter);

app.use("/api/v1", contentRouter);
app.use("/api/v1", accountRouter);
app.use("/api/v1", chatRouter);
app.use("/api/v1", leadsRouter);
app.use("/api/v1", productsRouter);
app.use("/api/v1", reviewsRouter);

app.use(notFound);
app.use(onError);

const server = app.listen(env.PORT, () => {
  console.info(`riyad-api listening on http://localhost:${env.PORT}`);
  console.info(`  content   GET  /api/v1/content`);
  console.info(`  leads     POST /api/v1/leads`);
  console.info(`  reviews   POST /api/v1/reviews`);
  console.info(`  products  GET  /api/v1/products`);
  console.info(`  chat      POST /api/v1/chat`);
  console.info(`  account   POST /api/v1/account/login`);
  console.info(`  admin     POST /api/v1/admin/login`);
});

/* Finish in-flight requests and hand the database connections back before
   exiting, so a redeploy does not drop a lead mid-insert. */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.info(`\n${signal} — shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db/index.js";
import { reviews } from "../db/schema.js";
import { notify } from "../lib/email.js";
import { env } from "../env.js";

/**
 * POST /api/v1/reviews
 *
 * Anyone can submit; nothing appears on the site until it is approved in the
 * admin panel. That is the whole design. An open review form that publishes
 * immediately is a spam target, and a review section we write ourselves is
 * worse than having none.
 */
export const reviewsRouter = Router();

const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many submissions today." },
});

const reviewSchema = z.object({
  authorName: z.string().trim().min(1, "Your name is required").max(120),
  authorRole: z.string().trim().max(120).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  body: z
    .string()
    .trim()
    .min(20, "A sentence or two, so it is useful to the next reader")
    .max(2000),
  website: z.string().max(0).optional(),
});

reviewsRouter.post("/reviews", limiter, async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({
      error: "Some fields need attention",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  if (parsed.data.website) {
    res.status(201).json({ ok: true, status: "pending" });
    return;
  }

  const { authorName, authorRole, company, rating, body } = parsed.data;

  await db.insert(reviews).values({
    authorName,
    authorRole: authorRole || null,
    company: company || null,
    rating: rating ?? null,
    body,
    status: "pending",
    ip: req.ip ?? null,
  });

  notify({
    subject: `Review awaiting approval — ${authorName}`,
    rows: [
      ["Name", authorName],
      ["Role", authorRole || "—"],
      ["Company", company || "—"],
      ["Rating", rating ? String(rating) : "—"],
    ],
    body,
    action: `${env.ADMIN_URL}/reviews`,
  });

  res.status(201).json({ ok: true, status: "pending" });
});
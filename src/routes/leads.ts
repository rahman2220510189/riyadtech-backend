import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db/index.js";
import { leads } from "../db/schema.js";
import { notify, notifyCustomer } from "../lib/email.js";
import { env } from "../env.js";

/**
 * POST /api/v1/leads — the contact form.
 *
 * The fields are exactly the ones the form asks for and no more. Phone number,
 * company size, budget range and "how did you hear about us" all reduce the
 * number of people who finish the form, and none of them change what happens
 * on the call.
 */
export const leadsRouter = Router();

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many submissions. Try again later, or email us." },
});

const leadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("That does not look like an email").max(254),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more — one or two sentences is plenty")
    .max(4000),
  source: z.string().trim().max(80).optional(),
  /* Honeypot. Real people leave it empty; most bots fill everything in.
     Cheaper than a CAPTCHA and it costs the visitor nothing. */
  website: z.string().max(0).optional(),
});

leadsRouter.post("/leads", limiter, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({
      error: "Some fields need attention",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { name, email, company, message, source } = parsed.data;

  /* A filled honeypot gets the same response a real submission gets. Telling
     a bot it was caught only teaches whoever wrote it. */
  if (parsed.data.website) {
    res.status(201).json({ ok: true });
    return;
  }

  await db.insert(leads).values({
    name,
    email,
    company: company || null,
    message,
    source: source || "contact",
    ip: req.ip ?? null,
  });

  /* A short confirmation, sent to them rather than to us.
     Nobody enjoys wondering whether a form worked, and the alternative — a
     second submission an hour later — costs us both. */
  notifyCustomer({
    to: email,
    subject: "We have your message — Riyad Tech",
    heading: `Thank you, ${name.split(" ")[0]}`,
    body: "We have your message and will reply within one working day. If it is urgent, book a call and we will talk sooner.",
    action: { label: "Book a 15-minute call", url: `${env.SITE_URL || "https://riyadtech.xyz"}/contact` },
    footer: "You are receiving this because you wrote to us through riyadtech.xyz. No list, no newsletter.",
  });

  notify({
    subject: `New enquiry from ${name}`,
    rows: [
      ["Name", name],
      ["Email", email],
      ["Company", company || "—"],
      ["Page", source || "contact"],
    ],
    body: message,
    action: `${env.ADMIN_URL}/leads`,
  });

  res.status(201).json({ ok: true });
});
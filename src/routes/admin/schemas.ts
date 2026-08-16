import { z } from "zod";

/**
 * What the admin panel is allowed to write.
 *
 * These are the only gate between a form and the database, so they carry the
 * business rules too, not just the types — a price that must read as text, a
 * slug that must be URL-safe, a list that must not be empty.
 */

const stringList = z.array(z.string().trim().min(1)).max(12);

export const serviceSchema = z.object({
  indexLabel: z.string().trim().min(1).max(8),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1),
  uses: stringList.default([]),
  sort: z.number().int().default(0),
  published: z.boolean().default(true),
});

export const workSchema = z.object({
  title: z.string().trim().min(1).max(120),
  problem: z.string().trim().min(1),
  result: z.string().trim().min(1),
  stack: z.string().trim().min(1).max(160),
  /* Publishing a card whose link goes nowhere costs more trust than not
     having the card, so the link has to be a real URL before it can go live. */
  href: z.string().trim().min(1),
  tag: z.string().trim().max(40).default("Internal build"),
  coverImage: z.string().trim().url().max(500).nullish().or(z.literal("")),
  sort: z.number().int().default(0),
  published: z.boolean().default(false),
});

export const pricingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /* Text, not a number. "from €6,000" and "€400 / month" are prices, and a
     numeric column would force the formatting into the frontend. */
  price: z.string().trim().min(1).max(60),
  timeline: z.string().trim().min(1).max(60),
  featured: z.boolean().default(false),
  includes: stringList.default([]),
  sort: z.number().int().default(0),
  published: z.boolean().default(true),
});

export const teamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  line: z.string().trim().min(1),
  linkedin: z.string().trim().url().max(300).nullish().or(z.literal("")),
  photoUrl: z.string().trim().url().max(500).nullish().or(z.literal("")),
  sort: z.number().int().default(0),
  published: z.boolean().default(false),
});

export const faqSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  sort: z.number().int().default(0),
  published: z.boolean().default(true),
});

export const productSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Lower case letters, numbers and hyphens only",
    ),
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  category: z.string().trim().max(60).default("System"),
  price: z.string().trim().min(1).max(60),
  priceNote: z.string().trim().max(160).default(""),
  deliveryDays: z.number().int().min(1).max(120).default(5),
  stack: z.string().trim().max(200).default(""),
  demoUrl: z.string().trim().url().max(500).nullish().or(z.literal("")),
  includes: stringList.default([]),
  /* Optional in the type, deliberate in practice: naming the limits is what
     makes the rest of the list believable, and it prevents the argument on
     handover day. */
  notIncluded: stringList.default([]),
  coverImage: z.string().trim().url().max(500).nullish().or(z.literal("")),
  images: z
    .array(z.object({ url: z.string().url(), alt: z.string().max(200) }))
    .max(8)
    .default([]),
  featured: z.boolean().default(false),
  sort: z.number().int().default(0),
  published: z.boolean().default(false),
});

export const settingSchema = z.object({
  key: z.string().trim().min(1).max(64),
  value: z.string().max(2000),
  label: z.string().trim().max(120).default(""),
  hint: z.string().max(400).nullish(),
  sort: z.number().int().default(0),
});

/** Moderation only ever moves a status and adds a private note. */
export const reviewStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
});

export const leadStatusSchema = z.object({
  status: z.enum(["new", "replied", "won", "lost", "spam"]),
  notes: z.string().max(4000).nullish(),
});

export const requestStatusSchema = z.object({
  status: z.enum([
    "new",
    "accepted",
    "invoiced",
    "paid",
    "delivered",
    "declined",
  ]),
  notes: z.string().max(4000).nullish(),
});
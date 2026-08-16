import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { productRequests, products } from "../db/schema.js";
import { notify } from "../lib/email.js";
import { env } from "../env.js";

/**
 * Ready systems: listing, detail, and the purchase request.
 *
 * Nothing here takes money. A request opens a conversation; the invoice and
 * the bank transfer happen off the site. That is not a shortcut — at €800 to
 * €3,000 a European buyer expects an invoice, and a card form would be the
 * unfamiliar option.
 */
export const productsRouter = Router();

productsRouter.get("/products", async (_req, res) => {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      tagline: products.tagline,
      category: products.category,
      price: products.price,
      priceNote: products.priceNote,
      deliveryDays: products.deliveryDays,
      stack: products.stack,
      coverImage: products.coverImage,
      featured: products.featured,
    })
    .from(products)
    .where(eq(products.published, true))
    .orderBy(asc(products.sort));

  res.json({ products: rows });
});

productsRouter.get("/products/:slug", async (req, res) => {
  const [row] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.slug, req.params.slug), eq(products.published, true)),
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ product: row });
});

/* ------------------------------------------------------------- the request */

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later, or email us." },
});

const requestSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("That does not look like an email").max(254),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  /* Country and VAT number decide whether reverse charge applies. Asking now
     saves an email later, and a finance person expects to be asked. */
  country: z.string().trim().max(80).optional().or(z.literal("")),
  vatNumber: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().max(4000).optional().or(z.literal("")),
  website: z.string().max(0).optional(),
});

productsRouter.post("/product-requests", limiter, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({
      error: "Some fields need attention",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  if (parsed.data.website) {
    res.status(201).json({ ok: true });
    return;
  }

  const { slug, name, email, company, country, vatNumber, message } =
    parsed.data;

  const [product] = await db
    .select({ id: products.id, title: products.title, price: products.price })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.published, true)))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "That system is not available" });
    return;
  }

  await db.insert(productRequests).values({
    productId: product.id,
    name,
    email,
    company: company || null,
    country: country || null,
    vatNumber: vatNumber || null,
    message: message || null,
    ip: req.ip ?? null,
  });

  /* The most valuable message this server sends. Someone is asking to buy;
     finding out three days later in a dashboard is finding out too late. */
  notify({
    subject: `Purchase request — ${product.title}`,
    rows: [
      ["Name", name],
      ["Email", email],
      ["Company", company || "—"],
      ["Country", country || "—"],
      ["VAT", vatNumber || "—"],
      ["System", `${product.title} · ${product.price}`],
    ],
    body: message || null,
    action: `${env.ADMIN_URL}/requests`,
  });

  res.status(201).json({ ok: true });
});
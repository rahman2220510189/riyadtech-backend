import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import {
  faqItems,
  leads,
  pricingTiers,
  productRequests,
  products,
  conversations,
  reviews,
  services,
  settings,
  teamMembers,
  workItems,
} from "../../db/schema.js";
import { requireAuth, verifyLogin } from "../../lib/auth.js";
import { uploadImage, imagesConfigured } from "../../lib/images.js";
import { ALL_PATHS, revalidate } from "../../lib/revalidate.js";
import { conversationsRouter } from "../conversations.js";
import { crudRouter } from "./crud.js";
import {
  faqSchema,
  leadStatusSchema,
  pricingSchema,
  productSchema,
  requestStatusSchema,
  reviewStatusSchema,
  serviceSchema,
  teamSchema,
  workSchema,
} from "./schemas.js";

export const adminRouter = Router();

/* --------------------------------------------------------------- sessions */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

adminRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(401).json({ error: "That email and password do not match." });
    return;
  }

  const user = await verifyLogin(parsed.data.email, parsed.data.password);

  /* One message for both a wrong password and an unknown address. Saying
     "no such account" would confirm which addresses exist. */
  if (!user) {
    res.status(401).json({ error: "That email and password do not match." });
    return;
  }

  req.session.userId = user.id;
  req.session.userName = user.name;

  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

adminRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

adminRouter.get("/me", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  res.json({ user: { id: req.session.userId, name: req.session.userName } });
});

/* Everything past this point requires a session. */
adminRouter.use(requireAuth);

/* --------------------------------------------------------------- overview */

adminRouter.get("/overview", async (_req, res) => {
  const [
    [newLeads],
    [pendingReviews],
    [newRequests],
    [hiddenWork],
    [hiddenTeam],
    [hiddenProducts],
    [unreadThreads],
    recentLeads,
    recentRequests,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.status, "new")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.status, "pending")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(productRequests)
      .where(eq(productRequests.status, "new")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workItems)
      .where(eq(workItems.published, false)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(eq(teamMembers.published, false)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.published, false)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(conversations)
      .where(eq(conversations.unreadForAdmin, true)),
    db.select().from(leads).orderBy(desc(leads.createdAt)).limit(6),
    db
      .select({
        id: productRequests.id,
        name: productRequests.name,
        company: productRequests.company,
        email: productRequests.email,
        status: productRequests.status,
        createdAt: productRequests.createdAt,
        productTitle: products.title,
      })
      .from(productRequests)
      .leftJoin(products, eq(productRequests.productId, products.id))
      .orderBy(desc(productRequests.createdAt))
      .limit(6),
  ]);

  res.json({
    counts: {
      newLeads: newLeads?.n ?? 0,
      pendingReviews: pendingReviews?.n ?? 0,
      newRequests: newRequests?.n ?? 0,
      hiddenWork: hiddenWork?.n ?? 0,
      hiddenTeam: hiddenTeam?.n ?? 0,
      hiddenProducts: hiddenProducts?.n ?? 0,
      unreadThreads: unreadThreads?.n ?? 0,
    },
    recentLeads,
    recentRequests,
  });
});

/* -------------------------------------------------------------- resources */

const rebuild = () => void revalidate(ALL_PATHS);

adminRouter.use(
  "/services",
  crudRouter({ table: services as never, schema: serviceSchema }, rebuild),
);
adminRouter.use(
  "/work",
  crudRouter({ table: workItems as never, schema: workSchema }, rebuild),
);
adminRouter.use(
  "/pricing",
  crudRouter({ table: pricingTiers as never, schema: pricingSchema }, rebuild),
);
adminRouter.use(
  "/team",
  crudRouter({ table: teamMembers as never, schema: teamSchema }, rebuild),
);
adminRouter.use(
  "/faq",
  crudRouter({ table: faqItems as never, schema: faqSchema }, rebuild),
);
adminRouter.use(
  "/products",
  crudRouter({ table: products as never, schema: productSchema }, rebuild),
);

/* Settings are keyed by name rather than id, so they get their own pair. */
adminRouter.get("/settings", async (_req, res) => {
  const rows = await db.select().from(settings).orderBy(settings.sort);
  res.json({ items: rows });
});

adminRouter.patch("/settings/:key", async (req, res) => {
  const parsed = z.object({ value: z.string().max(2000) }).safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: "Expected a value" });
    return;
  }

  const [row] = await db
    .update(settings)
    .set({ value: parsed.data.value, updatedAt: new Date() })
    .where(eq(settings.key, req.params.key))
    .returning();

  if (!row) {
    res.status(404).json({ error: "No such setting" });
    return;
  }

  rebuild();
  res.json({ item: row });
});

/* ------------------------------------------------------------- moderation */

adminRouter.get("/reviews", async (_req, res) => {
  const rows = await db.select().from(reviews).orderBy(desc(reviews.createdAt));
  res.json({ items: rows });
});

adminRouter.patch("/reviews/:id", async (req, res) => {
  const parsed = reviewStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Unknown status" });
    return;
  }

  const [row] = await db
    .update(reviews)
    .set({
      status: parsed.data.status,
      /* Stamped on approval, and it is what the public list orders by, so an
         old review that gets approved today appears where it belongs. */
      approvedAt: parsed.data.status === "approved" ? new Date() : null,
    })
    .where(eq(reviews.id, Number(req.params.id)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  rebuild();
  res.json({ item: row });
});

adminRouter.get("/leads", async (_req, res) => {
  const rows = await db.select().from(leads).orderBy(desc(leads.createdAt));
  res.json({ items: rows });
});

adminRouter.patch("/leads/:id", async (req, res) => {
  const parsed = leadStatusSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Unknown status" });
    return;
  }

  const [row] = await db
    .update(leads)
    .set(parsed.data)
    .where(eq(leads.id, Number(req.params.id)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ item: row });
});

adminRouter.get("/product-requests", async (_req, res) => {
  const rows = await db
    .select({
      id: productRequests.id,
      productId: productRequests.productId,
      productTitle: products.title,
      productPrice: products.price,
      name: productRequests.name,
      email: productRequests.email,
      company: productRequests.company,
      country: productRequests.country,
      vatNumber: productRequests.vatNumber,
      message: productRequests.message,
      status: productRequests.status,
      notes: productRequests.notes,
      createdAt: productRequests.createdAt,
    })
    .from(productRequests)
    .leftJoin(products, eq(productRequests.productId, products.id))
    .orderBy(desc(productRequests.createdAt));

  res.json({ items: rows });
});

adminRouter.patch("/product-requests/:id", async (req, res) => {
  const parsed = requestStatusSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Unknown status" });
    return;
  }

  const [row] = await db
    .update(productRequests)
    .set(parsed.data)
    .where(eq(productRequests.id, Number(req.params.id)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ item: row });
});

adminRouter.use(conversationsRouter);

/* ----------------------------------------------------------------- upload */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    callback(null, allowed.includes(file.mimetype));
  },
});

adminRouter.post("/upload", upload.single("file"), async (req, res) => {
  if (!imagesConfigured) {
    res.status(503).json({ error: "Uploads are off — CLOUDINARY_URL is not set" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Send an image under 8MB (JPEG, PNG or WebP)" });
    return;
  }

  const kind = req.body?.kind === "team" ? "team" : "product";
  const image = await uploadImage(req.file.buffer, kind);

  res.status(201).json({ image });
});
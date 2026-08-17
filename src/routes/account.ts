import crypto from "node:crypto";
import { Router } from "express";
import argon2 from "argon2";
import rateLimit from "express-rate-limit";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  conversations,
  customers,
  messages,
  passwordResets,
  productRequests,
  products,
} from "../db/schema.js";
import { notify, notifyCustomer } from "../lib/email.js";
import { env } from "../env.js";

/**
 * The customer portal: an account, the status of what you asked to buy, and a
 * message thread with us.
 *
 * The account exists for the second and third of those. A signup form that
 * only unlocks a contact form is a wall in front of a conversation, and most
 * people will send an email instead — correctly.
 *
 * Messages are read by polling rather than a socket. A free instance that
 * sleeps drops websockets constantly, and a support thread that silently
 * stops updating is worse than one that refreshes every ten seconds.
 */
export const accountRouter = Router();

declare module "express-session" {
  interface SessionData {
    customerId?: number;
    customerName?: string;
  }
}

function requireCustomer(
  req: Parameters<Parameters<Router["get"]>[1]>[0],
  res: Parameters<Parameters<Router["get"]>[1]>[1],
  next: () => void,
) {
  if (req.session.customerId) return next();
  res.status(401).json({ error: "Not signed in" });
}

/* ---------------------------------------------------------------- sign up */

const signUpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("That does not look like an email").max(254),
  /* Twelve characters, no composition rules. Length is what actually helps;
     forcing a symbol mostly produces Password1! and a sticky note. */
  password: z.string().min(12, "Use at least 12 characters"),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  website: z.string().max(0).optional(),
});

accountRouter.post("/account/register", signUpLimiter, async (req, res) => {
  const parsed = signUpSchema.safeParse(req.body);

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

  const email = parsed.data.email.toLowerCase();

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (existing) {
    /* Deliberately vague. "That address already has an account" would let
       anyone check which of their contacts are our customers. */
    res.status(409).json({
      error: "That address cannot be used. Try signing in instead.",
    });
    return;
  }

  const [customer] = await db
    .insert(customers)
    .values({
      email,
      name: parsed.data.name,
      company: parsed.data.company || null,
      country: parsed.data.country || null,
      passwordHash: await argon2.hash(parsed.data.password, {
        type: argon2.argon2id,
      }),
    })
    .returning();

  req.session.customerId = customer.id;
  req.session.customerName = customer.name;

  res.status(201).json({
    customer: { id: customer.id, name: customer.name, email: customer.email },
  });
});

/* ---------------------------------------------------------------- sign in */

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

accountRouter.post("/account/login", signInLimiter, async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);

  const fail = () =>
    res.status(401).json({ error: "That email and password do not match." });

  if (!parsed.success) return void fail();

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, parsed.data.email.trim().toLowerCase()))
    .limit(1);

  if (!customer) return void fail();

  const ok = await argon2
    .verify(customer.passwordHash, parsed.data.password)
    .catch(() => false);

  if (!ok) return void fail();

  await db
    .update(customers)
    .set({ lastLoginAt: new Date() })
    .where(eq(customers.id, customer.id));

  req.session.customerId = customer.id;
  req.session.customerName = customer.name;

  res.json({
    customer: { id: customer.id, name: customer.name, email: customer.email },
  });
});

accountRouter.post("/account/logout", (req, res) => {
  /* Only the customer half of the session is cleared. Destroying the whole
     session would sign an admin out of their own panel in the same browser. */
  delete req.session.customerId;
  delete req.session.customerName;
  res.json({ ok: true });
});

accountRouter.get("/account/me", async (req, res) => {
  if (!req.session.customerId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      company: customers.company,
      country: customers.country,
    })
    .from(customers)
    .where(eq(customers.id, req.session.customerId))
    .limit(1);

  if (!customer) {
    delete req.session.customerId;
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  res.json({ customer });
});

/* ----------------------------------------------------------------- orders */

accountRouter.get("/account/orders", requireCustomer, async (req, res) => {
  const rows = await db
    .select({
      id: productRequests.id,
      status: productRequests.status,
      createdAt: productRequests.createdAt,
      productTitle: products.title,
      productSlug: products.slug,
      productPrice: products.price,
      deliveryDays: products.deliveryDays,
    })
    .from(productRequests)
    .leftJoin(products, eq(productRequests.productId, products.id))
    /* Matched on email, so a request made before signing up still appears
       once an account exists with the same address. */
    .where(
      eq(
        productRequests.email,
        (
          await db
            .select({ email: customers.email })
            .from(customers)
            .where(eq(customers.id, req.session.customerId!))
            .limit(1)
        )[0]?.email ?? "",
      ),
    )
    .orderBy(desc(productRequests.createdAt));

  res.json({ orders: rows });
});

/* ------------------------------------------------------------ the threads */

accountRouter.get("/account/conversations", requireCustomer, async (req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, req.session.customerId!))
    .orderBy(desc(conversations.lastMessageAt));

  res.json({ conversations: rows });
});

accountRouter.post(
  "/account/conversations",
  requireCustomer,
  async (req, res) => {
    const parsed = z
      .object({
        subject: z.string().trim().min(1, "A subject helps us reply").max(200),
        body: z.string().trim().min(1, "Write a message").max(8000),
        productRequestId: z.number().int().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(422).json({
        error: "Some fields need attention",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const [conversation] = await db
      .insert(conversations)
      .values({
        customerId: req.session.customerId!,
        productRequestId: parsed.data.productRequestId ?? null,
        subject: parsed.data.subject,
        unreadForAdmin: true,
      })
      .returning();

    await db.insert(messages).values({
      conversationId: conversation.id,
      senderType: "customer",
      senderId: req.session.customerId!,
      senderName: req.session.customerName ?? "Customer",
      body: parsed.data.body,
    });

    const [customer] = await db
      .select({ email: customers.email, company: customers.company })
      .from(customers)
      .where(eq(customers.id, req.session.customerId!))
      .limit(1);

    notify({
      subject: `New message — ${parsed.data.subject}`,
      rows: [
        ["Name", req.session.customerName ?? "Customer"],
        ["Email", customer?.email ?? "—"],
        ["Company", customer?.company ?? "—"],
      ],
      body: parsed.data.body,
      action: `${env.ADMIN_URL}/messages`,
    });

    res.status(201).json({ conversation });
  },
);

/**
 * Poll target. `since` returns only what arrived after a message id, so the
 * client asks every ten seconds and almost always gets an empty array back.
 */
accountRouter.get(
  "/account/conversations/:id/messages",
  requireCustomer,
  async (req, res) => {
    const id = Number(req.params.id);
    const since = Number(req.query.since ?? 0);

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.customerId, req.session.customerId!),
        ),
      )
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, id),
          Number.isFinite(since) && since > 0
            ? gt(messages.id, since)
            : undefined,
        ),
      )
      .orderBy(asc(messages.id));

    if (conversation.unreadForCustomer) {
      await db
        .update(conversations)
        .set({ unreadForCustomer: false })
        .where(eq(conversations.id, id));
    }

    res.json({ conversation, messages: rows });
  },
);

accountRouter.post(
  "/account/conversations/:id/messages",
  requireCustomer,
  async (req, res) => {
    const id = Number(req.params.id);

    const parsed = z
      .object({ body: z.string().trim().min(1).max(8000) })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(422).json({ error: "Write a message first" });
      return;
    }

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.customerId, req.session.customerId!),
        ),
      )
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [message] = await db
      .insert(messages)
      .values({
        conversationId: id,
        senderType: "customer",
        senderId: req.session.customerId!,
        senderName: req.session.customerName ?? "Customer",
        body: parsed.data.body,
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), unreadForAdmin: true })
      .where(eq(conversations.id, id));

    const [customer] = await db
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, req.session.customerId!))
      .limit(1);

    notify({
      subject: `Reply — ${conversation.subject}`,
      rows: [
        ["Name", req.session.customerName ?? "Customer"],
        ["Email", customer?.email ?? "—"],
      ],
      body: parsed.data.body,
      action: `${env.ADMIN_URL}/messages`,
    });

    res.status(201).json({ message });
  },
);

/**
 * How many threads have something the customer has not seen.
 *
 * Polled from anywhere in the portal, so it is deliberately one indexed count
 * and nothing else — cheap enough to ask for every fifteen seconds without
 * thinking about it.
 */
accountRouter.get("/account/unread", requireCustomer, async (req, res) => {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.customerId, req.session.customerId!),
        eq(conversations.unreadForCustomer, true),
      ),
    );

  res.json({ unread: rows.length });
});

/* ------------------------------------------------------- password recovery */

/**
 * The reset flow, in three routes.
 *
 * Two rules run through all of it:
 *
 *   The response never reveals whether an address has an account. Someone who
 *   can type addresses into this form must not be able to learn which of their
 *   contacts are our customers.
 *
 *   Only a hash of the token is stored, and the row is deleted the moment it
 *   is used. A link works exactly once, even though it will sit in an inbox
 *   afterwards — and often be opened by a corporate mail scanner first.
 */

const TOKEN_TTL_MINUTES = 60;

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

accountRouter.post("/account/forgot", resetLimiter, async (req, res) => {
  const parsed = z
    .object({ email: z.string().trim().email().max(254) })
    .safeParse(req.body);

  /* Identical response whether the address exists, is malformed, or the email
     fails to send. Anything else is an account-enumeration oracle. */
  const done = () =>
    res.json({
      ok: true,
      message:
        "If that address has an account, a reset link is on its way. It expires in an hour.",
    });

  if (!parsed.success) return void done();

  const email = parsed.data.email.toLowerCase();

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, email: customers.email })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (!customer) return void done();

  /* Housekeeping while we are here: expired rows are dead weight and there is
     no scheduler on a free instance to sweep them. */
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, new Date()));

  /* Any outstanding link for this account stops working now. Requesting a
     second reset should invalidate the first. */
  await db.delete(passwordResets).where(eq(passwordResets.customerId, customer.id));

  const token = crypto.randomBytes(32).toString("base64url");

  await db.insert(passwordResets).values({
    customerId: customer.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
  });

  const link = `${env.SITE_URL || "http://localhost:3000"}/portal/reset?token=${token}`;

  notifyCustomer({
    to: customer.email,
    subject: "Reset your Riyad Tech password",
    heading: "Reset your password",
    body: `Hello ${customer.name}, someone asked to reset the password on your Riyad Tech account. If that was not you, ignore this — nothing has changed and the link below will expire on its own.`,
    action: { label: "Choose a new password", url: link },
    footer: `This link works once and expires in ${TOKEN_TTL_MINUTES} minutes.`,
  });

  done();
});

/** Checked when the reset page loads, so a dead link says so before the
    visitor types a new password twice. */
accountRouter.get("/account/reset/:token", async (req, res) => {
  const [row] = await db
    .select({ id: passwordResets.id, expiresAt: passwordResets.expiresAt })
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashToken(req.params.token)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    res.status(400).json({ error: "That link has expired or has already been used." });
    return;
  }

  res.json({ ok: true });
});

accountRouter.post("/account/reset", resetLimiter, async (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(1),
      password: z.string().min(12, "Use at least 12 characters"),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({
      error: "Some fields need attention",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const [row] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashToken(parsed.data.token)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    res.status(400).json({ error: "That link has expired or has already been used." });
    return;
  }

  await db
    .update(customers)
    .set({
      passwordHash: await argon2.hash(parsed.data.password, {
        type: argon2.argon2id,
      }),
    })
    .where(eq(customers.id, row.customerId));

  await db.delete(passwordResets).where(eq(passwordResets.id, row.id));

  res.json({ ok: true });
});

/** Changing a password while signed in. The current one is required, so a
    borrowed laptop cannot be used to lock the owner out. */
accountRouter.post("/account/password", requireCustomer, async (req, res) => {
  const parsed = z
    .object({
      current: z.string().min(1),
      password: z.string().min(12, "Use at least 12 characters"),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({
      error: "Some fields need attention",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, req.session.customerId!))
    .limit(1);

  if (!customer) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  const ok = await argon2
    .verify(customer.passwordHash, parsed.data.current)
    .catch(() => false);

  if (!ok) {
    res.status(422).json({
      error: "That is not your current password",
      fields: { current: ["That is not your current password"] },
    });
    return;
  }

  await db
    .update(customers)
    .set({
      passwordHash: await argon2.hash(parsed.data.password, {
        type: argon2.argon2id,
      }),
    })
    .where(eq(customers.id, customer.id));

  res.json({ ok: true });
});
import { Router } from "express";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { conversations, customers, messages } from "../db/schema.js";

/** The admin side of the same threads. */
export const conversationsRouter = Router();

conversationsRouter.get("/conversations", async (_req, res) => {
  const rows = await db
    .select({
      id: conversations.id,
      subject: conversations.subject,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      unreadForAdmin: conversations.unreadForAdmin,
      customerName: customers.name,
      customerEmail: customers.email,
      customerCompany: customers.company,
    })
    .from(conversations)
    .leftJoin(customers, eq(conversations.customerId, customers.id))
    .orderBy(desc(conversations.lastMessageAt));

  res.json({ items: rows });
});

conversationsRouter.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const since = Number(req.query.since ?? 0);

  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, id),
        Number.isFinite(since) && since > 0 ? gt(messages.id, since) : undefined,
      ),
    )
    .orderBy(asc(messages.id));

  /* Opening a thread marks it read. Anything else means remembering to press
     a button, which nobody does twice. */
  await db
    .update(conversations)
    .set({ unreadForAdmin: false })
    .where(eq(conversations.id, id));

  res.json({ messages: rows });
});

conversationsRouter.post("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);

  const parsed = z
    .object({ body: z.string().trim().min(1).max(8000) })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: "Write a message first" });
    return;
  }

  const [message] = await db
    .insert(messages)
    .values({
      conversationId: id,
      senderType: "admin",
      senderId: req.session.userId!,
      senderName: req.session.userName ?? "Riyad Tech",
      body: parsed.data.body,
    })
    .returning();

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), unreadForCustomer: true })
    .where(eq(conversations.id, id));

  res.status(201).json({ message });
});

conversationsRouter.patch("/conversations/:id", async (req, res) => {
  const parsed = z
    .object({ status: z.enum(["open", "closed"]) })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: "Unknown status" });
    return;
  }

  const [row] = await db
    .update(conversations)
    .set({ status: parsed.data.status })
    .where(eq(conversations.id, Number(req.params.id)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ item: row });
});
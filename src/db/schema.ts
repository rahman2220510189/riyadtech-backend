import {
  boolean,
  json,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * The database is the shape content/site.ts already proved out.
 *
 * Building the frontend first was not a detour — every table below is a
 * section that exists, with exactly the fields that section renders. Nothing
 * here is speculative, and there is no "meta" table waiting to be figured out.
 *
 * Two conventions run through all of it:
 *   published  — hidden rows stay in the database; nothing is deleted to hide it
 *   sort       — display order is editable, never alphabetical by accident
 */

/* ---------------------------------------------------------------- content */

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  indexLabel: varchar("index_label", { length: 8 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: text("body").notNull(),
  /** Three short strings: "Invoice → accounting" and so on */
  uses: jsonb("uses").$type<string[]>().notNull().default([]),
  sort: integer("sort").notNull().default(0),
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workItems = pgTable("work_items", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  problem: text("problem").notNull(),
  result: text("result").notNull(),
  stack: varchar("stack", { length: 160 }).notNull(),
  /** Must open a working deployment. An empty link is worse than no card. */
  href: text("href").notNull(),
  tag: varchar("tag", { length: 40 }).notNull().default("Internal build"),
  /* A screenshot does more than the two sentences beside it: a visitor knows
     what the thing is before deciding whether to click. */
  coverImage: text("cover_image"),
  sort: integer("sort").notNull().default(0),
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pricingTiers = pgTable("pricing_tiers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  /** Stored as it should read: "€1,500", "from €6,000", "€400 / month" */
  price: varchar("price", { length: 60 }).notNull(),
  timeline: varchar("timeline", { length: 60 }).notNull(),
  featured: boolean("featured").notNull().default(false),
  includes: jsonb("includes").$type<string[]>().notNull().default([]),
  sort: integer("sort").notNull().default(0),
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  role: varchar("role", { length: 120 }).notNull(),
  line: text("line").notNull(),
  linkedin: text("linkedin"),
  /** Square image, 800px or better. Null renders the initial instead. */
  photoUrl: text("photo_url"),
  sort: integer("sort").notNull().default(0),
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sort: integer("sort").notNull().default(0),
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Everything that is one editable value rather than a list: the contact email,
 * the Cal.com URL, the working-hours line. One row per key keeps the admin
 * form simple and avoids a wide table that grows a column per idea.
 */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull().default(""),
  /** Shown next to the field in the admin panel */
  label: varchar("label", { length: 120 }).notNull().default(""),
  hint: text("hint"),
  sort: integer("sort").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ---------------------------------------------------------------- products */

/**
 * Ready systems: things already built, installed and adapted for a buyer at a
 * fixed price. Not templates — a template is a download, and a download needs
 * instant checkout, licence keys and a piracy policy. These are delivered
 * running, which is why a manual invoice works and why they sit comfortably
 * next to the consultancy prices rather than undercutting them.
 */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    /** URL segment: /products/invoice-inbox */
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    title: varchar("title", { length: 120 }).notNull(),
    /** One line under the title, on the card and the page */
    tagline: varchar("tagline", { length: 200 }).notNull(),
    /** Who it is for and what it does. Plain sentences, no feature soup. */
    description: text("description").notNull(),
    category: varchar("category", { length: 60 }).notNull().default("System"),

    /** Stored as it should read: "€1,200" */
    price: varchar("price", { length: 60 }).notNull(),
    /** "one-off, includes setup" — the small print under the number */
    priceNote: varchar("price_note", { length: 160 }).notNull().default(""),
    /** Working days from payment to handover */
    deliveryDays: integer("delivery_days").notNull().default(5),

    stack: varchar("stack", { length: 200 }).notNull().default(""),
    /** A live demo, if there is one. An empty link is worse than no button. */
    demoUrl: text("demo_url"),

    /** What the buyer receives */
    includes: jsonb("includes").$type<string[]>().notNull().default([]),
    /** Honest limits. Saying what it does not do sells the rest. */
    notIncluded: jsonb("not_included").$type<string[]>().notNull().default([]),

    coverImage: text("cover_image"),
    images: jsonb("images")
      .$type<{ url: string; alt: string }[]>()
      .notNull()
      .default([]),

    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("products_sort_idx").on(t.sort)],
);

/**
 * A purchase request. Payment is deliberately not automated: the buyer asks,
 * we confirm scope, then invoice. At this price point a European company
 * expects an invoice and a bank transfer anyway — a card form would be the
 * unfamiliar option, not the convenient one.
 *
 * status walks one way: new → accepted → invoiced → paid → delivered.
 */
export const productRequests = pgTable(
  "product_requests",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    company: varchar("company", { length: 160 }),
    /** Needed to work out whether reverse charge applies */
    country: varchar("country", { length: 80 }),
    vatNumber: varchar("vat_number", { length: 40 }),
    message: text("message"),
    status: varchar("status", { length: 20 }).notNull().default("new"),
    notes: text("notes"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("product_requests_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------- submissions */

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    company: varchar("company", { length: 160 }),
    /** The one question worth asking: what is being done by hand today */
    message: text("message").notNull(),
    /** Which page the form was submitted from */
    source: varchar("source", { length: 80 }).notNull().default("contact"),
    status: varchar("status", { length: 20 }).notNull().default("new"),
    notes: text("notes"),
    /** Kept for abuse handling only, never displayed */
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("leads_created_idx").on(t.createdAt)],
);

/**
 * Reviews are submitted by clients and appear only once approved here.
 *
 * Nothing is written by us, and the section stays hidden until there are at
 * least two approved rows — an empty testimonials strip does more damage than
 * no testimonials at all, and invented ones do more damage still.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    authorName: varchar("author_name", { length: 120 }).notNull(),
    authorRole: varchar("author_role", { length: 120 }),
    company: varchar("company", { length: 160 }),
    rating: integer("rating"),
    body: text("body").notNull(),
    /** pending · approved · rejected */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [index("reviews_status_idx").on(t.status)],
);

/* --------------------------------------------------------------- customers */

/**
 * A buyer's account.
 *
 * An account only earns its friction if it does something an email cannot:
 * here it shows the status of a purchase request and holds the message thread.
 * Without that, a signup form is a wall in front of a conversation.
 *
 * Separate from `users`. An admin is not a customer and a customer must never
 * become one by accident — two tables makes that impossible rather than
 * merely unlikely.
 */
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  company: varchar("company", { length: 160 }),
  country: varchar("country", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/**
 * One thread per subject. Usually tied to a purchase request, sometimes not —
 * a question before buying is still worth keeping in one place.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productRequestId: integer("product_request_id").references(
      () => productRequests.id,
      { onDelete: "set null" },
    ),
    subject: varchar("subject", { length: 200 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    /* Denormalised so the thread list can be ordered and badged without
       joining every message row on every poll. */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unreadForAdmin: boolean("unread_for_admin").notNull().default(false),
    unreadForCustomer: boolean("unread_for_customer").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("conversations_last_message_idx").on(t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** "customer" or "admin" — who is speaking, not which row */
    senderType: varchar("sender_type", { length: 12 }).notNull(),
    senderId: integer("sender_id").notNull(),
    senderName: varchar("sender_name", { length: 120 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/**
 * One-time tokens for password resets.
 *
 * Only a hash of the token is stored. If this table leaks, the rows in it are
 * useless — the same reasoning as never storing a password.
 *
 * A row is deleted the moment it is used, so a link works exactly once even if
 * it is still in an inbox, a browser history, or a corporate mail scanner that
 * follows every link it sees.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** sha256 of the token that was emailed. The token itself is never stored. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("password_resets_expires_idx").on(t.expiresAt)],
);

/* ------------------------------------------------------------------- admin */

/**
 * The session store's own table.
 *
 * connect-pg-simple creates this itself on first run, which means drizzle
 * would not know about it — and `drizzle-kit push` deletes tables it does not
 * recognise. Declaring it here is not for our benefit; it is so that a schema
 * push never signs everyone out.
 *
 * The columns match what connect-pg-simple expects exactly. Do not change them.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (t) => [index("user_sessions_expire_idx").on(t.expire)],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  /** argon2id. Plain passwords never touch this table. */
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export type Service = typeof services.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
export type PricingTier = typeof pricingTiers.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type FaqItem = typeof faqItems.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductRequest = typeof productRequests.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type User = typeof users.$inferSelect;
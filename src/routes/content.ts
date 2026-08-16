import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  faqItems,
  pricingTiers,
  products,
  reviews,
  services,
  settings,
  teamMembers,
  workItems,
} from "../db/schema.js";

/**
 * GET /api/v1/content
 *
 * One request returns everything the site renders. The frontend calls this at
 * build time and after an edit — never on a visitor's request — so a single
 * round trip is far better than seven, and the payload is a few kilobytes.
 *
 * Only published rows leave this endpoint. Unpublished work stays invisible
 * without being deleted.
 */
export const contentRouter = Router();

/** Two is the floor. One review reads as a favour; two reads as a pattern. */
const MIN_REVIEWS_TO_SHOW = 2;

contentRouter.get("/content", async (_req, res) => {
  const [
    serviceRows,
    workRows,
    pricingRows,
    teamRows,
    faqRows,
    settingRows,
    reviewRows,
    productRows,
  ] = await Promise.all([
    db
      .select()
      .from(services)
      .where(eq(services.published, true))
      .orderBy(asc(services.sort)),
    db
      .select()
      .from(workItems)
      .where(eq(workItems.published, true))
      .orderBy(asc(workItems.sort)),
    db
      .select()
      .from(pricingTiers)
      .where(eq(pricingTiers.published, true))
      .orderBy(asc(pricingTiers.sort)),
    db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.published, true))
      .orderBy(asc(teamMembers.sort)),
    db
      .select()
      .from(faqItems)
      .where(eq(faqItems.published, true))
      .orderBy(asc(faqItems.sort)),
    db.select().from(settings).orderBy(asc(settings.sort)),
    db
      .select({
        id: reviews.id,
        authorName: reviews.authorName,
        authorRole: reviews.authorRole,
        company: reviews.company,
        rating: reviews.rating,
        body: reviews.body,
        approvedAt: reviews.approvedAt,
      })
      .from(reviews)
      .where(and(eq(reviews.status, "approved")))
      .orderBy(asc(reviews.approvedAt)),
    /* Summary fields only. The detail page fetches the full row by slug, so
       the build-time payload stays small however many systems there are. */
    db
      .select({
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
      .orderBy(asc(products.sort)),
  ]);

  /* Flatten settings into an object so the frontend reads settings.email
     rather than hunting through an array for a key. */
  const settingsMap = Object.fromEntries(
    settingRows.map((row) => [row.key, row.value]),
  );

  res.json({
    services: serviceRows,
    work: workRows,
    pricing: pricingRows,
    team: teamRows,
    faq: faqRows,
    settings: settingsMap,
    /* The decision is made here, not in the component. The site should not
       have to know the rule, and the rule should not be duplicated. */
    products: productRows,
    reviews: reviewRows.length >= MIN_REVIEWS_TO_SHOW ? reviewRows : [],
    generatedAt: new Date().toISOString(),
  });
});
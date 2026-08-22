import "dotenv/config";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, pool } from "./index.js";
import {
  faqItems,
  pricingTiers,
  services,
  settings,
  teamMembers,
  users,
  workItems,
} from "./schema.js";

/**
 * Fills an empty database with the content already written in the site's
 * content/site.ts. That file was never throwaway — it was the draft that
 * proved what fields each section needs, and this is where it lands.
 *
 * Safe to run more than once: it skips any table that already has rows, so
 * it will never overwrite something edited in the admin panel.
 *
 *   npm run db:seed
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

async function seedTable<T extends { length: number }>(
  name: string,
  existing: T,
  insert: () => Promise<unknown>,
) {
  if (existing.length > 0) {
    console.info(`  ${name}: already has ${existing.length} rows, skipped`);
    return;
  }
  await insert();
  console.info(`  ${name}: seeded`);
}

async function main() {
  console.info("Seeding riyad-api database\n");

  await seedTable("services", await db.select().from(services), () =>
    db.insert(services).values([
      {
        indexLabel: "01",
        title: "Document automation",
        body: "Invoices, CVs, contracts, shipping papers. We read them, pull out the fields you care about, and push the data into the system you already use.",
        uses: ["Invoice → accounting", "CV → ATS", "Contract → database"],
        sort: 0,
      },
      {
        indexLabel: "02",
        title: "AI integration",
        body: "An assistant trained only on your own documentation that answers questions correctly, in your tone. It says “I don’t know” instead of inventing an answer.",
        uses: ["Website widget", "Internal helpdesk", "Email triage"],
        sort: 1,
      },
      {
        indexLabel: "03",
        title: "Custom web applications",
        body: "Dashboards, internal tools, and client portals built on the same stack we use for everything else. Fast, tested, and yours to keep.",
        uses: ["Next.js", "Python", "PostgreSQL"],
        sort: 2,
      },
    ]),
  );

  await seedTable("work_items", await db.select().from(workItems), () =>
    db.insert(workItems).values([
      {
        title: "CV Parser",
        problem: "Recruiters retype candidate details from hundreds of PDFs.",
        result: "Upload a CV, get clean structured JSON in under two seconds.",
        stack: "Python · spaCy · Next.js",
        href: "#",
        sort: 0,
        published: false,
      },
      {
        title: "Invoice Extractor",
        problem: "Finance teams key invoice data in by hand.",
        result:
          "Reads any invoice layout and outputs supplier, date, line items, and totals.",
        stack: "Python · OCR · FastAPI",
        href: "#",
        sort: 1,
        published: false,
      },
      {
        title: "Docs Assistant",
        problem: "Support teams answer the same questions daily.",
        result:
          "Ask a question, get an answer sourced from the company’s own documentation, with citations.",
        stack: "RAG · Postgres · Next.js",
        href: "#",
        sort: 2,
        published: false,
      },
    ]),
  );

  await seedTable("pricing_tiers", await db.select().from(pricingTiers), () =>
    db.insert(pricingTiers).values([
      {
        name: "Pilot",
        price: "€1,500",
        timeline: "2 weeks",
        featured: true,
        includes: [
          "One workflow, working on your real data",
          "Up to 200 documents",
          "Deployed and demoed",
          "Full source code",
        ],
        sort: 0,
      },
      {
        name: "Full build",
        price: "from €6,000",
        timeline: "4–6 weeks",
        includes: [
          "Everything in Pilot",
          "Integration with your existing tools",
          "User accounts and admin panel",
          "Testing and documentation",
          "30 days post-launch support",
        ],
        sort: 1,
      },
      {
        name: "Support",
        price: "€400 / month",
        timeline: "Ongoing",
        includes: [
          "Hosting and monitoring",
          "Model tuning as your data changes",
          "Bug fixes and small changes",
          "Monthly report",
          "Cancel any time",
        ],
        sort: 2,
      },
    ]),
  );

  /* Unpublished on purpose. Real names and real photographs before these
     appear on the site — placeholder people are the fastest way to lose a
     visitor who was almost convinced. */
  await seedTable("team_members", await db.select().from(teamMembers), () =>
    db.insert(teamMembers).values([
      {
        name: "Riyad",
        role: "Founder · Backend and AI",
        line: "Writes the extraction pipelines and takes every first call.",
        sort: 0,
        published: false,
      },
      {
        name: "Second name",
        role: "Role",
        line: "One sentence about what this person actually does.",
        sort: 1,
        published: false,
      },
      {
        name: "Third name",
        role: "Role",
        line: "One sentence about what this person actually does.",
        sort: 2,
        published: false,
      },
    ]),
  );

  await seedTable("faq_items", await db.select().from(faqItems), () =>
    db.insert(faqItems).values([
      {
        question: "What happens if the pilot does not work?",
        answer:
          "You stop. That is the point of a fixed two-week pilot — €1,500 buys you a definite answer instead of a six-month commitment. You keep the code either way, and we will tell you plainly if we think the problem is a poor fit for AI.",
        sort: 0,
      },
      {
        question: "Who owns the code?",
        answer:
          "You do. Full source, no licence fee, no per-seat pricing, no lock-in. If you stop working with us, everything keeps running and any competent developer can pick it up.",
        sort: 1,
      },
      {
        question: "Where is our data processed?",
        answer:
          "On EU-hosted infrastructure, in Frankfurt or Paris. Your documents are never used to train models. We sign a Data Processing Agreement before anything is exchanged, and we delete everything on request.",
        sort: 2,
      },
      {
        question: "Why a studio in Dhaka?",
        answer:
          "Because it is where we are, and because it means a European company gets senior engineering at a price that makes a small automation project worth doing at all. Our hours cover a full working day in Central Europe.",
        sort: 3,
      },
      {
        question: "How does payment work?",
        answer:
          "Bank transfer in euros. Half at the start, half on delivery. As a non-EU supplier we do not charge VAT — reverse charge applies and you account for it locally.",
        sort: 4,
      },
      {
        question: "We already have a developer. Does that change anything?",
        answer:
          "It usually makes things faster. We build the part they do not have time for, hand it over documented, and stay out of the way.",
        sort: 5,
      },
    ]),
  );

  await seedTable("settings", await db.select().from(settings), () =>
    db.insert(settings).values([
      {
        key: "contact_email",
        value: "hello@riyad.tech",
        label: "Contact email",
        hint: "Shown in the footer, the contact page and the imprint",
        sort: 0,
      },
      {
        key: "linkedin_url",
        value: "https://www.linkedin.com/company/riyad-tech/",
        label: "LinkedIn",
        hint: "Leave empty to hide the link",
        sort: 1,
      },
      {
        key: "instagram_url",
        value: "https://www.instagram.com/riya_dtech/",
        label: "Instagram",
        hint: "Leave empty to hide the link",
        sort: 2,
      },
      {
        key: "facebook_url",
        value: "https://www.facebook.com/riyadtech.bd",
        label: "Facebook",
        hint: "Leave empty to hide the link",
        sort: 3,
      },
      {
        key: "cal_url",
        value: "",
        label: "Cal.com booking URL",
        hint: "Leave empty to hide the calendar and show the form alone",
        sort: 2,
      },
      {
        key: "response_time",
        value: "Usually within one working day",
        label: "Response time",
        sort: 3,
      },
      {
        key: "working_hours",
        value:
          "Based in Dhaka, Bangladesh. We work 14:00–22:00 BST, which covers 09:00–17:00 CET.",
        label: "Working hours line",
        sort: 4,
      },
      { key: "location", value: "Dhaka, Bangladesh", label: "Location", sort: 5 },
    ]),
  );


    /* Agency-page numbers: seeded separately from the block above, which skips
     entirely once the settings table has any rows. These four are additive —
     onConflictDoNothing means running this twice, or running it after the
     table already has the original eight rows, never overwrites a value
     someone has since edited in the admin panel. */
  await db
    .insert(settings)
    .values([
      {
        key: "agency_team_size",
        value: "six",
        label: "Agency page — team size",
        hint: 'Word, not digit — appears as "a six-person engineering studio." Must match actual headcount.',
        sort: 100,
      },
      {
        key: "agency_rate_project",
        value: "€1,200–3,000 per project",
        label: "Agency page — project rate",
        hint: "Shown on /agencies, card 01 (Project build)",
        sort: 101,
      },
      {
        key: "agency_rate_maintenance",
        value: "€150–400 per site, monthly",
        label: "Agency page — maintenance rate",
        hint: "Shown on /agencies, card 02 (Maintenance)",
        sort: 102,
      },
      {
        key: "agency_rate_developer",
        value: "€2,000–3,500 per developer, monthly",
        label: "Agency page — developer rate",
        hint: "Shown on /agencies, card 03 (Dedicated developer)",
        sort: 103,
      },
    ])
    .onConflictDoNothing({ target: settings.key });
  console.info("  settings (agency): ensured 4 rows");

  /* --- admin account ---------------------------------------------------- */

  const existingUsers = await db.select().from(users);

  if (existingUsers.length > 0) {
    console.info(`  users: ${existingUsers.length} already exist, skipped`);
  } else if (!ADMIN_EMAIL || ADMIN_PASSWORD.length < 12) {
    console.warn(
      "\n  users: skipped — set ADMIN_EMAIL and an ADMIN_PASSWORD of at least\n" +
        "  12 characters in .env, then run npm run db:seed again.",
    );
  } else {
    await db.insert(users).values({
      email: ADMIN_EMAIL.toLowerCase(),
      name: "Riyad",
      passwordHash: await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id }),
    });
    console.info(`  users: created ${ADMIN_EMAIL}`);
  }

  console.info("\nDone.");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

/* Keeps the unused import honest if the eq helper is dropped later. */
void eq;
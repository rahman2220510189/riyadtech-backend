# riyad-api

The backend for riyad.tech. Express 5, TypeScript, Drizzle, Postgres.

It is a separate project on purpose. The site and this API share exactly two
things — one URL each way — and nothing else.

```
riyad-tech  →  GET  {API_URL}/api/v1/content     at build time only
riyad-api   →  POST {SITE_URL}/api/revalidate    after an edit is saved
```

The public site never calls this API on a visitor's request. Pages are built
static and rebuilt on demand, so **the site stays up even when this is down** —
it just stops showing new edits. That is the correct failure mode for a
marketing site, and it is why the free tier sleeping does not matter.

## Getting a database

Neon's free tier, not Supabase's: a Supabase free project pauses after seven
days of inactivity, which is a real risk here. Neon only sleeps, and wakes in
about a second.

1. Sign up at neon.tech, create a project, region **EU (Frankfurt)**
2. Dashboard → Connection Details → copy the **pooled** connection string
3. `copy .env.example .env` and paste it into `DATABASE_URL`

## Running it

```bash
npm install
npm run db:push      # creates the tables
npm run db:seed      # fills them from the content already written
npm run dev          # http://localhost:4000
```

Check it is alive:

```
http://localhost:4000/health
http://localhost:4000/api/v1/content
```

## Admin account

Add these to `.env` before seeding, then run `npm run db:seed`:

```
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=at-least-twelve-characters
```

The password is hashed with argon2id before it is stored. Delete both lines
from `.env` once the account exists.

## Endpoints

| Method | Path                | Who        | What                                    |
| ------ | ------------------- | ---------- | --------------------------------------- |
| GET    | `/health`           | anyone     | Liveness, plus a database ping          |
| GET    | `/api/v1/content`   | the site   | Every published row, in one response    |
| POST   | `/api/v1/leads`     | the form   | Contact submission, 5/hour per IP       |
| POST   | `/api/v1/reviews`   | the form   | Review submission, lands **pending**    |

Both POST endpoints carry a honeypot field named `website`. Real forms leave it
empty; a filled one is accepted with a normal-looking response and discarded.

## Reviews

Nothing is published automatically, and nothing is written by us. A review
appears on the site only after it is approved in the admin panel, and the
section stays hidden entirely until **two** reviews are approved — an empty
testimonials strip does more damage than none, and invented ones do more damage
still.

## Progress

- [x] Project setup, environment guard, error handling
- [x] Schema, connection, migrations
- [x] Public endpoints: content, leads, reviews
- [x] Seed from the site's existing content
- [ ] Session auth and the admin panel
- [ ] Image upload for team photos
- [ ] Email notification on a new lead
- [ ] Deploy

## Notes

- `published = false` hides a row without deleting it. Nothing is destroyed to
  take it off the site.
- `sort` controls display order everywhere. Never rely on insert order.
- Errors return a flat message; the stack goes to the log only. A database
  error should not explain the database to the internet.
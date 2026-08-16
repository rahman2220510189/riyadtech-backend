# Deploying Riyad Tech

Three projects, three repositories, one domain. Follow the order — the site
reads from the API at build time, so the API has to exist first.

```
riyadtech.xyz          Vercel     the site
api.riyadtech.xyz      Render     the API
admin.riyadtech.xyz    Vercel     the admin panel
```

All three sit under one root domain. That is not tidiness: the session cookie
is dropped by the browser if the admin and the API are on unrelated domains,
and sign-in fails silently when that happens.

---

## Before you start

Three secrets need to exist and match across projects. Generate them once:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"   # SESSION_SECRET
node -e "console.log(crypto.randomUUID())"                        # REVALIDATE_SECRET
```

`REVALIDATE_SECRET` must be identical in `riyad-api` and `riyad-tech`. If it is
not, saving in the admin panel appears to work and the site never updates — the
API logs a 401 and nothing else tells you.

---

## 1 · Push three repositories

Each project is its own repository. In each folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOU/riyad-api.git
git push -u origin main
```

Check before pushing that no `.env` file is included:

```bash
git status --porcelain | findstr .env
```

Only `.env.example` should ever appear. If a real `.env` was committed, the
database password is now in the history — rotate it in Neon rather than
deleting the file.

---

## 2 · Deploy the API to Render

New → Web Service → connect `riyad-api`. Render reads `render.yaml`, so the
build and start commands are already set. Region **Frankfurt**.

Add the environment variables in the dashboard:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the pooled connection string from Neon |
| `SESSION_SECRET` | the long random string generated above |
| `ALLOWED_ORIGINS` | `https://riyadtech.xyz,https://admin.riyadtech.xyz` |
| `SITE_URL` | `https://riyadtech.xyz` |
| `REVALIDATE_SECRET` | the shared secret |
| `CLOUDINARY_URL` | from the Cloudinary dashboard |
| `RESEND_API_KEY` | from Resend |
| `NOTIFY_EMAIL` | where enquiries should land |
| `FROM_EMAIL` | `Riyad Tech <onboarding@resend.dev>` until a domain is verified |
| `ADMIN_URL` | `https://admin.riyadtech.xyz` |

`npm start` runs the migrations before the server accepts a request, so the
schema is applied on deploy without anything to remember.

When it is live, check `https://your-service.onrender.com/health`.

### The free tier sleeps

A free Render instance stops after fifteen minutes idle and takes thirty to
fifty seconds to wake. Visitors never notice — they are served static pages —
but you will wait for it when you open the admin panel. That is the trade for
€0, and it is a reasonable one until there is revenue.

---

## 3 · Deploy the site to Vercel

New Project → import `riyad-tech`. Vercel detects Next.js; change nothing.

| Variable | Value |
| --- | --- |
| `API_URL` | `https://api.riyadtech.xyz` |
| `NEXT_PUBLIC_API_URL` | `https://api.riyadtech.xyz` |
| `NEXT_PUBLIC_SITE_URL` | `https://riyadtech.xyz` |
| `REVALIDATE_SECRET` | the same shared secret |

The first build may run before DNS resolves. That is fine — the site falls
back to `content/site.ts` and builds anyway. Redeploy once the API answers.

---

## 4 · Deploy the admin to Vercel

New Project → import `riyad-admin`. Framework: Vite.

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://api.riyadtech.xyz` |

---

## 5 · Point the domain

In the Dhaka Web Host DNS panel, add what each platform asks for. The exact
values come from their dashboards; the shape is:

| Type | Name | Points to |
| --- | --- | --- |
| A | `@` | Vercel's IP for the apex |
| CNAME | `www` | Vercel |
| CNAME | `api` | your Render service |
| CNAME | `admin` | Vercel |

Add each domain in the platform first, then create the record — both check.

DNS takes minutes to hours. Certificates are issued automatically once the
records resolve; there is nothing to buy or install.

---

## 6 · Check it end to end

- `https://riyadtech.xyz` loads, and the pricing matches the database
- `https://api.riyadtech.xyz/health` returns `{"ok":true}`
- Sign in at `https://admin.riyadtech.xyz`
- Change a price, save, reload the site — the new figure is there
- Submit the contact form; it appears under Leads and in your inbox
- Create an account at `/portal`, send a message, reply from the admin

If the fourth fails, `REVALIDATE_SECRET` does not match. If the fifth or sixth
fails, `ALLOWED_ORIGINS` is missing the site's address.

---

## 7 · Before telling anyone about it

- [ ] Real work items with links that open something that runs
- [ ] Real team members: names, photographs, LinkedIn
- [ ] Contact email and Cal.com link in Settings
- [ ] Company address in Privacy and Imprint
- [ ] Test accounts removed: `DELETE FROM customers;`
- [ ] Lighthouse on the deployed site, not localhost

---

## Changing the schema afterwards

```bash
npm run db:generate    # writes a SQL file into drizzle/
```

Read it. Commit it. Push. Render applies it on the next deploy.

Never run `db:push` against the production database. It compares the schema to
what is there and changes whatever differs — including deleting tables it does
not recognise. It has already tried to drop the session table once.
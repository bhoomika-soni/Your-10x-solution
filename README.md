# Job Match Tracker

FlyRank Internship · Backend Track · Capstone — **Your 10x Solution**

Track your job applications, and get an AI score of how well your resume matches
each job description — with results cached and computed in the background so
repeat checks are instant and free.

## The problem

Job hunters juggle a spreadsheet of applications and manually re-read every job
description against their resume to guess whether it's worth applying, or why
they got rejected. That comparison — reading a JD, mentally checking it against
a resume, writing a note — takes 10-15 minutes per application, every time,
even for postings that are nearly identical.

## The 10x claim

What took ~10-15 minutes of manual comparison now takes **5-10 seconds** for a
new resume/JD pair, and **instantly, for $0**, for a pair that's already been
scored — the cache makes repeat checks (edited an application, re-checked the
same posting) free instead of re-paying for another LLM call.

## Concepts implemented

No swaps were needed — 6 of the 7 core concepts fit naturally.

| Concept | Where it lives |
|---|---|
| **API endpoints** | `src/routes/*.routes.js` — Express REST API, zod-validated, correct status codes (201/202/400/401/404/409) |
| **Database** | PostgreSQL, schema in `src/db/schema.sql` — users, applications, match cache, job queue |
| **Authentication** | `src/middleware/auth.js`, `src/routes/auth.routes.js` — JWT + bcrypt, every non-auth route requires a valid token |
| **Background jobs** | `src/services/worker.js` — LLM scoring runs off the request path; the API only enqueues a `match_jobs` row |
| **Caching** | `src/services/cache.service.js` — resume+JD content hash looked up in `match_results` before any LLM call is made |
| **LLM integration** | `src/services/llm.service.js` — Groq (OpenAI-compatible), zod-validated response, per-call token/cost logged to `match_results` |

## Architecture

```
POST /applications/:id/match
        │
        ▼
  hash(resume) + hash(job description)
        │
   ┌────┴────┐
   │ cached? │
   └────┬────┘
   yes  │  no
   ┌────┘  └─────────────┐
   ▼                      ▼
200 done, cached:true   202 pending → match_jobs row
(no LLM call, $0)              │
                                ▼
                     background worker polls
                     match_jobs every 3s (FOR UPDATE SKIP LOCKED)
                                │
                                ▼
                     calls Groq LLM → validates
                     JSON with zod → stores in
                     match_results (score, cost, tokens)
                                │
                                ▼
                     GET /match-jobs/:id → done + result
```

## Run it

Requires Node.js 20+ and Docker (for Postgres), or your own local Postgres.

```bash
# 1. start Postgres
docker compose up -d

# 2. install deps
npm install

# 3. configure environment
cp .env.example .env
# edit .env: set JWT_SECRET to any random string, and GROQ_API_KEY
# (free key, no credit card: https://console.groq.com/keys)

# 4. create the schema
npm run migrate

# 5. load demo data (a demo user, 3 applications, one pre-computed match)
npm run seed

# 6. run the API + background worker
npm run dev
```

The API listens on `http://localhost:3000`.

## 5-minute demo path

Demo login (from `npm run seed`): **demo@example.com** / **Demo1234!**

```bash
# 1. log in
TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Demo1234!"}' | jq -r .token)

# 2. list seeded applications — one already has a match score (seeded, $0)
curl -s localhost:3000/applications -H "Authorization: Bearer $TOKEN" | jq

# 3. trigger a match on an application that has NOT been scored yet
#    (grab an id from step 2, e.g. the Northwind Analytics one)
curl -s -X POST localhost:3000/applications/<id>/match -H "Authorization: Bearer $TOKEN" | jq
#    -> 202 { status: "pending" } — a real LLM call needs GROQ_API_KEY set

# 4. poll the job until it's done (worker picks it up within ~3s)
curl -s localhost:3000/match-jobs/<job_id> -H "Authorization: Bearer $TOKEN" | jq

# 5. call match on the SAME application again — this time it's instant
curl -s -X POST localhost:3000/applications/<id>/match -H "Authorization: Bearer $TOKEN" | jq
#    -> 200 { status: "done", cached: true } immediately, no LLM call

# 6. see the cache savings
curl -s localhost:3000/stats -H "Authorization: Bearer $TOKEN" | jq
```

## API reference

| Method & path | Auth | Description |
|---|---|---|
| `POST /auth/register` | – | Create an account |
| `POST /auth/login` | – | Get a JWT |
| `GET /me` | ✓ | Current user profile |
| `PATCH /me/resume` | ✓ | Set/update your resume text |
| `POST /applications` | ✓ | Create an application |
| `GET /applications` | ✓ | List your applications (optional `?status=`), with latest score |
| `GET /applications/:id` | ✓ | Application detail + match job history |
| `PATCH /applications/:id` | ✓ | Update an application |
| `DELETE /applications/:id` | ✓ | Delete an application |
| `POST /applications/:id/match` | ✓ | Score resume vs this job (cache hit → 200, miss → 202 queued) |
| `GET /match-jobs/:id` | ✓ | Poll a queued match job |
| `GET /stats` | ✓ | Application counts, avg score, cache hits vs LLM calls, cost log |

## Environment variables

See `.env.example` for the full list and defaults. `GROQ_API_KEY` is free —
sign up at [console.groq.com](https://console.groq.com/keys), no credit card.

## Testing

```bash
npm test
```

Unit tests cover the caching hash (normalization + stability) and the LLM
response validation schema (accepts well-formed results, rejects malformed
ones) — deterministic, no database or network required.

## Non-goals

- No resume file upload/parsing (PDF/DOCX) — resume is pasted as plain text.
- No job-board scraping or browser extension — applications are entered manually.
- No team/multi-user collaboration features.

## Future ideas

- PDF export of the application pipeline + scores (reporting concept).
- Weekly digest email via a cron job.
- Resume file upload with text extraction.

## Deployment (stretch)

Free-tier deploy path: push this repo, then deploy on [Render](https://render.com)
(free web service) with a free [Neon](https://neon.tech) or [Supabase](https://supabase.com)
Postgres instance — no credit card required for either. Set the same environment
variables as `.env.example` in the host's dashboard.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./pool.js";
import { contentHash } from "../utils/hash.js";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "Demo1234!";

const RESUME_TEXT = `test dummy data
Backend Developer

Experience:
- 2 years building REST APIs with Node.js, Express, and PostgreSQL
- Built authentication systems with JWT and bcrypt
- Wrote background workers for async job processing
- Integrated third-party LLM APIs for text classification features
- Comfortable with Docker, git, and CI basics

Skills: JavaScript, TypeScript, Node.js, Express, PostgreSQL, SQL, Docker, REST APIs, Git`;

const JOB_DESCRIPTIONS = {
  flyrank: `Backend Engineer Intern — FlyRank
We are looking for a backend intern comfortable with Node.js or Python, SQL databases,
building REST APIs, and integrating third-party APIs including LLMs. Experience with
background jobs and caching is a plus. You will work on our internal tooling and
content pipeline.`,
  frontend: `Senior Frontend Engineer — PixelCraft
5+ years of React, Redux, and CSS architecture experience required. You will own our
design system, build pixel-perfect UI, and mentor junior frontend engineers. No backend
work required.`,
  dataEng: `Data Engineer — Northwind Analytics
Looking for someone with strong Python, Airflow, and Spark experience to build ETL
pipelines processing terabytes of data daily. dbt and Snowflake experience preferred.`,
};

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const { rows: userRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, resume_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET resume_text = EXCLUDED.resume_text
     RETURNING *`,
    [DEMO_EMAIL, passwordHash, "test dummy data", RESUME_TEXT]
  );
  const user = userRows[0];

  const applications = [
    { company: "FlyRank", role: "Backend Engineer Intern", jd: JOB_DESCRIPTIONS.flyrank, status: "interviewing" },
    { company: "PixelCraft", role: "Senior Frontend Engineer", jd: JOB_DESCRIPTIONS.frontend, status: "rejected" },
    { company: "Northwind Analytics", role: "Data Engineer", jd: JOB_DESCRIPTIONS.dataEng, status: "applied" },
  ];

  const appIds = [];
  for (const app of applications) {
    const { rows } = await pool.query(
      `INSERT INTO applications (user_id, company, role, job_description, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.id, app.company, app.role, app.jd, app.status]
    );
    appIds.push(rows[0].id);
  }

  // Pre-seed one match result so the demo works immediately, even before
  // a real GROQ_API_KEY is configured — this is what "seed / demo data"
  // means for a feature that otherwise needs a live LLM call.
  const resumeHash = contentHash(RESUME_TEXT);
  const jdHash = contentHash(JOB_DESCRIPTIONS.flyrank);

  const { rows: resultRows } = await pool.query(
    `INSERT INTO match_results
       (resume_hash, jd_hash, score, verdict, strengths, gaps, model, prompt_tokens, completion_tokens, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (resume_hash, jd_hash) DO UPDATE SET score = EXCLUDED.score
     RETURNING id`,
    [
      resumeHash,
      jdHash,
      88,
      "Strong match: backend stack, API, and LLM-integration experience line up well with the role.",
      JSON.stringify(["Node.js + Express + PostgreSQL match", "JWT auth experience", "Background job experience"]),
      JSON.stringify(["No direct content-pipeline experience"]),
      "seed-demo",
      0,
      0,
      0,
    ]
  );

  await pool.query(
    `INSERT INTO match_jobs (application_id, user_id, status, match_result_id, cached)
     VALUES ($1, $2, 'done', $3, false)`,
    [appIds[0], user.id, resultRows[0].id]
  );

  console.log("Seed complete.");
  console.log(`Demo login -> email: ${DEMO_EMAIL}  password: ${DEMO_PASSWORD}`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

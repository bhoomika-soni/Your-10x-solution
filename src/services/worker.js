import { pool } from "../db/pool.js";
import { scoreMatch } from "./llm.service.js";
import { findCachedResult, hashPair, storeResult } from "./cache.service.js";

// Concept 4 (background jobs): the LLM call is slow (seconds) and costs
// money, so it never runs inline on the request. The API only ever
// enqueues a row here; this poller is the thing that actually does the
// work, off the request path, one job at a time.

async function claimNextJob(client) {
  const { rows } = await client.query(
    `UPDATE match_jobs
     SET status = 'processing', updated_at = now()
     WHERE id = (
       SELECT id FROM match_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  return rows[0] ?? null;
}

async function processJob(job) {
  const { rows: appRows } = await pool.query(
    `SELECT a.job_description, u.resume_text
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [job.application_id]
  );
  const app = appRows[0];
  if (!app || !app.resume_text) {
    throw new Error("Application or resume text is missing");
  }

  const { resumeHash, jdHash } = hashPair(app.resume_text, app.job_description);

  const cached = await findCachedResult(resumeHash, jdHash);
  if (cached) {
    await pool.query(
      `UPDATE match_jobs SET status = 'done', match_result_id = $1, cached = true, updated_at = now() WHERE id = $2`,
      [cached.id, job.id]
    );
    return;
  }

  const scored = await scoreMatch(app.resume_text, app.job_description);
  const stored = await storeResult(resumeHash, jdHash, scored);

  await pool.query(
    `UPDATE match_jobs SET status = 'done', match_result_id = $1, cached = false, updated_at = now() WHERE id = $2`,
    [stored.id, job.id]
  );
}

async function tick() {
  const client = await pool.connect();
  let job;
  try {
    await client.query("BEGIN");
    job = await claimNextJob(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[worker] failed to claim job:", err.message);
    return;
  } finally {
    client.release();
  }

  if (!job) return;

  try {
    await processJob(job);
    console.log(`[worker] match job ${job.id} done`);
  } catch (err) {
    await pool.query(
      `UPDATE match_jobs SET status = 'failed', error = $1, updated_at = now() WHERE id = $2`,
      [err.message, job.id]
    );
    console.error(`[worker] match job ${job.id} failed:`, err.message);
  }
}

export function startWorker() {
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 3000);
  console.log(`[worker] polling for match jobs every ${intervalMs}ms`);
  const handle = setInterval(() => {
    tick().catch((err) => console.error("[worker] tick error:", err));
  }, intervalMs);
  return () => clearInterval(handle);
}

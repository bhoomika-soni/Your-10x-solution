import { pool } from "../db/pool.js";
import { contentHash } from "../utils/hash.js";

// Concept 6 (caching): a resume/job-description pair that has already been
// scored is never sent to the LLM again — the prior result is reused.

export function hashPair(resumeText, jobDescription) {
  return {
    resumeHash: contentHash(resumeText),
    jdHash: contentHash(jobDescription),
  };
}

export async function findCachedResult(resumeHash, jdHash) {
  const { rows } = await pool.query(
    `SELECT * FROM match_results WHERE resume_hash = $1 AND jd_hash = $2`,
    [resumeHash, jdHash]
  );
  return rows[0] ?? null;
}

export async function storeResult(resumeHash, jdHash, result) {
  const { rows } = await pool.query(
    `INSERT INTO match_results
       (resume_hash, jd_hash, score, verdict, strengths, gaps, model, prompt_tokens, completion_tokens, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (resume_hash, jd_hash) DO UPDATE SET score = EXCLUDED.score
     RETURNING *`,
    [
      resumeHash,
      jdHash,
      result.score,
      result.verdict,
      JSON.stringify(result.strengths),
      JSON.stringify(result.gaps),
      result.model,
      result.promptTokens,
      result.completionTokens,
      result.costUsd,
    ]
  );
  return rows[0];
}

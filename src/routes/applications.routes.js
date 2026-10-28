import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";
import { findCachedResult, hashPair } from "../services/cache.service.js";

const router = Router();
router.use(requireAuth);

const STATUSES = ["applied", "interviewing", "offer", "rejected"];

const CreateSchema = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  jobDescription: z.string().min(20, "Paste the full job description (at least 20 characters)"),
  status: z.enum(STATUSES).optional(),
  appliedAt: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateSchema = CreateSchema.partial();

async function loadOwnedApplication(userId, id) {
  const { rows } = await pool.query(
    "SELECT * FROM applications WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Application not found");
  return rows[0];
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = CreateSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO applications (user_id, company, role, job_description, status, applied_at, notes)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'applied'), COALESCE($6, CURRENT_DATE), $7)
       RETURNING *`,
      [
        req.userId,
        body.company,
        body.role,
        body.jobDescription,
        body.status,
        body.appliedAt,
        body.notes ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const statusFilter = req.query.status;
    if (statusFilter && !STATUSES.includes(statusFilter)) {
      throw new HttpError(400, `status must be one of: ${STATUSES.join(", ")}`);
    }

    const { rows } = await pool.query(
      `SELECT a.*,
              mr.score AS latest_score,
              mr.verdict AS latest_verdict
       FROM applications a
       LEFT JOIN LATERAL (
         SELECT mj.match_result_id
         FROM match_jobs mj
         WHERE mj.application_id = a.id AND mj.status = 'done'
         ORDER BY mj.updated_at DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN match_results mr ON mr.id = latest.match_result_id
       WHERE a.user_id = $1 AND ($2::application_status IS NULL OR a.status = $2)
       ORDER BY a.created_at DESC`,
      [req.userId, statusFilter ?? null]
    );
    res.json(rows);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const application = await loadOwnedApplication(req.userId, req.params.id);
    const { rows: jobs } = await pool.query(
      `SELECT mj.*, mr.score, mr.verdict, mr.strengths, mr.gaps, mr.model
       FROM match_jobs mj
       LEFT JOIN match_results mr ON mr.id = mj.match_result_id
       WHERE mj.application_id = $1
       ORDER BY mj.created_at DESC`,
      [application.id]
    );
    res.json({ ...application, matchJobs: jobs });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedApplication(req.userId, req.params.id);
    const body = UpdateSchema.parse(req.body);

    const { rows } = await pool.query(
      `UPDATE applications SET
         company = COALESCE($1, company),
         role = COALESCE($2, role),
         job_description = COALESCE($3, job_description),
         status = COALESCE($4, status),
         applied_at = COALESCE($5, applied_at),
         notes = COALESCE($6, notes),
         updated_at = now()
       WHERE id = $7
       RETURNING *`,
      [
        body.company,
        body.role,
        body.jobDescription,
        body.status,
        body.appliedAt,
        body.notes,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedApplication(req.userId, req.params.id);
    await pool.query("DELETE FROM applications WHERE id = $1", [req.params.id]);
    res.status(204).end();
  })
);

// Concepts 4 + 5 + 6 meet here: a cache hit resolves synchronously (free,
// instant); a cache miss enqueues a background job for the worker to pick
// up, and the caller polls GET /match-jobs/:id for the result.
router.post(
  "/:id/match",
  asyncHandler(async (req, res) => {
    const application = await loadOwnedApplication(req.userId, req.params.id);

    const { rows: userRows } = await pool.query("SELECT resume_text FROM users WHERE id = $1", [
      req.userId,
    ]);
    const resumeText = userRows[0]?.resume_text;
    if (!resumeText) {
      throw new HttpError(400, "Set your resume first: PATCH /me/resume");
    }

    const { resumeHash, jdHash } = hashPair(resumeText, application.job_description);
    const cached = await findCachedResult(resumeHash, jdHash);

    if (cached) {
      const { rows } = await pool.query(
        `INSERT INTO match_jobs (application_id, user_id, status, match_result_id, cached)
         VALUES ($1, $2, 'done', $3, true)
         RETURNING *`,
        [application.id, req.userId, cached.id]
      );
      return res.status(200).json({ ...rows[0], result: cached, cached: true });
    }

    const { rows } = await pool.query(
      `INSERT INTO match_jobs (application_id, user_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [application.id, req.userId]
    );
    res.status(202).json(rows[0]);
  })
);

export default router;

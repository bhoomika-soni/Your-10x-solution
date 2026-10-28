import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";

const router = Router();
router.use(requireAuth);

// Poll this after POST /applications/:id/match returns 202.
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT mj.*, mr.score, mr.verdict, mr.strengths, mr.gaps, mr.model
       FROM match_jobs mj
       LEFT JOIN match_results mr ON mr.id = mj.match_result_id
       WHERE mj.id = $1 AND mj.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!rows[0]) throw new HttpError(404, "Match job not found");
    res.json(rows[0]);
  })
);

export default router;

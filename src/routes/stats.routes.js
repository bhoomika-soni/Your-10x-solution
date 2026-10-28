import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);

// Surfaces the "10x number": how many match jobs were answered instantly
// from cache (no LLM call, $0) versus how many actually hit the LLM.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const byStatus = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM applications WHERE user_id = $1 GROUP BY status`,
      [req.userId]
    );

    const matchStats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE mj.status = 'done')::int AS completed_matches,
         COUNT(*) FILTER (WHERE mj.cached)::int AS cache_hits,
         COUNT(*) FILTER (WHERE mj.status = 'done' AND NOT mj.cached)::int AS llm_calls,
         ROUND(AVG(mr.score) FILTER (WHERE mj.status = 'done'))::int AS avg_score,
         COALESCE(SUM(mr.cost_usd) FILTER (WHERE NOT mj.cached), 0) AS total_llm_cost_usd
       FROM match_jobs mj
       LEFT JOIN match_results mr ON mr.id = mj.match_result_id
       WHERE mj.user_id = $1`,
      [req.userId]
    );

    res.json({
      applicationsByStatus: byStatus.rows,
      matching: matchStats.rows[0],
    });
  })
);

export default router;

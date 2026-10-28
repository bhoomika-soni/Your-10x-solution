import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";

const router = Router();
router.use(requireAuth);

const ResumeSchema = z.object({
  resumeText: z.string().min(50, "Paste your full resume text (at least 50 characters)"),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, email, name, resume_text, created_at FROM users WHERE id = $1",
      [req.userId]
    );
    if (!rows[0]) throw new HttpError(404, "User not found");
    res.json(rows[0]);
  })
);

router.patch(
  "/resume",
  asyncHandler(async (req, res) => {
    const { resumeText } = ResumeSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE users SET resume_text = $1, updated_at = now() WHERE id = $2
       RETURNING id, email, name, resume_text`,
      [resumeText, req.userId]
    );
    res.json(rows[0]);
  })
);

export default router;

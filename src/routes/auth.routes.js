import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toPublicUser(row) {
  return { id: row.id, email: row.email, name: row.name, resumeText: row.resume_text };
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, name } = RegisterSchema.parse(req.body);

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *`,
      [email, passwordHash, name]
    );

    const user = rows[0];
    res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user) throw new HttpError(401, "Invalid email or password");

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new HttpError(401, "Invalid email or password");

    res.json({ token: signToken(user.id), user: toPublicUser(user) });
  })
);

export default router;

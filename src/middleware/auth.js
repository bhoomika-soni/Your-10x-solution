import { verifyToken } from "../utils/jwt.js";

// Concept 3 (authentication): every route that mounts this middleware is
// actually protected — no token, wrong token, or expired token all fail
// the same way, with a 401 and no data leaked.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  try {
    req.userId = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

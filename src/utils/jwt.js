import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const EXPIRES_IN = "7d";

export function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, SECRET);
  return Number(payload.sub);
}

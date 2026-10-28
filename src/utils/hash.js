import { createHash } from "node:crypto";

// Normalizes text before hashing so trivial whitespace/case differences
// still land on the same cache entry (concept 6: caching).
export function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function contentHash(text) {
  return createHash("sha256").update(normalize(text)).digest("hex");
}

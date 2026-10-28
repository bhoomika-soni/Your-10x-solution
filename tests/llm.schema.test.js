import { test } from "node:test";
import assert from "node:assert/strict";
import { MatchResultSchema } from "../src/services/llm.service.js";

test("accepts a well-formed match result", () => {
  const result = MatchResultSchema.safeParse({
    score: 82,
    verdict: "Strong match on backend skills.",
    strengths: ["Node.js", "PostgreSQL"],
    gaps: ["No Kubernetes experience"],
  });
  assert.equal(result.success, true);
});

test("rejects a score outside 0-100", () => {
  const result = MatchResultSchema.safeParse({
    score: 150,
    verdict: "x",
    strengths: [],
    gaps: [],
  });
  assert.equal(result.success, false);
});

test("rejects a non-integer score", () => {
  const result = MatchResultSchema.safeParse({
    score: 82.5,
    verdict: "x",
    strengths: [],
    gaps: [],
  });
  assert.equal(result.success, false);
});

test("rejects a missing verdict", () => {
  const result = MatchResultSchema.safeParse({
    score: 50,
    strengths: [],
    gaps: [],
  });
  assert.equal(result.success, false);
});

test("rejects strengths that are not strings", () => {
  const result = MatchResultSchema.safeParse({
    score: 50,
    verdict: "x",
    strengths: [1, 2, 3],
    gaps: [],
  });
  assert.equal(result.success, false);
});

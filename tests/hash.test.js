import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, contentHash } from "../src/utils/hash.js";

test("normalize trims, lowercases, and collapses whitespace", () => {
  assert.equal(normalize("  Hello   World \n"), "hello world");
});

test("contentHash is stable for equivalent text", () => {
  const a = contentHash("Node.js Developer\n\nBuilds APIs");
  const b = contentHash("  node.js developer   builds apis  ");
  assert.equal(a, b, "hashes of equivalent normalized text must match — this is what makes the cache work");
});

test("contentHash differs for different text", () => {
  const a = contentHash("Backend Engineer");
  const b = contentHash("Frontend Engineer");
  assert.notEqual(a, b);
});

test("contentHash is a 64-char hex sha256 digest", () => {
  const h = contentHash("anything");
  assert.match(h, /^[0-9a-f]{64}$/);
});

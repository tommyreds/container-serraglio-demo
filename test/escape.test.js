import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, jsonPerHtml } from "../public/lib/escape.js";

test("escapeHtml neutralizza i tag", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`),
    "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(6.5), "6.5");
});

test("jsonPerHtml non chiude il tag script", () => {
  const s = jsonPerHtml({ a: "</script><b>&\u2028" });
  assert.ok(!s.includes("</script>") && !s.includes("<") && !s.includes("&") && !s.includes("\u2028"));
  assert.deepEqual(JSON.parse(s), { a: "</script><b>&\u2028" });
});

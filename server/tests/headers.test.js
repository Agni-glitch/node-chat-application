// Security headers when the server serves the React build (SERVE_CLIENT=true).
// Config is read once at startup, so each case runs in its own process.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

function headersWith(env) {
  const script = `
    const http = require("http");
    const app = require("./app");
    const s = http.createServer(app).listen(0, async () => {
      const r = await fetch("http://127.0.0.1:" + s.address().port + "/api/health");
      console.log(JSON.stringify({ csp: r.headers.get("content-security-policy"), hsts: r.headers.get("strict-transport-security") }));
      s.close();
    });`;
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", SKIP_DOTENV: "true", SERVE_CLIENT: "true", ...env },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop());
}

test("HTTPS_ONLY=true sends HSTS and upgrade-insecure-requests", () => {
  const h = headersWith({ HTTPS_ONLY: "true" });
  assert.match(h.csp, /upgrade-insecure-requests/);
  assert.match(h.hsts, /max-age=/);
});

test("HTTPS_ONLY=false keeps the CSP but works over plain http", () => {
  const h = headersWith({ HTTPS_ONLY: "false" });
  assert.match(h.csp, /script-src 'self'/);
  assert.doesNotMatch(h.csp, /upgrade-insecure-requests/);
  assert.equal(h.hsts, null);
});

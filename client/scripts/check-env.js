#!/usr/bin/env node
// Build-time guard for static deploys (Vercel, Netlify...) where the API lives on another origin.
// Without REACT_APP_API_URL the app would call its own host, get index.html back for every
// API request, and fail in confusing ways, so fail the build with a clear message instead.

const raw = (process.env.REACT_APP_API_URL || "").trim();

function fail(message) {
  console.error(`\n[check-env] ${message}\n`);
  console.error("Set REACT_APP_API_URL in your hosting provider's environment variables to the URL of the");
  console.error("deployed API server, e.g. https://quick-chat-api.onrender.com, then redeploy.");
  console.error("See docs/DEPLOYMENT.md#vercel--render.\n");
  process.exit(1);
}

if (!raw) fail("REACT_APP_API_URL is not set.");

let url;
try {
  url = new URL(raw);
} catch {
  fail(`REACT_APP_API_URL is not a valid URL: "${raw}"`);
}

const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
if (url.protocol !== "https:" && !isLocal) {
  fail(`REACT_APP_API_URL must use https:// in production (got "${raw}").`);
}
if (url.pathname.replace(/\/$/, "") !== "" || url.search || url.hash) {
  fail(`REACT_APP_API_URL must be an origin only, without a path such as /api (got "${raw}").`);
}

console.log(`[check-env] API URL: ${url.origin}`);

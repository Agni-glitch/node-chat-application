// Smoke/regression tests that run without a database.
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "http://localhost:3000";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../app");
const config = require("../config/env");

let server;
let base;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const json = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("health endpoint reports database state", async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.db, "down");
});

test("message routes require authentication", async () => {
  const get = await fetch(`${base}/api/message/get-all-messages/0123456789abcdef01234567`);
  assert.equal(get.status, 401);
  const post = await fetch(`${base}/api/message/new-message`, json({ chatId: "x", text: "hi" }));
  assert.equal(post.status, 401);
});

test("chat and user routes require authentication", async () => {
  for (const path of ["/api/chat/get-all-chats", "/api/user/get-logged-user", "/api/user/get-all-user"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 401, path);
  }
});

test("tokens signed with a different secret are rejected", async () => {
  const forged = jwt.sign({ userId: "0123456789abcdef01234567" }, "not-the-real-secret");
  const res = await fetch(`${base}/api/user/get-logged-user`, {
    headers: { authorization: `Bearer ${forged}` },
  });
  assert.equal(res.status, 401);
});

test("tokens without a user id are rejected", async () => {
  const token = jwt.sign({ foo: "bar" }, config.jwtSecret);
  const res = await fetch(`${base}/api/chat/close-chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 401);
});

test("OTP and password-reset endpoints validate input", async () => {
  const cases = [
    ["/api/auth/verify-email", { email: "not-an-email", otp: "123456" }],
    ["/api/auth/resend-otp", { email: "" }],
    ["/api/auth/forgot-password", { email: "nope" }],
    ["/api/auth/reset-password", { email: "a@b.co", otp: "123456", password: "short" }],
  ];
  for (const [path, body] of cases) {
    const res = await fetch(base + path, json(body));
    assert.equal(res.status, 400, path);
  }
});

test("public config exposes the disappearing-message timer", async () => {
  const res = await fetch(`${base}/api/config`);
  const body = await res.json();
  assert.equal(body.data.seenMessageTtlSeconds, 120);
});

test("signup validates input", async () => {
  const res = await fetch(
    `${base}/api/auth/signup`,
    json({ firstname: "A", lastname: "B", email: "a@b.co", password: "short" })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).success, false);

  const badEmail = await fetch(
    `${base}/api/auth/signup`,
    json({ firstname: "A", lastname: "B", email: "nope", password: "longenough123" })
  );
  assert.equal(badEmail.status, 400);
});

test("login requires email and password", async () => {
  const res = await fetch(`${base}/api/auth/login`, json({ email: "" }));
  assert.equal(res.status, 400);
});

test("malformed JSON returns 400", async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad json",
  });
  assert.equal(res.status, 400);
});

test("unknown API routes return JSON 404", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});

test("CORS only allows configured origins", async () => {
  const allowed = await fetch(`${base}/api/health`, { headers: { origin: "http://localhost:3000" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:3000");
  const denied = await fetch(`${base}/api/health`, { headers: { origin: "https://evil.example" } });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

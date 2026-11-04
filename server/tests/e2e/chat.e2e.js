// End-to-end test: starts the real server against a throwaway MongoDB database and walks
// through sign-up, realtime messaging, disappearing messages, groups and password reset.
//
//   npm run test:e2e --prefix server
//
// Needs a MongoDB you don't mind wiping. The database named in E2E_MONGODB_URI is DROPPED
// before and after the run. Defaults to mongodb://127.0.0.1:27017/quick-chat-e2e.
// Takes ~25 s, because it waits for the disappearing-message sweeper.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const mongoose = require("mongoose");
const { io } = require("socket.io-client");

const MONGO_URI = process.env.E2E_MONGODB_URI || "mongodb://127.0.0.1:27017/quick-chat-e2e";
const PASSWORD = "Password123!";

let server;
let base;
let logs = "";
const tokens = {};
const events = [];
let socket;

function assertThrowawayDb() {
  const host = MONGO_URI.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, "").split(/[/:?,]/)[0];
  const local = ["127.0.0.1", "localhost", "mongo", "host.docker.internal"].includes(host);
  if (!local && process.env.E2E_ALLOW_REMOTE !== "true") {
    throw new Error(`E2E tests drop their database; refusing to use non-local host "${host}". Set E2E_ALLOW_REMOTE=true to override.`);
  }
}

async function dropDb() {
  const conn = await mongoose.createConnection(MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
  await conn.dropDatabase();
  await conn.close();
}

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function api(method, url, body, token) {
  const res = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

/** Latest OTP code printed by the console mailer for an address. */
function codeFor(email, kind = "") {
  const re = new RegExp(`To: ${email.replace(/[.@+]/g, "\\$&")}\\nSubject: [^\\n]*${kind}[\\s\\S]*?Your code: (\\d{6})`, "g");
  const all = [...logs.matchAll(re)];
  return all.length ? all[all.length - 1][1] : null;
}

const userId = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url")).userId;

before(async () => {
  assertThrowawayDb();
  await dropDb();
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      SKIP_DOTENV: "true", // never read a developer's real server/.env
      NODE_ENV: "development",
      PORT: String(port),
      MONGODB_URI: MONGO_URI,
      JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      CLIENT_URL: "http://localhost:3000",
      SMTP_HOST: "", // print OTP emails to stdout so the test can read the codes
      EMAIL_MX_CHECK: "false",
      AUTH_RATE_LIMIT: "1000",
      SEEN_MESSAGE_TTL_SECONDS: "10",
      MESSAGE_SWEEP_INTERVAL_SECONDS: "5",
      OTP_RESEND_COOLDOWN_SECONDS: "1",
    },
  });
  server.stdout.on("data", (d) => (logs += d));
  server.stderr.on("data", (d) => (logs += d));
  server.on("exit", (code) => {
    if (code) logs += `\n[server exited with code ${code}]`;
  });
  await waitFor(async () => (await fetch(`${base}/api/health`).catch(() => null))?.ok, 20000, "server to start");
});

after(async () => {
  socket?.close();
  server?.kill();
  await dropDb().catch(() => {});
});

// Print the server log when something fails, to make CI failures debuggable.
process.on("exit", (code) => {
  if (code) console.error("\n---- server log (tail) ----\n" + logs.split("\n").slice(-40).join("\n"));
});

test("health check reports the database as up", async () => {
  const r = await api("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.db, "up");
});

test("users sign up and verify their email with a code", async () => {
  for (const name of ["ann", "ben", "cat"]) {
    const email = `${name}@example.com`;
    const s = await api("POST", "/api/auth/signup", { firstname: name, lastname: "Test", email, password: PASSWORD });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    const code = await waitFor(() => codeFor(email, "verification"), 5000, `verification code for ${email}`);
    const v = await api("POST", "/api/auth/verify-email", { email, otp: code });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    tokens[name] = v.body.token;
  }
});

test("login works and duplicate emails are rejected", async () => {
  const ok = await api("POST", "/api/auth/login", { email: "ann@example.com", password: PASSWORD });
  assert.equal(ok.status, 200);
  const bad = await api("POST", "/api/auth/login", { email: "ann@example.com", password: "wrong-password" });
  assert.equal(bad.status, 401);
  const dup = await api("POST", "/api/auth/signup", { firstname: "x", lastname: "y", email: "ANN@example.com", password: PASSWORD });
  assert.equal(dup.status, 409);
});

test("profile links are validated and saved", async () => {
  const r = await api("PUT", "/api/user/social-links", { socialLinks: { github: "github.com/ann" } }, tokens.ann);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.socialLinks.github, "https://github.com/ann");
});

let chatId;
let messageId;

test("a direct message is delivered over Socket.IO", async () => {
  socket = io(base, { auth: { token: tokens.ben }, transports: ["websocket"] });
  socket.onAny((event, payload) => events.push({ event, payload }));
  await waitFor(() => socket.connected, 5000, "socket to connect");

  const chat = await api("POST", "/api/chat/create-new-chat", { userId: userId(tokens.ben) }, tokens.ann);
  assert.ok([200, 201].includes(chat.status), JSON.stringify(chat.body));
  chatId = chat.body.data._id;

  const sent = await api("POST", "/api/message/new-message", { chatId, text: "hello ben" }, tokens.ann);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  messageId = sent.body.data._id;

  await waitFor(() => events.find((e) => e.event === "receive-message" && e.payload._id === messageId), 5000, "receive-message");
  const history = await api("GET", `/api/message/get-all-messages/${chatId}`, null, tokens.ben);
  assert.equal(history.body.data.length, 1);
});

test("outsiders can't read a chat", async () => {
  const r = await api("GET", `/api/message/get-all-messages/${chatId}`, null, tokens.cat);
  assert.equal(r.status, 404);
});

test("a seen message disappears after the TTL", async () => {
  const read = await api("POST", "/api/chat/clear-unread-messages", { chatId }, tokens.ben);
  assert.equal(read.status, 200, JSON.stringify(read.body));
  await waitFor(
    () => events.find((e) => e.event === "messages-deleted" && e.payload.messageIds.includes(messageId)),
    25000,
    "messages-deleted"
  );
  const history = await api("GET", `/api/message/get-all-messages/${chatId}`, null, tokens.ben);
  assert.equal(history.body.data.length, 0);
});

test("groups can be created, renamed and edited", async () => {
  const g = await api("POST", "/api/chat/groups", { name: "Crew", memberIds: [userId(tokens.ben), userId(tokens.cat)] }, tokens.ann);
  assert.equal(g.status, 201, JSON.stringify(g.body));
  const groupId = g.body.data._id;

  const renamed = await api("PUT", `/api/chat/groups/${groupId}`, { name: "Crew 2" }, tokens.ann);
  assert.equal(renamed.body.data.name, "Crew 2");

  const notAdmin = await api("PUT", `/api/chat/groups/${groupId}`, { name: "Hijacked" }, tokens.ben);
  assert.equal(notAdmin.status, 403);

  const removed = await api("DELETE", `/api/chat/groups/${groupId}/members/${userId(tokens.cat)}`, null, tokens.ann);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));

  const msg = await api("POST", "/api/message/new-message", { chatId: groupId, text: "hi group" }, tokens.ben);
  assert.equal(msg.status, 201);
});

test("a password reset signs out existing sessions", async () => {
  const oldToken = tokens.cat;
  const f = await api("POST", "/api/auth/forgot-password", { email: "cat@example.com" });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  const code = await waitFor(() => codeFor("cat@example.com", "password reset"), 5000, "reset code");
  const r = await api("POST", "/api/auth/reset-password", { email: "cat@example.com", otp: code, password: "NewPassword123!" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = await api("GET", "/api/user/get-logged-user", null, oldToken);
  assert.equal(me.status, 401);
});

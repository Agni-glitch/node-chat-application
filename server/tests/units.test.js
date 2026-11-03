process.env.NODE_ENV = "test";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSocialLinks } = require("../utils/socialLinks");
const { generateCode, hashCode } = require("../utils/otp");

test("social links are normalised to https URLs on the right domain", () => {
  const out = normalizeSocialLinks({
    instagram: "instagram.com/someone",
    twitter: "https://x.com/someone",
    github: "https://www.github.com/someone/",
    website: "example.org",
    facebook: "",
  });
  assert.equal(out.instagram, "https://instagram.com/someone");
  assert.equal(out.twitter, "https://x.com/someone");
  assert.equal(out.github, "https://www.github.com/someone/");
  assert.equal(out.website, "https://example.org/");
  assert.equal(out.facebook, undefined, "empty values remove the link");
});

test("social links reject wrong domains, unsafe schemes and unknown platforms", () => {
  const bad = [
    { instagram: "https://evil.com/instagram.com" },
    { instagram: "https://instagram.com.evil.com/me" },
    { twitter: "javascript:alert(1)" },
    { website: "ftp://example.org" },
    { github: "https://github.com" },
    { myspace: "https://myspace.com/me" },
    { website: "https://user:pass@example.org" },
  ];
  for (const input of bad) {
    assert.throws(() => normalizeSocialLinks(input), { status: 400 }, JSON.stringify(input));
  }
  assert.throws(() => normalizeSocialLinks(["x"]), { status: 400 });
});

test("OTP codes are 6 digits and hashes are bound to email and purpose", () => {
  for (let i = 0; i < 50; i++) assert.match(generateCode(), /^\d{6}$/);
  const h = hashCode("a@b.co", "verify", "123456");
  assert.equal(h, hashCode("a@b.co", "verify", "123456"));
  assert.notEqual(h, hashCode("a@b.co", "reset", "123456"));
  assert.notEqual(h, hashCode("c@d.co", "verify", "123456"));
});

const config = require("../config/env");
const { parseMentions, stripMentions } = require("../services/ai");
const { shorten, normalizeTurns } = require("../services/ai/providers");
const { isPrivateIp, assertSafeBaseUrl } = require("../utils/net");
const { encrypt, decrypt } = require("../utils/crypto");
const { validate } = require("../controllers/botController");

test("mentions are parsed case-insensitively and stripped from the prompt", () => {
  assert.deepEqual(parseMentions("@Alen what is 2+2? cc @pix @alen"), ["alen", "pix"]);
  assert.deepEqual(parseMentions("email me at bob@alen.com"), [], "emails are not mentions");
  assert.deepEqual(parseMentions("@@alen"), []);
  assert.equal(stripMentions("@Alen  what is 2+2? @someone", ["alen"]), "what is 2+2? @someone");
});

test("replies are kept short", () => {
  const long = "First sentence here. ".repeat(60);
  const out = shorten(long, 200);
  assert.ok(out.length <= 200);
  assert.ok(out.endsWith("."));
  assert.equal(shorten("  hi  "), "hi");
  assert.ok(shorten("x".repeat(50) + " " + "y".repeat(300), 100).endsWith("…"));
});

test("conversation turns are merged and start with the user", () => {
  const turns = normalizeTurns([
    { role: "assistant", content: "hello" },
    { role: "user", content: "a" },
    { role: "user", content: "b" },
    { role: "assistant", content: "c" },
    { role: "user", content: "" },
  ]);
  assert.deepEqual(turns, [
    { role: "user", content: "a\nb" },
    { role: "assistant", content: "c" },
  ]);
});

test("private and internal addresses are detected", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "104.18.2.1", "2606:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});

test("custom base URLs must be public https when private endpoints are disabled", () => {
  const prev = config.ai.allowPrivateEndpoints;
  config.ai.allowPrivateEndpoints = false;
  try {
    assert.equal(assertSafeBaseUrl("https://openrouter.ai/api/v1/"), "https://openrouter.ai/api/v1");
    for (const bad of ["http://api.example.com/v1", "https://localhost:11434/v1", "https://169.254.169.254/latest", "https://10.0.0.5/v1", "https://user:pw@api.example.com", "ftp://x.com", "nope"]) {
      assert.throws(() => assertSafeBaseUrl(bad), { status: 400 }, bad);
    }
  } finally {
    config.ai.allowPrivateEndpoints = prev;
  }
});

test("API keys are encrypted with AES-GCM and tampering is detected", () => {
  const box = encrypt("sk-test-1234567890");
  assert.ok(!JSON.stringify(box).includes("sk-test"));
  assert.equal(decrypt(box), "sk-test-1234567890");
  const tampered = { ...box, data: Buffer.from("garbage!").toString("base64") };
  assert.throws(() => decrypt(tampered));
});

test("AI model input is validated", () => {
  const ok = validate({ name: "Alen", kind: "chat", provider: "openai", model: "gpt-5.5", apiKey: "sk-abc1234" });
  assert.equal(ok.nameLower, "alen");
  assert.equal(ok.apiKeyLast4, "1234");
  assert.ok(ok.apiKey.data);
  const bad = [
    { name: "1bad", kind: "chat", provider: "openai", model: "gpt-5.5", apiKey: "k" },
    { name: "has space", kind: "chat", provider: "openai", model: "gpt-5.5", apiKey: "k" },
    { name: "Pix", kind: "image", provider: "anthropic", model: "claude", apiKey: "k" },
    { name: "Alen", kind: "chat", provider: "openai", model: "gpt-5.5" },
    { name: "Alen", kind: "chat", provider: "openai-compatible", model: "llama3" },
    { name: "Alen", kind: "chat", provider: "nope", model: "x", apiKey: "k" },
    { name: "Alen", kind: "chat", provider: "openai", model: "bad model id", apiKey: "k" },
  ];
  for (const b of bad) assert.throws(() => validate(b), { status: 400 }, JSON.stringify(b));
});

const { createOriginMatcher } = require("../utils/origins");

test("CORS origins match exactly, ignoring case and a trailing slash", () => {
  const allowed = createOriginMatcher(["https://chat.example.com", "http://localhost:3000"]);
  assert.equal(allowed("https://chat.example.com"), true);
  assert.equal(allowed("https://Chat.Example.com/"), true);
  assert.equal(allowed("http://localhost:3000"), true);
  assert.equal(allowed("http://chat.example.com"), false, "scheme must match");
  assert.equal(allowed("https://chat.example.com.evil.com"), false);
  assert.equal(allowed(undefined), false);
});

test("CORS wildcard patterns match one hostname label only", () => {
  const allowed = createOriginMatcher(["https://quick-chat-*.vercel.app"]);
  assert.equal(allowed("https://quick-chat-git-feature-agni.vercel.app"), true);
  assert.equal(allowed("https://quick-chat-abc123.vercel.app"), true);
  assert.equal(allowed("https://quick-chat-.vercel.app"), false, "* needs at least one character");
  assert.equal(allowed("https://quick-chat-a.b.vercel.app"), false, "* never matches a dot");
  assert.equal(allowed("https://evil.com/quick-chat-x.vercel.app"), false);
  assert.equal(allowed("http://quick-chat-x.vercel.app"), false);
  assert.equal(allowed("https://other-x.vercel.app"), false);
});

test("CORS patterns that are too broad or malformed are rejected at startup", () => {
  for (const bad of ["https://*.app", "https://*.*", "https://foo.*.app", "*.vercel.app", "https://x.com/path"]) {
    assert.throws(() => createOriginMatcher([bad]), /Invalid CLIENT_URL/, bad);
  }
});

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

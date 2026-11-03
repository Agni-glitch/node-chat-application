const dns = require("dns").promises;
const config = require("../config/env");
const HttpError = require("./httpError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v) => (typeof v === "string" ? v.trim() : "");
const normalizeEmail = (v) => str(v).toLowerCase();

function assertEmail(email) {
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new HttpError(400, "Please enter a valid email address");
  }
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new HttpError(400, "Password must be between 8 and 128 characters");
  }
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

/**
 * Rejects email domains that cannot receive mail (no MX/A records, or a "null MX").
 * DNS outages and timeouts are not treated as invalid; the OTP is the real proof of ownership.
 */
async function assertDeliverableDomain(email) {
  if (!config.emailMxCheck) return;
  const domain = email.split("@")[1];
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000);
    if (mx.some((r) => r.exchange && r.exchange !== ".")) return;
    throw new HttpError(400, `The domain "${domain}" does not accept email`);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      // No MX: RFC 5321 falls back to the A/AAAA record.
      try {
        await withTimeout(dns.lookup(domain), 4000);
        return;
      } catch {
        throw new HttpError(400, `The email domain "${domain}" does not exist`);
      }
    }
    // Timeouts / resolver errors: don't block sign-up.
  }
}

module.exports = { str, normalizeEmail, assertEmail, assertPassword, assertDeliverableDomain };

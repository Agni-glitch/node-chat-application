const crypto = require("crypto");
const config = require("../config/env");
const Otp = require("../model/otp");
const HttpError = require("./httpError");
const { sendOtpEmail } = require("./mailer");

const generateCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

// HMAC with the server secret: fast, and useless to an attacker without the secret.
const hashCode = (email, purpose, code) =>
  crypto.createHmac("sha256", config.jwtSecret).update(`${purpose}:${email}:${code}`).digest("hex");

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Creates a new code and emails it, unless one was sent within the cooldown window.
 * Returns { sent, retryAfter } where retryAfter is in seconds.
 */
async function issueOtp(email, purpose) {
  const existing = await Otp.findOne({ email, purpose }).lean();
  if (existing) {
    const elapsed = (Date.now() - new Date(existing.updatedAt).getTime()) / 1000;
    if (elapsed < config.otp.resendCooldownSeconds && existing.expiresAt > new Date()) {
      return { sent: false, retryAfter: Math.ceil(config.otp.resendCooldownSeconds - elapsed) };
    }
  }
  const code = generateCode();
  await Otp.findOneAndUpdate(
    { email, purpose },
    {
      codeHash: hashCode(email, purpose, code),
      attempts: 0,
      expiresAt: new Date(Date.now() + config.otp.ttlMinutes * 60 * 1000),
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  await sendOtpEmail(email, code, purpose);
  return { sent: true, retryAfter: config.otp.resendCooldownSeconds };
}

/** Throws a 400 HttpError unless the code is valid. A valid code is consumed. */
async function consumeOtp(email, purpose, code) {
  if (!/^\d{6}$/.test(String(code || ""))) {
    throw new HttpError(400, "Enter the 6-digit code from the email");
  }
  const otp = await Otp.findOne({ email, purpose });
  if (!otp || otp.expiresAt <= new Date()) {
    if (otp) await otp.deleteOne();
    throw new HttpError(400, "This code has expired. Request a new one.");
  }
  if (otp.attempts >= config.otp.maxAttempts) {
    await otp.deleteOne();
    throw new HttpError(429, "Too many incorrect attempts. Request a new code.");
  }
  if (!safeEqual(otp.codeHash, hashCode(email, purpose, String(code)))) {
    otp.attempts += 1;
    await otp.save();
    const left = config.otp.maxAttempts - otp.attempts;
    throw new HttpError(400, left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Request a new code.");
  }
  await otp.deleteOne();
}

module.exports = { issueOtp, consumeOtp, generateCode, hashCode };

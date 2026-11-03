const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../model/user");
const config = require("../config/env");
const { signToken } = require("../middlewares/authmiddleware");
const { issueOtp, consumeOtp } = require("../utils/otp");
const { disconnectUser } = require("../socket");
const {
  str,
  normalizeEmail,
  assertEmail,
  assertPassword,
  assertDeliverableDomain,
} = require("../utils/validation");

const unverifiedExpiry = () => new Date(Date.now() + config.unverifiedAccountTtlHours * 3600 * 1000);

/**
 * Step 1 of sign-up: create (or refresh) an unverified account and email a code.
 * Unverified accounts can't log in and are deleted automatically after
 * UNVERIFIED_ACCOUNT_TTL_HOURS, so nobody can permanently claim someone else's email.
 */
router.post("/signup", async (req, res) => {
  const firstname = str(req.body?.firstname);
  const lastname = str(req.body?.lastname);
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!firstname || !lastname) {
    return res.status(400).send({ message: "First and last name are required", success: false });
  }
  if (firstname.length > 50 || lastname.length > 50) {
    return res.status(400).send({ message: "Names must be 50 characters or fewer", success: false });
  }
  assertEmail(email);
  assertPassword(password);

  const existing = await User.findOne({ email }).select("emailVerified");
  if (existing?.emailVerified) {
    return res.status(409).send({ message: "An account with this email already exists", success: false });
  }

  await assertDeliverableDomain(email);
  const hashedPassword = await bcrypt.hash(password, 12);

  if (existing) {
    // Someone signed up with this email but never verified it: start over with the new details.
    existing.set({ firstname, lastname, password: hashedPassword, expiresAt: unverifiedExpiry() });
    await existing.save();
  } else {
    await User.create({ firstname, lastname, email, password: hashedPassword, emailVerified: false, expiresAt: unverifiedExpiry() });
  }

  const { retryAfter } = await issueOtp(email, "verify");
  res.status(201).send({
    message: `We sent a 6-digit code to ${email}`,
    success: true,
    data: { email, retryAfter },
  });
});

/** Step 2 of sign-up: confirm the code. Logs the user in on success. */
router.post("/verify-email", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  assertEmail(email);

  const user = await User.findOne({ email }).select("+tokenVersion emailVerified");
  if (!user) {
    return res.status(400).send({ message: "This code has expired. Please sign up again.", success: false });
  }
  if (user.emailVerified) {
    return res.status(409).send({ message: "This email is already verified. Please log in.", success: false });
  }

  await consumeOtp(email, "verify", req.body?.otp);

  user.emailVerified = true;
  user.expiresAt = undefined;
  await user.save();

  res.send({ message: "Email verified. Welcome to Quick Chat!", success: true, token: signToken(user) });
});

/** Re-sends a verification code (rate limited by OTP_RESEND_COOLDOWN_SECONDS). */
router.post("/resend-otp", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  assertEmail(email);

  const user = await User.findOne({ email }).select("emailVerified");
  // Same response for unknown/verified emails so this can't be used to probe accounts.
  if (user && !user.emailVerified) {
    const { sent, retryAfter } = await issueOtp(email, "verify");
    if (!sent) {
      return res.status(429).send({ message: `Please wait ${retryAfter}s before requesting another code`, success: false, data: { retryAfter } });
    }
    return res.send({ message: `A new code was sent to ${email}`, success: true, data: { retryAfter } });
  }
  res.send({ message: `If ${email} is awaiting verification, a new code was sent`, success: true, data: { retryAfter: config.otp.resendCooldownSeconds } });
});

router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    return res.status(400).send({ message: "Email and password are required", success: false });
  }

  const user = await User.findOne({ email }).select("+password +tokenVersion emailVerified");
  const isValid = user ? await bcrypt.compare(password, user.password) : false;
  if (!isValid) {
    return res.status(401).send({ message: "Invalid email or password", success: false });
  }

  // Covers new sign-ups and accounts created before email verification existed.
  if (!user.emailVerified) {
    const { retryAfter } = await issueOtp(email, "verify");
    return res.status(403).send({
      message: "Please verify your email. We sent a 6-digit code to your inbox.",
      success: false,
      needsVerification: true,
      data: { email, retryAfter },
    });
  }

  res.send({ message: "Logged in successfully", success: true, token: signToken(user) });
});

/** Emails a password reset code. Always responds the same way to avoid revealing accounts. */
router.post("/forgot-password", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  assertEmail(email);

  let retryAfter = config.otp.resendCooldownSeconds;
  if (await User.exists({ email })) {
    const result = await issueOtp(email, "reset");
    if (!result.sent) {
      return res.status(429).send({ message: `Please wait ${result.retryAfter}s before requesting another code`, success: false, data: { retryAfter: result.retryAfter } });
    }
    retryAfter = result.retryAfter;
  }
  res.send({
    message: `If an account exists for ${email}, we sent a reset code to it`,
    success: true,
    data: { email, retryAfter },
  });
});

/** Sets a new password using the emailed code, and signs out every existing session. */
router.post("/reset-password", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  assertEmail(email);
  assertPassword(req.body?.password);

  await consumeOtp(email, "reset", req.body?.otp);

  const user = await User.findOne({ email }).select("+tokenVersion");
  if (!user) {
    return res.status(400).send({ message: "This code has expired. Request a new one.", success: false });
  }
  user.password = await bcrypt.hash(req.body.password, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.emailVerified = true; // receiving the code proves ownership of the address
  user.expiresAt = undefined;
  await user.save();
  disconnectUser(user._id);

  res.send({ message: "Password updated. You can now log in.", success: true });
});

module.exports = router;

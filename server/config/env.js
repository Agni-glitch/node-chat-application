const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
const isTest = NODE_ENV === "test";

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function list(value) {
  return (value || "")
    .split(",")
    .map((v) => v.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

const jwtSecret = isTest ? process.env.JWT_SECRET || "test-secret-test-secret-test-secret" : required("JWT_SECRET");
if (isProduction && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

const clientUrls = list(process.env.CLIENT_URL);
if (clientUrls.length === 0) {
  if (isProduction && process.env.SERVE_CLIENT !== "true") {
    throw new Error("CLIENT_URL is required in production (comma-separated list of allowed origins)");
  }
  clientUrls.push("http://localhost:3000");
}

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: isTest ? process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/quick-chat-test" : required("MONGODB_URI"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  clientUrls,
  serveClient: process.env.SERVE_CLIENT === "true",
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : isProduction ? 1 : 0,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || "chat-app",
  },
  maxImageBytes: (Number(process.env.MAX_IMAGE_MB) || 5) * 1024 * 1024,

  // Disappearing messages
  seenMessageTtlSeconds: Math.max(10, Number(process.env.SEEN_MESSAGE_TTL_SECONDS) || 120),
  messageSweepIntervalMs: Math.max(5, Number(process.env.MESSAGE_SWEEP_INTERVAL_SECONDS) || 15) * 1000,

  // One-time passwords (email verification + password reset)
  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES) || 10,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
  },
  groupMaxMembers: Number(process.env.GROUP_MAX_MEMBERS) || 50,
  unverifiedAccountTtlHours: Number(process.env.UNVERIFIED_ACCOUNT_TTL_HOURS) || 24,
  emailMxCheck: process.env.EMAIL_MX_CHECK ? process.env.EMAIL_MX_CHECK === "true" : !isTest,

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "Quick Chat <no-reply@localhost>",
  },
};

config.cloudinary.enabled = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret
);

// AI models (bring your own API key)
const aiKeysSecret = (process.env.AI_KEYS_SECRET || "").trim();
config.ai = {
  // Encrypts users' provider API keys at rest. Required in production for AI features.
  keysSecret: aiKeysSecret || (isProduction ? "" : `dev-only:${jwtSecret}`),
  maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS) || 800,
  maxReplyChars: Number(process.env.AI_MAX_REPLY_CHARS) || 500,
  requestTimeoutMs: (Number(process.env.AI_REQUEST_TIMEOUT_SECONDS) || 90) * 1000,
  ratePerMinute: Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 20,
  maxBotsPerUser: Number(process.env.AI_MAX_BOTS_PER_USER) || 10,
  historyMessages: Number(process.env.AI_HISTORY_MESSAGES) || 10,
  // Allow custom endpoints on localhost/private networks (e.g. a local Ollama). Off in production.
  allowPrivateEndpoints: process.env.ALLOW_PRIVATE_AI_ENDPOINTS
    ? process.env.ALLOW_PRIVATE_AI_ENDPOINTS === "true"
    : !isProduction,
};
config.ai.enabled = Boolean(config.ai.keysSecret);
if (isProduction && aiKeysSecret && aiKeysSecret.length < 32) {
  throw new Error("AI_KEYS_SECRET must be at least 32 characters");
}

config.smtp.enabled = Boolean(config.smtp.host);
if (isProduction && !config.smtp.enabled) {
  throw new Error("SMTP_HOST (and usually SMTP_USER/SMTP_PASS/MAIL_FROM) is required in production to send verification emails");
}

module.exports = config;

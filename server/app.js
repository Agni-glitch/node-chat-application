const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const config = require("./config/env");
const authRouter = require("./controllers/authController");
const userRouter = require("./controllers/userController");
const chatRouter = require("./controllers/chatController");
const messageRouter = require("./controllers/messageController");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

/** CORS origin check shared by Express and Socket.IO. */
function corsOrigin(origin, callback) {
  // Requests without an Origin header (curl, health checks, same-origin) are allowed.
  if (!origin || config.clientUrls.includes(origin.replace(/\/$/, ""))) return callback(null, true);
  return callback(null, false);
}

app.use(
  helmet({
    contentSecurityPolicy: config.serveClient
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            // 'unsafe-inline' is needed for React style props and react-hot-toast's injected styles.
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
            connectSrc: ["'self'", "ws:", "wss:"],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(compression());
if (!config.isTest) app.use(morgan(config.isProduction ? "combined" : "dev"));

// Base64 images are ~37% larger than the binary file, plus some room for JSON overhead.
const bodyLimit = Math.ceil(config.maxImageBytes * 1.4) + 64 * 1024;
app.use(express.json({ limit: bodyLimit }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down", success: false },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later", success: false },
});

app.get("/api/health", (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).send({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down", uptime: process.uptime() });
});

// Public settings the client needs (no secrets).
app.get("/api/config", (req, res) => {
  res.send({
    success: true,
    data: {
      seenMessageTtlSeconds: config.seenMessageTtlSeconds,
      maxImageMb: Math.round(config.maxImageBytes / 1024 / 1024),
      otpResendCooldownSeconds: config.otp.resendCooldownSeconds,
      serverTime: Date.now(),
    },
  });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/message", messageRouter);
app.use("/api", notFound);

// Optionally serve the React production build from the same origin.
const clientBuild = path.join(__dirname, "..", "client", "build");
if (config.serveClient && fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild, { maxAge: "1y", index: false }));
  app.get("/{*splat}", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(clientBuild, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
module.exports.corsOrigin = corsOrigin;

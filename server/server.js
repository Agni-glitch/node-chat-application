const http = require("http");
const config = require("./config/env");
const { connectDB, disconnectDB } = require("./config/dbConfig");
const app = require("./app");
const { initSocket, closeSocket } = require("./socket");
const { startMessageSweeper, stopMessageSweeper } = require("./services/messageCleanup");

const server = http.createServer(app);
initSocket(server, app.corsOrigin);

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error("[db] initial connection failed:", err.message);
    process.exit(1);
  }
  await startMessageSweeper();
  server.listen(config.port, () => {
    console.log(`[server] ${config.nodeEnv} mode, listening on port ${config.port}`);
    console.log(`[server] seen messages are deleted after ${config.seenMessageTtlSeconds}s`);
    if (!config.smtp.enabled) console.log("[server] SMTP not configured: OTP emails are printed to this console");
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);
  const forceExit = setTimeout(() => process.exit(1), 10000).unref();
  try {
    stopMessageSweeper();
    await closeSocket();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error("[server] error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("[server] unhandled rejection:", reason));

start();

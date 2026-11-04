#!/usr/bin/env node
// One-time local setup: creates server/.env and client/.env.local from the examples,
// with fresh random secrets and local defaults. Never overwrites existing files.
//
//   npm run setup

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const secret = () => crypto.randomBytes(48).toString("hex");

const [major] = process.versions.node.split(".").map(Number);
if (major < 24) {
  console.warn(`! Node ${process.versions.node} detected. This project needs Node 24+ (run "nvm use").\n`);
}

function createFrom(example, target, edit) {
  const targetPath = path.join(root, target);
  if (fs.existsSync(targetPath)) {
    console.log(`- ${target} already exists, leaving it alone`);
    return;
  }
  let text = fs.readFileSync(path.join(root, example), "utf8");
  if (edit) text = edit(text);
  fs.writeFileSync(targetPath, text);
  console.log(`✓ created ${target}`);
}

const set = (text, key, value) => {
  const line = new RegExp(`^${key}=.*$`, "m");
  return line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
};

createFrom("server/.env.example", "server/.env", (t) => {
  t = set(t, "MONGODB_URI", "mongodb://127.0.0.1:27017/quick-chat");
  t = set(t, "JWT_SECRET", secret());
  t = set(t, "AI_KEYS_SECRET", secret());
  // Empty SMTP_HOST: verification codes are printed to the server console.
  // Using Mailpit from docker compose instead? Set SMTP_HOST=localhost and SMTP_PORT=1025.
  t = set(t, "SMTP_HOST", "");
  t = set(t, "EMAIL_MX_CHECK", "false");
  return t;
});
createFrom("client/.env.example", "client/.env.local");

const installed = ["server", "client"].every((d) => fs.existsSync(path.join(root, d, "node_modules")));

console.log(`
Next steps:
${installed ? "" : "  npm run install:all         # install dependencies\n"}  npm run docker:db           # start MongoDB + Mailpit in Docker (or use your own MongoDB)
  npm run seed                # optional: demo users alice/bob/carol@example.com, password Password123!
  npm run dev                 # API on http://localhost:5000, app on http://localhost:3000
`);

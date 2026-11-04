#!/usr/bin/env node
// Runs the API (nodemon) and the React dev server together, with prefixed output.
// Ctrl+C stops both.
//
//   npm run dev

const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const colors = { api: "\x1b[36m", web: "\x1b[35m" };
const reset = "\x1b[0m";

const procs = [
  { name: "api", cmd: "npm run dev --prefix server" },
  { name: "web", cmd: "npm start --prefix client", env: { BROWSER: "none" } },
].map(({ name, cmd, env }) => {
  const child = spawn(cmd, { cwd: root, shell: true, env: { ...process.env, FORCE_COLOR: "1", ...env } });
  const prefix = `${colors[name]}[${name}]${reset} `;
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited${code ? ` with code ${code}` : ""}`);
    stopAll(code || 0);
  });
  return child;
});

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    // With shell: true, killing the shell alone leaves npm's children running on Windows.
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

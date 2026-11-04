#!/usr/bin/env node
// Creates demo accounts and chats for local development, so you can log in right away
// without going through sign-up and email codes.
//
//   npm run seed --prefix server          (or: docker compose exec server npm run seed)
//
// Safe to run more than once: existing demo users and chats are reused.
// Refuses to run in production or against a non-local database unless --force is passed.

const bcrypt = require("bcryptjs");
const config = require("../config/env");
const { connectDB, disconnectDB } = require("../config/dbConfig");
const User = require("../model/user");
const Chat = require("../model/chat");
const Message = require("../model/message");

const PASSWORD = "Password123!";
const USERS = [
  { firstname: "Alice", lastname: "Demo", email: "alice@example.com" },
  { firstname: "Bob", lastname: "Demo", email: "bob@example.com" },
  { firstname: "Carol", lastname: "Demo", email: "carol@example.com" },
];

function assertSafeTarget() {
  if (process.argv.includes("--force")) return;
  if (config.isProduction) {
    throw new Error("Refusing to seed with NODE_ENV=production (pass --force if you really mean it).");
  }
  const host = config.mongoUri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, "").split(/[/:?,]/)[0];
  const local = ["127.0.0.1", "localhost", "mongo", "host.docker.internal"].includes(host);
  if (!local) {
    throw new Error(`Refusing to seed a non-local database (${host}). Pass --force to seed it anyway.`);
  }
}

async function upsertUser(u, hash) {
  const existing = await User.findOne({ email: u.email });
  if (existing) return { user: existing, created: false };
  const user = await User.create({ ...u, password: hash, emailVerified: true });
  return { user, created: true };
}

async function main() {
  assertSafeTarget();
  await connectDB();
  // Make sure the TTL and unique indexes exist even if autoIndex is off.
  await Promise.all([User.init(), Chat.init(), Message.init()]);

  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = [];
  for (const u of USERS) {
    const { user, created } = await upsertUser(u, hash);
    users.push(user);
    console.log(`${created ? "created" : "exists "}  ${u.email}`);
  }
  const [a, b, c] = users;

  let direct = await Chat.findOne({ type: "direct", members: { $all: [a._id, b._id], $size: 2 } });
  if (!direct) {
    direct = await Chat.create({ type: "direct", members: [a._id, b._id] });
    const msg = await Message.create({ chatId: direct._id, sender: b._id, text: "Hey Alice! 👋 Open this chat and watch the message disappear 2 minutes after you've seen it." });
    await Chat.updateOne({ _id: direct._id }, { lastMessage: msg._id, unreadMessageCount: 1 });
    console.log("created  direct chat Alice ↔ Bob");
  }

  let group = await Chat.findOne({ type: "group", name: "Demo group", members: a._id });
  if (!group) {
    group = await Chat.create({ type: "group", name: "Demo group", members: [a._id, b._id, c._id], admins: [a._id] });
    const msg = await Message.create({ chatId: group._id, sender: c._id, text: "Welcome to the demo group!", readBy: [] });
    await Chat.updateOne({ _id: group._id }, { lastMessage: msg._id });
    console.log("created  group chat \"Demo group\" (Alice is admin)");
  }

  console.log(`\nLog in as any of: ${USERS.map((u) => u.email).join(", ")}`);
  console.log(`Password: ${PASSWORD}\n`);
}

main()
  .catch((err) => {
    console.error(`[seed] ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB().catch(() => {}));

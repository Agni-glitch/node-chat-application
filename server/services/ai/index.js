const config = require("../../config/env");
const Bot = require("../../model/bot");
const Chat = require("../../model/chat");
const Message = require("../../model/message");
const { decrypt } = require("../../utils/crypto");
const { storeGeneratedImage } = require("../../cloudinary");
const { emitToUsers } = require("../../socket");
const { generateText, generateImage } = require("./providers");

const MAX_BOTS_PER_MESSAGE = 3;
const MENTION_RE = /(^|[^\w@])@([A-Za-z][A-Za-z0-9_-]{0,29})\b/g;

/** Unique lower-cased @handles in a text, in order of appearance. */
function parseMentions(text) {
  const found = [];
  for (const m of String(text || "").matchAll(MENTION_RE)) {
    const handle = m[2].toLowerCase();
    if (!found.includes(handle)) found.push(handle);
  }
  return found;
}

/** Removes the given @handles from a prompt. */
function stripMentions(text, handles) {
  return String(text || "")
    .replace(MENTION_RE, (all, pre, name) => (handles.includes(name.toLowerCase()) ? pre : all))
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Simple per-user sliding window + concurrency cap (per process).
const usage = new Map(); // userId -> { stamps: number[], running: number }
function acquire(userId) {
  const now = Date.now();
  const u = usage.get(userId) || { stamps: [], running: 0 };
  u.stamps = u.stamps.filter((t) => now - t < 60_000);
  if (u.stamps.length >= config.ai.ratePerMinute) return "You're asking the AI too fast. Wait a minute and try again.";
  if (u.running >= 2) return "Your AI is still working on previous requests. Try again in a moment.";
  u.stamps.push(now);
  u.running += 1;
  usage.set(userId, u);
  return null;
}
function release(userId) {
  const u = usage.get(userId);
  if (u) u.running = Math.max(0, u.running - 1);
}

const snapshot = (bot) => ({ id: bot._id, name: bot.name, model: bot.model, kind: bot.kind, provider: bot.provider });

function systemPrompt(bot, inGroup) {
  return [
    `You are ${bot.name}, an AI assistant inside a chat app.`,
    "Always answer briefly: at most 3 short sentences (about 60 words), plain text, no headings or long lists.",
    inGroup ? "You were mentioned in a conversation between people; answer the question you were asked." : "",
    bot.instructions ? `Additional instructions from your owner: ${bot.instructions}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** History for private AI chats: the last few text turns, oldest first. */
async function historyFor(chatId, upTo) {
  const docs = await Message.find({ chatId, createdAt: { $lte: upTo.createdAt } })
    .sort({ createdAt: -1 })
    .limit(config.ai.historyMessages)
    .lean();
  return docs
    .reverse()
    .filter((m) => m.text && m.bot?.kind !== "image")
    .map((m) => ({ role: m.bot ? "assistant" : "user", content: m.text }));
}

/** Runs one bot for one prompt and posts the result into the chat. */
async function runBot({ bot, chat, prompt, trigger, members }) {
  const chatId = String(chat._id);
  const ownerId = String(bot.owner);
  const busy = { chatId, bot: { name: bot.name, model: bot.model, kind: bot.kind } };

  const limited = acquire(ownerId);
  if (limited) {
    emitToUsers([ownerId], "ai-error", { chatId, botName: bot.name, message: limited });
    return;
  }

  emitToUsers(members, "ai-typing", { ...busy, active: true });
  try {
    const withKey = await Bot.findById(bot._id).select("+apiKey");
    if (!withKey) throw new Error("This AI model was deleted");
    const apiKey = decrypt(withKey.apiKey);

    const fields = { chatId, sender: ownerId, bot: snapshot(bot), text: "" };
    if (bot.kind === "image") {
      if (!prompt) throw new Error(`Tell ${bot.name} what to draw, e.g. "@${bot.name} a cat astronaut"`);
      const image = await generateImage(bot, apiKey, prompt.slice(0, 1000));
      const stored = await storeGeneratedImage(image);
      fields.image = stored.url;
      fields.imagePublicId = stored.publicId;
      fields.text = prompt.length > 120 ? `${prompt.slice(0, 117)}…` : prompt;
    } else {
      if (!prompt) throw new Error(`Ask ${bot.name} something, e.g. "@${bot.name} summarize this"`);
      const messages = chat.type === "ai" ? await historyFor(chat._id, trigger) : [{ role: "user", content: prompt }];
      fields.text = await generateText(bot, apiKey, { system: systemPrompt(bot, chat.type !== "ai"), messages });
    }

    // The chat may have been closed/deleted while the model was working.
    if (!(await Chat.exists({ _id: chat._id }))) return;
    const reply = await Message.create(fields);
    await Chat.updateOne(
      { _id: chat._id },
      chat.type === "direct" ? { lastMessage: reply._id, $inc: { unreadMessageCount: 1 } } : { lastMessage: reply._id }
    );
    emitToUsers(members, "receive-message", reply);
  } catch (err) {
    console.error(`[ai] ${bot.provider}/${bot.model} failed:`, err.message);
    emitToUsers([ownerId], "ai-error", { chatId, botName: bot.name, message: err.message || "The AI request failed" });
  } finally {
    release(ownerId);
    emitToUsers(members, "ai-typing", { ...busy, active: false });
  }
}

/**
 * Called after a user's message is saved. In a private AI chat the chat's model answers;
 * in a direct chat, every model of the *sender* that is @mentioned answers.
 * Only the sender's own models can be called, so nobody can spend someone else's API key.
 */
async function handleNewMessage(chat, message) {
  if (!config.ai.enabled) return;
  const senderId = String(message.sender);
  const members = chat.members.map(String);

  if (chat.type === "ai") {
    const bot = await Bot.findOne({ _id: chat.bot, owner: senderId });
    if (!bot) return;
    // The model "reads" the prompt now, which starts its disappearing timer.
    const readAt = new Date();
    await Message.updateOne({ _id: message._id }, { read: true, readAt });
    emitToUsers(members, "messages-read", {
      chatId: String(chat._id),
      readerId: String(bot._id),
      readAt,
      messageIds: [String(message._id)],
    });
    await runBot({ bot, chat, prompt: (message.text || "").trim(), trigger: message, members });
    return;
  }

  const handles = parseMentions(message.text);
  if (handles.length === 0) return;
  const bots = await Bot.find({ owner: senderId, nameLower: { $in: handles } });
  if (bots.length === 0) return;
  const ordered = handles.map((h) => bots.find((b) => b.nameLower === h)).filter(Boolean).slice(0, MAX_BOTS_PER_MESSAGE);
  const prompt = stripMentions(message.text, ordered.map((b) => b.nameLower));
  await Promise.all(ordered.map((bot) => runBot({ bot, chat, prompt, trigger: message, members })));
}

module.exports = { handleNewMessage, parseMentions, stripMentions, systemPrompt };

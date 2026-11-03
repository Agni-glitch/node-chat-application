const router = require("express").Router();
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authmiddleware");
const config = require("../config/env");
const Bot = require("../model/bot");
const Chat = require("../model/chat");
const HttpError = require("../utils/httpError");
const { encrypt, decrypt } = require("../utils/crypto");
const { assertSafeBaseUrl } = require("../utils/net");
const { generateText } = require("../services/ai/providers");
const { systemPrompt } = require("../services/ai");
const { purgeMessages } = require("../services/messageCleanup");
const { emitToUsers } = require("../socket");

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,29}$/;
const str = (v) => (typeof v === "string" ? v.trim() : "");

router.use(authMiddleware);
router.use((req, res, next) => {
  if (!config.ai.enabled) {
    return res.status(503).send({ message: "AI models are not enabled on this server (AI_KEYS_SECRET is missing)", success: false });
  }
  next();
});

/** Validates create/update input. `existing` is the bot being updated, if any. */
function validate(body, existing) {
  const out = {};
  const name = body.name !== undefined ? str(body.name) : existing?.name;
  if (!name || !NAME_RE.test(name)) {
    throw new HttpError(400, "Name must start with a letter and use only letters, numbers, - or _ (max 30), e.g. Alen");
  }
  out.name = name;
  out.nameLower = name.toLowerCase();

  out.kind = body.kind !== undefined ? body.kind : existing?.kind;
  if (!Bot.KINDS.includes(out.kind)) throw new HttpError(400, "Type must be chat or image");

  out.provider = body.provider !== undefined ? body.provider : existing?.provider;
  if (!Bot.PROVIDERS.includes(out.provider)) throw new HttpError(400, "Unsupported provider");
  if (out.kind === "image" && out.provider === "anthropic") {
    throw new HttpError(400, "Anthropic models can't generate images. Choose OpenAI, Gemini or an OpenAI-compatible API.");
  }

  out.model = body.model !== undefined ? str(body.model) : existing?.model;
  if (!out.model || out.model.length > 100 || !/^[\w.:/@-]+$/.test(out.model)) {
    throw new HttpError(400, "Enter the provider's model id, e.g. gpt-5.5, gpt-image-1, claude-sonnet-4-5 or gemini-2.5-flash");
  }

  if (out.provider === "openai-compatible") {
    const raw = body.baseUrl !== undefined ? str(body.baseUrl) : existing?.baseUrl;
    if (!raw) throw new HttpError(400, "Base URL is required for OpenAI-compatible APIs, e.g. https://openrouter.ai/api/v1");
    out.baseUrl = assertSafeBaseUrl(raw);
  } else {
    out.baseUrl = undefined;
  }

  if (body.instructions !== undefined) {
    out.instructions = str(body.instructions);
    if (out.instructions.length > 1000) throw new HttpError(400, "Instructions must be 1000 characters or fewer");
  }

  const apiKey = str(body.apiKey);
  if (apiKey) {
    if (apiKey.length > 500 || /\s/.test(apiKey)) throw new HttpError(400, "That doesn't look like a valid API key");
    out.apiKey = encrypt(apiKey);
    out.apiKeyLast4 = apiKey.slice(-4);
  } else if (!existing && out.provider !== "openai-compatible") {
    throw new HttpError(400, "API key is required");
  } else if (!existing) {
    out.apiKey = encrypt(""); // e.g. a local Ollama without auth
    out.apiKeyLast4 = "";
  }
  return out;
}

async function ownBot(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, "AI model not found");
  const bot = await Bot.findOne({ _id: req.params.id, owner: req.userId });
  if (!bot) throw new HttpError(404, "AI model not found");
  return bot;
}

router.get("/", async (req, res) => {
  const bots = await Bot.find({ owner: req.userId }).sort({ createdAt: 1 });
  res.send({ message: "AI models fetched", success: true, data: bots });
});

router.post("/", async (req, res) => {
  const count = await Bot.countDocuments({ owner: req.userId });
  if (count >= config.ai.maxBotsPerUser) {
    return res.status(400).send({ message: `You can add up to ${config.ai.maxBotsPerUser} AI models`, success: false });
  }
  const fields = validate(req.body || {});
  if (await Bot.exists({ owner: req.userId, nameLower: fields.nameLower })) {
    return res.status(409).send({ message: `You already have a model called @${fields.name}`, success: false });
  }
  const bot = await Bot.create({ ...fields, owner: req.userId });
  res.status(201).send({ message: `@${bot.name} added`, success: true, data: bot });
});

router.put("/:id", async (req, res) => {
  const bot = await ownBot(req);
  const fields = validate(req.body || {}, bot);
  if (fields.nameLower !== bot.nameLower && (await Bot.exists({ owner: req.userId, nameLower: fields.nameLower }))) {
    return res.status(409).send({ message: `You already have a model called @${fields.name}`, success: false });
  }
  if (fields.baseUrl === undefined) bot.baseUrl = undefined;
  bot.set(fields);
  await bot.save();
  res.send({ message: `@${bot.name} updated`, success: true, data: bot });
});

/** Deletes the model, its private AI chat and every message in it. */
router.delete("/:id", async (req, res) => {
  const bot = await ownBot(req);
  const chats = await Chat.find({ type: "ai", bot: bot._id }).select("_id members").lean();
  if (chats.length) {
    await purgeMessages({ chatId: { $in: chats.map((c) => c._id) } });
    await Chat.deleteMany({ _id: { $in: chats.map((c) => c._id) } });
    chats.forEach((c) => emitToUsers(c.members, "chat-removed", { chatId: String(c._id) }));
  }
  await bot.deleteOne();
  res.send({ message: `@${bot.name} deleted`, success: true, data: { id: String(bot._id) } });
});

/** Sends a tiny prompt to check the key/model work (chat models only; image tests would cost money). */
router.post("/:id/test", async (req, res) => {
  const bot = await ownBot(req);
  if (bot.kind !== "chat") {
    return res.status(400).send({ message: "Testing is only available for chat models. Try asking it for an image in a chat.", success: false });
  }
  const withKey = await Bot.findById(bot._id).select("+apiKey");
  const reply = await generateText(bot, decrypt(withKey.apiKey), {
    system: systemPrompt(bot, false),
    messages: [{ role: "user", content: "Reply with a one-sentence friendly hello." }],
  });
  res.send({ message: "It works!", success: true, data: { reply } });
});

/** Opens (or creates) the private chat with one of your models. */
router.post("/:id/chat", async (req, res) => {
  const bot = await ownBot(req);
  let chat = await Chat.findOne({ type: "ai", bot: bot._id, members: req.userId });
  const created = !chat;
  if (!chat) chat = await Chat.create({ type: "ai", bot: bot._id, members: [req.userId] });
  await chat.populate([{ path: "members" }, { path: "lastMessage" }, { path: "bot" }]);
  res.status(created ? 201 : 200).send({ message: "AI chat ready", success: true, data: chat });
});

module.exports = router;
module.exports.validate = validate; // exported for tests

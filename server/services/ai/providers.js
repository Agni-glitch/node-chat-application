const config = require("../../config/env");
const HttpError = require("../../utils/httpError");
const { requestJson } = require("../../utils/net");

const LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  "openai-compatible": "the API",
};

const baseFor = (bot) =>
  bot.provider === "openai" ? "https://api.openai.com/v1" : bot.baseUrl;

/** Turns provider/network failures into a short, user-facing error (never includes the key). */
function providerError(bot, res, err) {
  const who = LABELS[bot.provider] || "The provider";
  if (err) {
    if (err.code === "EPRIVATE") return new HttpError(400, "This model's base URL points to a private network address");
    if (err.code === "ETIMEDOUT") return new HttpError(504, `${who} took too long to respond`);
    if (err.code === "ETOOBIG") return new HttpError(502, `${who} sent a response that was too large`);
    return new HttpError(502, `Couldn't reach ${who} (${err.code || err.message})`);
  }
  const detail =
    res.json?.error?.message || res.json?.error?.type || res.json?.message || (typeof res.json?.error === "string" ? res.json.error : "");
  const short = String(detail).slice(0, 200);
  if (res.status === 401 || res.status === 403) return new HttpError(400, `${who} rejected the API key${short ? `: ${short}` : ""}`);
  if (res.status === 404) return new HttpError(400, `Model "${bot.model}" was not found${short ? `: ${short}` : ""}`);
  if (res.status === 429) return new HttpError(429, `${who} rate limit or quota reached${short ? `: ${short}` : ""}`);
  if (res.status === 400) return new HttpError(400, `${who} rejected the request${short ? `: ${short}` : ""}`);
  return new HttpError(502, `${who} returned an error (${res.status})${short ? `: ${short}` : ""}`);
}

async function call(bot, url, options) {
  let res;
  try {
    res = await requestJson(url, options);
  } catch (err) {
    throw providerError(bot, null, err);
  }
  if (res.status < 200 || res.status >= 300) throw providerError(bot, res);
  if (!res.json) throw new HttpError(502, "The provider returned an unreadable response");
  return res.json;
}

/** Keeps replies short: cuts at a sentence/word boundary under AI_MAX_REPLY_CHARS. */
function shorten(text, max = config.ai.maxReplyChars) {
  const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const sentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sentence > max * 0.6) return slice.slice(0, sentence + 1);
  const space = slice.lastIndexOf(" ");
  return `${slice.slice(0, space > 0 ? space : max)}…`;
}

/** Merges consecutive same-role turns and makes sure the conversation starts with the user. */
function normalizeTurns(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/**
 * Generates a short text reply.
 * @param messages [{ role: "user" | "assistant", content }]
 */
async function generateText(bot, apiKey, { system, messages }) {
  const turns = normalizeTurns(messages);
  const maxTokens = config.ai.maxOutputTokens;
  let text = "";

  if (bot.provider === "openai" || bot.provider === "openai-compatible") {
    const body = {
      model: bot.model,
      messages: [{ role: "system", content: system }, ...turns],
      // OpenAI's own API uses max_completion_tokens; compatible servers (Groq, Ollama, OpenRouter...) use max_tokens.
      ...(bot.provider === "openai" ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    };
    const json = await call(bot, `${baseFor(bot)}/chat/completions`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      body,
    });
    const content = json.choices?.[0]?.message?.content;
    text = Array.isArray(content) ? content.map((p) => p.text || "").join("") : content;
  } else if (bot.provider === "anthropic") {
    const json = await call(bot, "https://api.anthropic.com/v1/messages", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: { model: bot.model, max_tokens: maxTokens, system, messages: turns },
    });
    text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  } else if (bot.provider === "gemini") {
    const json = await call(
      bot,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(bot.model)}:generateContent`,
      {
        headers: { "x-goog-api-key": apiKey },
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
          generationConfig: { maxOutputTokens: maxTokens },
        },
      }
    );
    text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  } else {
    throw new HttpError(400, "Unsupported provider");
  }

  const reply = shorten(text);
  if (!reply) throw new HttpError(502, "The model returned an empty reply. Try again or rephrase.");
  return reply;
}

/** Generates one image. Resolves to { b64, mime } or { url }. */
async function generateImage(bot, apiKey, prompt) {
  if (bot.provider === "openai" || bot.provider === "openai-compatible") {
    const body = { model: bot.model, prompt, n: 1, size: "1024x1024" };
    // DALL·E returns URLs by default; gpt-image models always return base64 and reject this field.
    if (/^dall-e/i.test(bot.model)) body.response_format = "b64_json";
    const json = await call(bot, `${baseFor(bot)}/images/generations`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      body,
    });
    const item = json.data?.[0];
    if (item?.b64_json) return { b64: item.b64_json, mime: "image/png" };
    if (item?.url) return { url: item.url };
  } else if (bot.provider === "gemini") {
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(bot.model)}`;
    const headers = { "x-goog-api-key": apiKey };
    if (/^imagen/i.test(bot.model)) {
      const json = await call(bot, `${base}:predict`, {
        headers,
        body: { instances: [{ prompt }], parameters: { sampleCount: 1 } },
      });
      const p = json.predictions?.[0];
      if (p?.bytesBase64Encoded) return { b64: p.bytesBase64Encoded, mime: p.mimeType || "image/png" };
    } else {
      const json = await call(bot, `${base}:generateContent`, {
        headers,
        body: {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        },
      });
      const part = (json.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData?.data);
      if (part) return { b64: part.inlineData.data, mime: part.inlineData.mimeType || "image/png" };
    }
  } else {
    throw new HttpError(400, "This provider can't generate images");
  }
  throw new HttpError(502, "The model didn't return an image. It may have refused the prompt.");
}

module.exports = { generateText, generateImage, shorten, normalizeTurns };

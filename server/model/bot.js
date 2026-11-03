const mongoose = require("mongoose");

const PROVIDERS = ["openai", "anthropic", "gemini", "openai-compatible"];
const KINDS = ["chat", "image"];

/** A user's own AI model ("bot"), called with the user's own API key. */
const botSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    // Display name, also used as the @mention handle (case-insensitive, unique per owner).
    name: { type: String, required: true, trim: true, maxlength: 30 },
    nameLower: { type: String, required: true },
    kind: { type: String, enum: KINDS, required: true },
    provider: { type: String, enum: PROVIDERS, required: true },
    model: { type: String, required: true, trim: true, maxlength: 100 },
    baseUrl: { type: String, trim: true, maxlength: 300 },
    instructions: { type: String, trim: true, maxlength: 1000, default: "" },
    apiKey: {
      type: { iv: String, tag: String, data: String },
      select: false,
    },
    apiKeyLast4: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.apiKey;
        delete ret.nameLower;
        delete ret.__v;
        return ret;
      },
    },
  }
);

botSchema.index({ owner: 1, nameLower: 1 }, { unique: true });

module.exports = mongoose.model("bots", botSchema);
module.exports.PROVIDERS = PROVIDERS;
module.exports.KINDS = KINDS;

const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    // "direct": two people. "group": 1–GROUP_MAX_MEMBERS people. "ai": one person and one of their AI models.
    type: {
      type: String,
      enum: ["direct", "group", "ai"],
      default: "direct",
    },
    // Groups only
    name: { type: String, trim: true, maxlength: 50 },
    admins: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
      default: undefined,
    },
    members: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
      validate: {
        validator(v) {
          if (!Array.isArray(v)) return false;
          if (this.type === "group") return v.length >= 1;
          return v.length === (this.type === "ai" ? 1 : 2);
        },
        message: "A direct chat needs two members, an AI chat one, and a group at least one",
      },
    },
    bot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bots",
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "messages",
    },
    unreadMessageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

chatSchema.index({ members: 1, updatedAt: -1 });
chatSchema.index({ bot: 1 });

module.exports = mongoose.model("chats", chatSchema);

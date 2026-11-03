const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    members: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2,
        message: "A chat must have exactly two members",
      },
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

module.exports = mongoose.model("chats", chatSchema);

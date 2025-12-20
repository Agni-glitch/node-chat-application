const mongoose = require("mongoose");
const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "chats",
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    text: {
      type: String,
      require: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String,
      required: false
    }
  },
  { timestamps: true }
);
module.exports = mongoose.model("messages", messageSchema);

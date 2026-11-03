const router = require("express").Router();
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authmiddleware");
const Chat = require("../model/chat");
const Message = require("../model/message");
const { uploadImage } = require("../cloudinary");
const { emitToUsers } = require("../socket");
const { handleNewMessage } = require("../services/ai");

router.use(authMiddleware);

router.post("/new-message", async (req, res) => {
  const chatId = req.body?.chatId;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const image = req.body?.image || null;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).send({ message: "Invalid chat id", success: false });
  }
  if (!text && !image) {
    return res.status(400).send({ message: "Message cannot be empty", success: false });
  }

  const chat = await Chat.findOne({ _id: chatId, members: req.userId }).select("members type bot");
  if (!chat) {
    return res.status(404).send({ message: "Chat not found", success: false });
  }

  const uploaded = image ? await uploadImage(image, "messages") : null;

  const message = await Message.create({
    chatId,
    sender: req.userId, // always the authenticated user, never taken from the body
    text,
    image: uploaded?.url,
    imagePublicId: uploaded?.publicId,
  });

  await Chat.updateOne(
    { _id: chatId },
    // Groups count unread per member (from readBy), so only direct chats use the shared counter.
    chat.type === "direct" ? { lastMessage: message._id, $inc: { unreadMessageCount: 1 } } : { lastMessage: message._id }
  );

  emitToUsers(chat.members, "receive-message", message);

  res.status(201).send({ message: "Message sent", success: true, data: message });

  // AI replies (private AI chat, or @mentions of the sender's own models) run after responding.
  handleNewMessage(chat, message).catch((err) => console.error("[ai] handler failed:", err.message));
});

router.get("/get-all-messages/:chatId", async (req, res) => {
  const { chatId } = req.params;
  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).send({ message: "Invalid chat id", success: false });
  }

  const isMember = await Chat.exists({ _id: chatId, members: req.userId });
  if (!isMember) {
    return res.status(404).send({ message: "Chat not found", success: false });
  }

  const messages = await Message.find({ chatId }).sort({ createdAt: 1 });
  res.send({ message: "Messages fetched successfully", success: true, data: messages });
});

module.exports = router;

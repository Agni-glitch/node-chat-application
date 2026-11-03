const router = require("express").Router();
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authmiddleware");
const Chat = require("../model/chat");
const Message = require("../model/message");
const User = require("../model/user");
const { emitToUsers } = require("../socket");
const { purgeSeenInChat } = require("../services/messageCleanup");

router.use(authMiddleware);

/**
 * Create (or return the existing) one-to-one chat between the logged-in user
 * and another user. Accepts `{ userId }` or the legacy `{ members: [a, b] }`.
 */
router.post("/create-new-chat", async (req, res) => {
  const me = req.userId;
  let otherId = req.body?.userId;
  if (!otherId && Array.isArray(req.body?.members)) {
    otherId = req.body.members.map(String).find((m) => m !== me);
  }

  if (!mongoose.isValidObjectId(otherId) || String(otherId) === me) {
    return res.status(400).send({ message: "Please choose a valid user to chat with", success: false });
  }
  if (!(await User.exists({ _id: otherId, emailVerified: true }))) {
    return res.status(404).send({ message: "User not found", success: false });
  }

  const existing = await Chat.findOne({ members: { $all: [me, otherId], $size: 2 } })
    .populate("members")
    .populate("lastMessage");
  if (existing) {
    return res.send({ message: "Chat already exists", success: true, data: existing });
  }

  const chat = await Chat.create({ members: [me, otherId] });
  await chat.populate("members");

  emitToUsers([otherId], "new-chat", chat);

  res.status(201).send({ message: "Chat created successfully", success: true, data: chat });
});

router.get("/get-all-chats", async (req, res) => {
  const chats = await Chat.find({ members: req.userId })
    .populate("members")
    .populate("lastMessage")
    .sort({ updatedAt: -1 });

  res.send({ message: "Chats fetched successfully", success: true, data: chats });
});

/**
 * Mark every message the other member sent in this chat as read and reset the
 * unread counter (only if the logged-in user is the one who has unread messages).
 */
router.post("/clear-unread-messages", async (req, res) => {
  const chatId = req.body?.chatId;
  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).send({ message: "Invalid chat id", success: false });
  }

  const chat = await Chat.findOne({ _id: chatId, members: req.userId }).populate("lastMessage");
  if (!chat) {
    return res.status(404).send({ message: "Chat not found", success: false });
  }

  // readAt starts the disappearing-message timer (SEEN_MESSAGE_TTL_SECONDS).
  const readAt = new Date();
  await Message.updateMany(
    { chatId, read: false, sender: { $ne: req.userId } },
    { $set: { read: true, readAt } }
  );

  const lastSender = chat.lastMessage?.sender?.toString();
  if (lastSender && lastSender !== req.userId && chat.unreadMessageCount > 0) {
    // timestamps: false so clearing the badge doesn't reorder the chat list
    await Chat.updateOne({ _id: chatId }, { unreadMessageCount: 0 }, { timestamps: false });
  }

  const updated = await Chat.findById(chatId).populate("members").populate("lastMessage");

  emitToUsers(chat.members, "messages-read", { chatId, readerId: req.userId, readAt });

  res.send({ message: "Unread messages cleared", success: true, data: updated });
});

/**
 * Called when a member closes the conversation: every message that has already
 * been seen (in either direction) is permanently deleted. Unseen messages stay.
 */
router.post("/close-chat", async (req, res) => {
  const chatId = req.body?.chatId;
  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).send({ message: "Invalid chat id", success: false });
  }
  const isMember = await Chat.exists({ _id: chatId, members: req.userId });
  if (!isMember) {
    return res.status(404).send({ message: "Chat not found", success: false });
  }
  const deleted = await purgeSeenInChat(chatId);
  res.send({ message: "Chat closed", success: true, data: { deleted } });
});

module.exports = router;

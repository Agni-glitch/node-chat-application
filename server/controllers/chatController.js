const router = require("express").Router();
const mongoose = require("mongoose");
const authMiddleware = require("../middlewares/authmiddleware");
const config = require("../config/env");
const Chat = require("../model/chat");
const Message = require("../model/message");
const User = require("../model/user");
const { emitToUsers } = require("../socket");
const { purgeMessages, purgeSeenInChat } = require("../services/messageCleanup");
const { markGroupRead, resettleAfterMembershipChange, groupUnreadCounts } = require("../services/groupReads");

router.use(authMiddleware);

const populateChat = (query) => query.populate("members").populate("lastMessage").populate("bot");

/** JSON for a chat as seen by one user (groups get that user's own unread count). */
async function chatFor(chatId, userId) {
  const chat = await populateChat(Chat.findById(chatId));
  if (!chat) return null;
  const json = chat.toJSON();
  if (chat.type === "group") {
    json.unreadMessageCount = (await groupUnreadCounts([chat._id], userId))[String(chat._id)] || 0;
  }
  return json;
}

/** Sends every member their own view of the group (`event` is new-chat or chat-updated). */
async function broadcastGroup(chatId, event, onlyTo) {
  const chat = await Chat.findById(chatId).select("members").lean();
  if (!chat) return;
  const targets = (onlyTo || chat.members).map(String);
  await Promise.all(
    targets.map(async (id) => {
      const json = await chatFor(chatId, id);
      if (json) emitToUsers([id], event, json);
    })
  );
}

const isAdmin = (chat, userId) => (chat.admins || []).map(String).includes(String(userId));

/** Validates user ids for a group: verified accounts, deduplicated, never the caller. */
async function validMemberIds(raw, me) {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(raw.map(String))].filter((id) => id !== me && mongoose.isValidObjectId(id));
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids }, emailVerified: true }).select("_id").lean();
  return users.map((u) => String(u._id));
}

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

  // $nin also matches chats created before `type` existed (which are direct chats).
  const existing = await Chat.findOne({ type: { $nin: ["ai", "group"] }, members: { $all: [me, otherId], $size: 2 } })
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
  const chats = await populateChat(Chat.find({ members: req.userId })).sort({ updatedAt: -1 });
  const groups = chats.filter((c) => c.type === "group").map((c) => c._id);
  const unread = await groupUnreadCounts(groups, req.userId);
  const data = chats.map((c) => {
    const json = c.toJSON();
    if (c.type === "group") json.unreadMessageCount = unread[String(c._id)] || 0;
    return json;
  });
  res.send({ message: "Chats fetched successfully", success: true, data });
});

/**
 * Marks what the logged-in user has seen in this chat.
 * - Direct chats: the other member's messages become read (their disappearing timer starts).
 * - AI chats: the model's replies become read.
 * - Groups: the user is added to each message's readBy; a message becomes read only when
 *   every other member has seen it.
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

  if (chat.type === "group") {
    await markGroupRead(chat, req.userId);
    return res.send({ message: "Unread messages cleared", success: true, data: await chatFor(chatId, req.userId) });
  }

  // readAt starts the disappearing-message timer (SEEN_MESSAGE_TTL_SECONDS).
  // In a private AI chat every message's sender is the user, so "the other side" is the model's replies.
  const readAt = new Date();
  const fromOthers = chat.type === "ai" ? { bot: { $exists: true } } : { sender: { $ne: req.userId } };
  await Message.updateMany({ chatId, read: false, ...fromOthers }, { $set: { read: true, readAt } });

  const lastSender = chat.lastMessage?.sender?.toString();
  if (lastSender && lastSender !== req.userId && chat.unreadMessageCount > 0) {
    // timestamps: false so clearing the badge doesn't reorder the chat list
    await Chat.updateOne({ _id: chatId }, { unreadMessageCount: 0 }, { timestamps: false });
  }

  emitToUsers(chat.members, "messages-read", { chatId, readerId: req.userId, readAt });

  res.send({ message: "Unread messages cleared", success: true, data: await chatFor(chatId, req.userId) });
});

/**
 * Called when a member closes the conversation: every message that has already
 * been seen (by everyone it was sent to) is permanently deleted. Unseen messages stay.
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

// ---------------------------------------------------------------- groups

/** Body: { name, memberIds: [userId, ...] }. The creator becomes the admin. */
router.post("/groups", async (req, res) => {
  const me = req.userId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 50) {
    return res.status(400).send({ message: "Group name must be 1–50 characters", success: false });
  }
  const others = await validMemberIds(req.body?.memberIds, me);
  if (others.length < 2) {
    return res.status(400).send({ message: "Add at least 2 people to create a group", success: false });
  }
  if (others.length + 1 > config.groupMaxMembers) {
    return res.status(400).send({ message: `Groups can have up to ${config.groupMaxMembers} members`, success: false });
  }
  const chat = await Chat.create({ type: "group", name, members: [me, ...others], admins: [me] });
  await broadcastGroup(chat._id, "new-chat", others);
  res.status(201).send({ message: `Group "${name}" created`, success: true, data: await chatFor(chat._id, me) });
});

async function loadGroup(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).send({ message: "Group not found", success: false });
    return null;
  }
  const chat = await Chat.findOne({ _id: req.params.id, type: "group", members: req.userId });
  if (!chat) res.status(404).send({ message: "Group not found", success: false });
  return chat;
}

/** Rename (admins only). Body: { name }. */
router.put("/groups/:id", async (req, res) => {
  const chat = await loadGroup(req, res);
  if (!chat) return;
  if (!isAdmin(chat, req.userId)) return res.status(403).send({ message: "Only group admins can do that", success: false });
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 50) {
    return res.status(400).send({ message: "Group name must be 1–50 characters", success: false });
  }
  await Chat.updateOne({ _id: chat._id }, { name }, { timestamps: false });
  await broadcastGroup(chat._id, "chat-updated");
  res.send({ message: "Group renamed", success: true, data: await chatFor(chat._id, req.userId) });
});

/** Add members (admins only). Body: { userIds: [...] }. */
router.post("/groups/:id/members", async (req, res) => {
  const chat = await loadGroup(req, res);
  if (!chat) return;
  if (!isAdmin(chat, req.userId)) return res.status(403).send({ message: "Only group admins can do that", success: false });
  const current = chat.members.map(String);
  const added = (await validMemberIds(req.body?.userIds, req.userId)).filter((id) => !current.includes(id));
  if (!added.length) return res.status(400).send({ message: "Choose people who aren't in the group yet", success: false });
  if (current.length + added.length > config.groupMaxMembers) {
    return res.status(400).send({ message: `Groups can have up to ${config.groupMaxMembers} members`, success: false });
  }
  await Chat.updateOne({ _id: chat._id }, { $addToSet: { members: { $each: added } } }, { timestamps: false });
  // New members have nothing to read yet: mark existing messages as seen by them,
  // so they don't block the disappearing timer for everyone else.
  await Message.updateMany({ chatId: chat._id, read: false }, { $addToSet: { readBy: { $each: added.map((id) => new mongoose.Types.ObjectId(id)) } } });
  await broadcastGroup(chat._id, "new-chat", added);
  await broadcastGroup(chat._id, "chat-updated", current);
  res.send({ message: `Added ${added.length} member${added.length === 1 ? "" : "s"}`, success: true, data: await chatFor(chat._id, req.userId) });
});

/**
 * Remove a member (admins) or leave (anyone, with their own id).
 * If the last admin leaves, the longest-standing member becomes admin.
 * A group with no members left is deleted with all its messages.
 */
router.delete("/groups/:id/members/:userId", async (req, res) => {
  const chat = await loadGroup(req, res);
  if (!chat) return;
  const target = String(req.params.userId);
  const leaving = target === req.userId;
  if (!leaving && !isAdmin(chat, req.userId)) {
    return res.status(403).send({ message: "Only group admins can remove people", success: false });
  }
  if (!chat.members.map(String).includes(target)) {
    return res.status(404).send({ message: "That person isn't in the group", success: false });
  }

  const members = chat.members.map(String).filter((id) => id !== target);
  let admins = (chat.admins || []).map(String).filter((id) => id !== target);
  if (members.length === 0) {
    await purgeMessages({ chatId: chat._id });
    await Chat.deleteOne({ _id: chat._id });
    emitToUsers([target], "chat-removed", { chatId: String(chat._id) });
    return res.send({ message: "You left and the group was deleted", success: true, data: { deleted: true } });
  }
  if (admins.length === 0) admins = [members[0]];

  await Chat.updateOne({ _id: chat._id }, { members, admins }, { timestamps: false });
  emitToUsers([target], "chat-removed", { chatId: String(chat._id) });
  await resettleAfterMembershipChange({ _id: chat._id, members });
  await broadcastGroup(chat._id, "chat-updated");
  res.send({ message: leaving ? "You left the group" : "Member removed", success: true, data: { deleted: false } });
});

module.exports = router;

const config = require("../config/env");
const Chat = require("../model/chat");
const Message = require("../model/message");
const { deleteImages } = require("../cloudinary");
const { emitToUsers } = require("../socket");

/**
 * Permanently deletes the messages matching `filter`, repairs each affected chat's
 * `lastMessage`, removes attached images from Cloudinary, and tells both members'
 * clients which messages disappeared (`messages-deleted`).
 * Returns the number of deleted messages.
 */
async function purgeMessages(filter) {
  const docs = await Message.find(filter).select("_id chatId +imagePublicId").lean();
  if (docs.length === 0) return 0;

  const ids = docs.map((d) => d._id);
  const { deletedCount } = await Message.deleteMany({ _id: { $in: ids } });

  const byChat = new Map();
  for (const d of docs) {
    const key = String(d.chatId);
    if (!byChat.has(key)) byChat.set(key, []);
    byChat.get(key).push(String(d._id));
  }

  for (const [chatId, messageIds] of byChat) {
    const chat = await Chat.findById(chatId).select("members lastMessage").lean();
    if (!chat) continue;
    const payload = { chatId, messageIds };
    if (chat.lastMessage && messageIds.includes(String(chat.lastMessage))) {
      const latest = await Message.findOne({ chatId }).sort({ createdAt: -1 });
      await Chat.updateOne(
        { _id: chatId },
        latest ? { lastMessage: latest._id } : { $unset: { lastMessage: 1 } },
        { timestamps: false }
      );
      payload.lastMessage = latest ? latest.toJSON() : null;
    }
    emitToUsers(chat.members, "messages-deleted", payload);
  }

  deleteImages(docs.map((d) => d.imagePublicId));
  return deletedCount;
}

/** Deletes every message in a chat that has already been seen. */
const purgeSeenInChat = (chatId) => purgeMessages({ chatId, read: true });

/** Deletes messages that were seen more than SEEN_MESSAGE_TTL_SECONDS ago. */
const purgeExpired = () =>
  purgeMessages({ read: true, readAt: { $lte: new Date(Date.now() - config.seenMessageTtlSeconds * 1000) } });

let timer = null;
let running = false;

async function sweep() {
  if (running) return;
  running = true;
  try {
    await purgeExpired();
  } catch (err) {
    console.error("[cleanup] sweep failed:", err.message);
  } finally {
    running = false;
  }
}

async function startMessageSweeper() {
  // Messages seen before this feature existed have no readAt: start their 2-minute clock now.
  const { modifiedCount } = await Message.updateMany(
    { read: true, readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );
  if (modifiedCount) console.log(`[cleanup] ${modifiedCount} previously seen messages scheduled for deletion`);
  timer = setInterval(sweep, config.messageSweepIntervalMs);
  timer.unref();
  sweep();
}

function stopMessageSweeper() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { purgeMessages, purgeSeenInChat, purgeExpired, startMessageSweeper, stopMessageSweeper };

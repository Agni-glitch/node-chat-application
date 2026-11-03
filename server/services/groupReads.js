const mongoose = require("mongoose");
const Message = require("../model/message");
const { emitToUsers } = require("../socket");

/**
 * Marks as fully read every unread message in a group that all *current* members
 * (other than its sender) have now seen. That starts each message's disappearing timer.
 * Returns the ids that became fully read.
 */
async function settleFullyRead(chatId, members, readAt = new Date()) {
  const memberIds = members.map(String);
  const pending = await Message.find({ chatId, read: false }).select("sender readBy").lean();
  const done = pending
    .filter((m) => {
      const seen = new Set((m.readBy || []).map(String));
      return memberIds.filter((id) => id !== String(m.sender)).every((id) => seen.has(id));
    })
    .map((m) => m._id);
  if (done.length) {
    await Message.updateMany({ _id: { $in: done } }, { $set: { read: true, readAt } });
  }
  return done.map(String);
}

/** Records that `readerId` has seen the group, and notifies all members. */
async function markGroupRead(chat, readerId) {
  const chatId = String(chat._id);
  const readAt = new Date();
  const reader = new mongoose.Types.ObjectId(String(readerId));
  await Message.updateMany(
    { chatId, read: false, sender: { $ne: reader }, readBy: { $ne: reader } },
    { $addToSet: { readBy: reader } }
  );
  const messageIds = await settleFullyRead(chatId, chat.members, readAt);
  emitToUsers(chat.members, "messages-read", { chatId, readerId: String(readerId), readAt, messageIds, group: true });
  return messageIds;
}

/** After someone leaves or is removed, messages may now be seen by everyone who remains. */
async function resettleAfterMembershipChange(chat) {
  const readAt = new Date();
  const messageIds = await settleFullyRead(chat._id, chat.members, readAt);
  if (messageIds.length) {
    emitToUsers(chat.members, "messages-read", { chatId: String(chat._id), readAt, messageIds, group: true });
  }
}

/** Per-member unread counts for a user's groups: { chatId: count }. */
async function groupUnreadCounts(groupIds, userId) {
  if (!groupIds.length) return {};
  const me = new mongoose.Types.ObjectId(String(userId));
  const rows = await Message.aggregate([
    { $match: { chatId: { $in: groupIds }, sender: { $ne: me }, read: false, readBy: { $ne: me } } },
    { $group: { _id: "$chatId", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
}

module.exports = { markGroupRead, settleFullyRead, resettleAfterMembershipChange, groupUnreadCounts };

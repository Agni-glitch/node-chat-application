const router = require("express").Router();
const User = require("../model/user");
const Chat = require("../model/chat");
const authMiddleware = require("../middlewares/authmiddleware");
const { uploadImage } = require("../cloudinary");
const { emitToUsers } = require("../socket");
const { normalizeSocialLinks } = require("../utils/socialLinks");

const PUBLIC_FIELDS = "firstname lastname email profilePic socialLinks createdAt";

router.use(authMiddleware);

/** Pushes the updated profile to everyone who has a chat with this user. */
async function broadcastProfile(user) {
  const chats = await Chat.find({ members: user._id }).select("members").lean();
  const others = chats.flatMap((c) => c.members.map(String)).filter((id) => id !== String(user._id));
  emitToUsers([...others, String(user._id)], "user-updated", user.toJSON());
}

router.get("/get-logged-user", async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(401).send({ message: "Account no longer exists", success: false });
  }
  res.send({ message: "User fetched successfully", success: true, data: user });
});

router.get("/get-all-user", async (req, res) => {
  const users = await User.find({ _id: { $ne: req.userId }, emailVerified: true })
    .select(PUBLIC_FIELDS)
    .sort({ firstname: 1, lastname: 1 });
  res.send({ message: "Users fetched successfully", success: true, data: users });
});

router.post("/upload-profile-pic", async (req, res) => {
  const { url } = await uploadImage(req.body?.image, "avatars");
  const user = await User.findByIdAndUpdate(req.userId, { profilePic: url }, { new: true });
  broadcastProfile(user).catch((err) => console.error("[user] broadcast failed:", err.message));
  res.send({ message: "Profile picture updated", success: true, data: user });
});

/**
 * Replaces the user's social links. Body: { socialLinks: { instagram: "https://instagram.com/me", ... } }.
 * Each link must be http(s) and on the platform's own domain; empty values remove a link.
 */
router.put("/social-links", async (req, res) => {
  const socialLinks = normalizeSocialLinks(req.body?.socialLinks);
  const user = await User.findByIdAndUpdate(req.userId, { socialLinks }, { new: true, runValidators: true });
  broadcastProfile(user).catch((err) => console.error("[user] broadcast failed:", err.message));
  res.send({ message: "Profile links saved", success: true, data: user });
});

module.exports = router;

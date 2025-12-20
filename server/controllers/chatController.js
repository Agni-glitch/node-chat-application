const router = require("express").Router();
const authmiddleware = require("../middlewares/authmiddleware");
const Chat = require("./../model/chat");
const message = require("./../model/message");
const Message = require("./../model/message")

router.post("/create-new-chat", authmiddleware, async (req, res) => {
  try {
    const chat = new Chat(req.body);
    const saveChat = await chat.save();
    await saveChat.populate('members')

    res.status(201).send({
      message: "Chat created successfully",
      success: true,
      data: saveChat,
    });
  } catch (err) {
    res.status(400).send({
      message: err.message,
      success: false,
    });
  }
});
router.get("/get-all-chats", authmiddleware, async (req, res) => {
  try {
    const allChat = await Chat.find({ members: { $in: [req.userId] } }).populate('members').populate('lastMessage').sort({ updatedAt: -1 });

    res.send({
      message: "Chat fetched successfully",
      success: true,
      data: allChat,
    });
  } catch (err) {
    res.status(400).send({
      message: err.message,
      success: false,
    });
  }
});

router.post('/clear-unread-messages', authmiddleware, async (req, res) => {
  try {
    const chatId = req.body.chatId;
    const chat = await Chat.findById(chatId);
    if (!chat) {
      res.send({
        message: "No chat found with given chat Id",
        success: false
      })
    }
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { unreadMessageCount: 0 },
      { new: true }
    ).populate('members').populate('lastMessage')

    await Message.updateMany(
      { chatId: req.params.chatId, read: false, sender: { $ne: req.userId } },
      { $set: { read: true } }
    )
    res.send({
      message: "Unread message cleared successfully",
      success: true,
      data: updatedChat
    })
  } catch (error) {
    res.send({
      message: error.message,
      success: false
    })
  }
})

module.exports = router;

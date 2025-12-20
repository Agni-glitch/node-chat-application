const router = require("express").Router();
const authMiddleware = require("./authController");
const Chat = require("./../model/chat");
const Message = require("./../model/message");

router.post("/new-message", authMiddleware, async (req, res) => {
  try {
    // store message in message collection
    const newMessage = new Message(req.body);
    const savedMessage = await newMessage.save();
    // update last message

    // const currentChat =await Chat.findById(req.body.chatId)
    // currentChat.lastMessage = savedMessage._id;
    // await currentChat.save()

    const currentChat = await Chat.findOneAndUpdate(
      {
        _id: req.body.chatId,
      },
      {
        lastMessage: savedMessage._id,
        $inc: { unreadMessageCount: 1 },
      }
    );
    res.status(201).send({
      message: "Message send successfully",
      success: true,
      data: savedMessage,
    });
  } catch (error) {
    res.status(400).send({
      message: error.message,
      success: false,
    });
  }
});
router.get("/get-all-messages/:chatId", authMiddleware, async (req, res) => {
  try {
    const allMessages = await Message.find({ chatId: req.params.chatId }).sort({
      createdAt: 1,
    }); //assending order
    res.send({
      message: "All messages fetched successfully",
      success: true,
      data: allMessages,
    });
  } catch (error) {
    res.status(400).send({
      message: error.message,
      success: false,
    });
  }
});
module.exports = router;

const express = require("express");
const cors = require("cors");

const app = express();
const authRouter = require("./controllers/authController");
const userRouter = require("./controllers/userController");
const chatRouter = require("./controllers/chatController");
const messageRouter = require("./controllers/messageController");

app.use(cors());
app.use(express.json({
    limit: "50mb"
}));
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
    },
})
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/message", messageRouter);

const onlineusers = [];

io.on("connection", (socket) => {
    socket.on('join-room', userid => {
        socket.join(userid);
    })
    socket.once('send-message', message => {
        io
            .to(message.members[0])
            .to(message.members[1])
            .emit('receive-message', message);
        io
            .to(message.members[0])
            .to(message.members[1])
            .emit('set-message-count', message);
    })
    socket.on('clear-unread-messages', data => {
        io
            .to(data.members[0])
            .to(data.members[1])
            .emit('message-count-cleared', data);
    })
    socket.on('user-typing', data => {
        io
            .to(data.members[0])
            .to(data.members[1])
            .emit('started-typing', data);
    })
    socket.on('user-login', userId => {
        if (!onlineusers.includes(userId)) {
            onlineusers.push(userId)
        }
        socket.emit('online-users', onlineusers);
    })
    socket.on('user-offline', userId => {
        onlineusers.splice(onlineusers.indexOf(userId), 1);
        io.emit('online-users-updated', onlineusers)
    })
});

module.exports = server;

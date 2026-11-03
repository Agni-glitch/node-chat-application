const { Server } = require("socket.io");
const config = require("./config/env");
const { authenticate } = require("./middlewares/authmiddleware");
const Chat = require("./model/chat");

let io = null;
// userId -> number of open sockets (a user can have several tabs/devices)
const online = new Map();

const onlineList = () => Array.from(online.keys());

function initSocket(server, corsOrigin) {
  io = new Server(server, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"], credentials: true },
    maxHttpBufferSize: 1e5, // sockets only carry small events; messages go through REST
  });

  // Every socket must present a valid JWT; the user id comes from the token, never the client.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));
      socket.userId = await authenticate(token);
      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    socket.join(userId);

    online.set(userId, (online.get(userId) || 0) + 1);
    io.emit("online-users", onlineList());

    // Typing indicator: only relayed to members of a chat the sender belongs to.
    socket.on("user-typing", async (data) => {
      try {
        const chatId = data?.chatId;
        if (typeof chatId !== "string" || !/^[a-f\d]{24}$/i.test(chatId)) return;
        const chat = await Chat.findOne({ _id: chatId, members: userId }).select("members").lean();
        if (!chat) return;
        chat.members
          .map(String)
          .filter((m) => m !== userId)
          .forEach((m) => io.to(m).emit("started-typing", { chatId, sender: userId }));
      } catch (err) {
        console.error("[socket] user-typing failed:", err.message);
      }
    });

    socket.on("disconnect", () => {
      const count = (online.get(userId) || 1) - 1;
      if (count <= 0) online.delete(userId);
      else online.set(userId, count);
      io.emit("online-users", onlineList());
    });
  });

  return io;
}

/** Emit an event to the personal room of each given user id. */
function emitToUsers(userIds, event, payload) {
  if (!io) return;
  new Set(userIds.map(String)).forEach((id) => io.to(id).emit(event, payload));
}

/** Force-disconnects every socket of a user (e.g. after a password reset). */
function disconnectUser(userId) {
  if (io) io.in(String(userId)).disconnectSockets(true);
}

function closeSocket() {
  return new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));
}

module.exports = { initSocket, emitToUsers, disconnectUser, closeSocket };

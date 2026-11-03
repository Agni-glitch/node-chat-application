import { useEffect } from "react";
import { useDispatch, useStore } from "react-redux";
import toast from "react-hot-toast";
import { getSocket } from "../socket";
import { clearToken } from "../apiCalls";
import { clearUnreadMessageCount, closeChatOnUnload, getAllChats } from "../apiCalls/chat";
import { getAllMessage } from "../apiCalls/message";
import {
  chatAdded,
  messageReceived,
  messagesDeleted,
  messagesRead,
  userUpdated,
  setAllChats,
  setMessages,
  setOnlineUsers,
  setTyping,
  setAiBusy,
  chatRemoved,
  chatUpdated,
} from "../redux/userSlice";

const TYPING_TIMEOUT_MS = 3000;

/** Connects the socket and wires every real-time event into the store. */
export default function useChatSocket() {
  const dispatch = useDispatch();
  const store = useStore();

  useEffect(() => {
    const socket = getSocket();
    const typingTimers = {};
    let connectedBefore = socket.connected;
    const state = () => store.getState().userReducer;

    const refreshChats = async () => {
      const res = await getAllChats();
      if (res.success) dispatch(setAllChats(res.data));
    };

    // After a reconnect, fetch anything that may have been missed while offline.
    const resync = async () => {
      await refreshChats();
      const chatId = state().selectedChat?._id;
      if (!chatId) return;
      const res = await getAllMessage(chatId);
      if (res.success && state().selectedChat?._id === chatId) dispatch(setMessages(res.data));
    };

    const onConnect = () => {
      if (connectedBefore) resync();
      connectedBefore = true;
    };

    const onConnectError = (err) => {
      if (/token|auth/i.test(err?.message || "")) {
        clearToken();
        window.location.assign("/login");
      }
    };

    const onMessage = (message) => {
      const { allChats, selectedChat, user } = state();
      const known = allChats.some((c) => c._id === message.chatId);
      dispatch(messageReceived(message));
      if (!known) refreshChats();
      // Seeing a reply in the open chat marks it read (AI replies in a private AI chat count too).
      const fromOther = message.sender !== user?._id || (selectedChat?.type === "ai" && message.bot);
      if (selectedChat?._id === message.chatId && fromOther) {
        clearUnreadMessageCount(message.chatId);
      }
    };

    const onTyping = ({ chatId, sender }) => {
      dispatch(setTyping({ chatId, value: sender || true }));
      clearTimeout(typingTimers[chatId]);
      typingTimers[chatId] = setTimeout(() => dispatch(setTyping({ chatId, value: false })), TYPING_TIMEOUT_MS);
    };

    const onOnline = (ids) => dispatch(setOnlineUsers(ids));
    const onNewChat = (chat) => dispatch(chatAdded(chat));
    const onRead = (data) => dispatch(messagesRead(data));
    const onDeleted = (data) => dispatch(messagesDeleted(data));
    const onUserUpdated = (user) => dispatch(userUpdated(user));
    const onAiTyping = (data) => dispatch(setAiBusy(data));
    const onAiError = ({ botName, message }) => toast.error(`@${botName}: ${message}`, { duration: 6000 });
    const onChatRemoved = ({ chatId }) => dispatch(chatRemoved(chatId));
    const onChatUpdated = (chat) => dispatch(chatUpdated(chat));

    // Closing/reloading the tab also closes the open chat (deletes its seen messages).
    const onPageHide = () => closeChatOnUnload(state().selectedChat?._id);
    window.addEventListener("pagehide", onPageHide);

    socket.on("messages-deleted", onDeleted);
    socket.on("ai-typing", onAiTyping);
    socket.on("ai-error", onAiError);
    socket.on("chat-removed", onChatRemoved);
    socket.on("chat-updated", onChatUpdated);
    socket.on("user-updated", onUserUpdated);
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("online-users", onOnline);
    socket.on("receive-message", onMessage);
    socket.on("messages-read", onRead);
    socket.on("new-chat", onNewChat);
    socket.on("started-typing", onTyping);

    return () => {
      Object.values(typingTimers).forEach(clearTimeout);
      window.removeEventListener("pagehide", onPageHide);
      socket.off("messages-deleted", onDeleted);
      socket.off("ai-typing", onAiTyping);
      socket.off("ai-error", onAiError);
      socket.off("chat-removed", onChatRemoved);
      socket.off("chat-updated", onChatUpdated);
      socket.off("user-updated", onUserUpdated);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("online-users", onOnline);
      socket.off("receive-message", onMessage);
      socket.off("messages-read", onRead);
      socket.off("new-chat", onNewChat);
      socket.off("started-typing", onTyping);
    };
  }, [dispatch, store]);
}

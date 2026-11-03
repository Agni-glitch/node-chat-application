import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  allUsers: [],
  allChats: [],
  selectedChat: null,
  messages: [],
  messagesLoading: false,
  onlineUsers: [],
  typing: {}, // chatId -> true while the other member is typing
  appConfig: { seenMessageTtlSeconds: 120, clockOffsetMs: 0 },
};

const replaceUser = (list, updated) => list.map((u) => (u._id === updated._id ? { ...u, ...updated } : u));

const findChat = (state, chatId) => state.allChats.find((c) => c._id === chatId);

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    setAllUsers: (state, action) => {
      state.allUsers = action.payload;
    },
    setAllChats: (state, action) => {
      state.allChats = action.payload;
    },
    setSelectedChat: (state, action) => {
      const next = action.payload;
      if (state.selectedChat?._id !== next?._id) {
        state.messages = [];
        state.messagesLoading = Boolean(next);
      }
      state.selectedChat = next;
    },
    setMessages: (state, action) => {
      state.messages = action.payload;
      state.messagesLoading = false;
    },
    setMessagesLoading: (state, action) => {
      state.messagesLoading = action.payload;
    },
    chatAdded: (state, action) => {
      const chat = action.payload;
      if (!findChat(state, chat._id)) state.allChats.unshift(chat);
    },
    chatUpdated: (state, action) => {
      const chat = action.payload;
      const index = state.allChats.findIndex((c) => c._id === chat._id);
      if (index >= 0) state.allChats[index] = chat;
      if (state.selectedChat?._id === chat._id) state.selectedChat = chat;
    },
    messageReceived: (state, action) => {
      const message = action.payload;
      const me = state.user?._id;
      const isOpen = state.selectedChat?._id === message.chatId;

      if (isOpen && !state.messages.some((m) => m._id === message._id)) {
        state.messages.push(message);
      }

      const index = state.allChats.findIndex((c) => c._id === message.chatId);
      if (index < 0) return;
      const chat = state.allChats[index];
      // Ignore duplicates (REST response + socket echo of the same message) and stale events.
      const last = chat.lastMessage;
      if (last && (last._id === message._id || Date.parse(last.createdAt) > Date.parse(message.createdAt))) return;

      chat.lastMessage = message;
      if (message.sender !== me) {
        chat.unreadMessageCount = isOpen ? 0 : (chat.unreadMessageCount || 0) + 1;
      } else {
        chat.unreadMessageCount = (chat.unreadMessageCount || 0) + 1;
      }
      state.allChats.splice(index, 1);
      state.allChats.unshift(chat);
      if (state.typing[message.chatId] && message.sender !== me) delete state.typing[message.chatId];
    },
    messagesRead: (state, action) => {
      const { chatId, readerId } = action.payload;
      const readAt = action.payload.readAt || new Date().toISOString();
      const me = state.user?._id;
      const chat = findChat(state, chatId);
      const iAmReader = readerId === me;
      // The reader saw the other member's messages: mark them and start their timers.
      if (state.selectedChat?._id === chatId) {
        state.messages.forEach((m) => {
          const affected = iAmReader ? m.sender !== me : m.sender === me;
          if (affected && !m.read) {
            m.read = true;
            m.readAt = readAt;
          }
        });
      }
      if (iAmReader) {
        if (chat && chat.lastMessage?.sender !== me) chat.unreadMessageCount = 0;
        return;
      }
      if (chat?.lastMessage && chat.lastMessage.sender === me) {
        chat.lastMessage.read = true;
        chat.unreadMessageCount = 0;
      }
    },
    messagesDeleted: (state, action) => {
      const { chatId, messageIds } = action.payload;
      const gone = new Set(messageIds);
      if (state.selectedChat?._id === chatId) {
        state.messages = state.messages.filter((m) => !gone.has(m._id));
      }
      const chat = findChat(state, chatId);
      if (chat && "lastMessage" in action.payload) chat.lastMessage = action.payload.lastMessage;
    },
    userUpdated: (state, action) => {
      const updated = action.payload;
      if (state.user?._id === updated._id) state.user = { ...state.user, ...updated };
      state.allUsers = replaceUser(state.allUsers, updated);
      state.allChats.forEach((c) => {
        c.members = replaceUser(c.members, updated);
      });
      if (state.selectedChat) state.selectedChat.members = replaceUser(state.selectedChat.members, updated);
    },
    setAppConfig: (state, action) => {
      const { serverTime, ...rest } = action.payload;
      state.appConfig = { ...state.appConfig, ...rest, clockOffsetMs: serverTime ? serverTime - Date.now() : 0 };
    },
    setOnlineUsers: (state, action) => {
      state.onlineUsers = action.payload;
    },
    setTyping: (state, action) => {
      const { chatId, value } = action.payload;
      if (value) state.typing[chatId] = true;
      else delete state.typing[chatId];
    },
    resetState: () => initialState,
  },
});

export const {
  setUser,
  setAllUsers,
  setAllChats,
  setSelectedChat,
  setMessages,
  setMessagesLoading,
  chatAdded,
  chatUpdated,
  messageReceived,
  messagesRead,
  messagesDeleted,
  userUpdated,
  setAppConfig,
  setOnlineUsers,
  setTyping,
  resetState,
} = userSlice.actions;

export default userSlice.reducer;

import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import userReducer from "./userSlice";
import { closeChat } from "../apiCalls/chat";
import { getToken } from "../apiCalls";

// Whenever the open conversation changes (another chat, back button, leaving the page),
// tell the server the previous chat was closed so its seen messages are deleted.
const chatLifecycle = createListenerMiddleware();
chatLifecycle.startListening({
  predicate: (action, current, previous) => {
    const prevId = previous.userReducer.selectedChat?._id;
    return Boolean(prevId) && prevId !== current.userReducer.selectedChat?._id;
  },
  effect: (action, api) => {
    const prevId = api.getOriginalState().userReducer.selectedChat._id;
    if (getToken()) closeChat(prevId);
  },
});

const store = configureStore({
  reducer: { userReducer },
  middleware: (getDefault) => getDefault().prepend(chatLifecycle.middleware),
});

export default store;

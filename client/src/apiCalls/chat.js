import { request, getToken } from "./index";
import { API_URL } from "../config";

export const getAllChats = () => request({ method: "get", url: "/api/chat/get-all-chats" });

export const createNewChat = (userId) =>
  request({ method: "post", url: "/api/chat/create-new-chat", data: { userId } });

export const clearUnreadMessageCount = (chatId) =>
  request({ method: "post", url: "/api/chat/clear-unread-messages", data: { chatId } });

/** Closing a chat permanently deletes its seen messages on the server. */
export const closeChat = (chatId) =>
  request({ method: "post", url: "/api/chat/close-chat", data: { chatId }, timeout: 5000 });

/** Variant that survives the page being closed or reloaded (fetch keepalive). */
export function closeChatOnUnload(chatId) {
  const token = getToken();
  if (!chatId || !token) return;
  try {
    fetch(`${API_URL}/api/chat/close-chat`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ chatId }),
    }).catch(() => {});
  } catch {
    // ignore: best effort while the page unloads
  }
}

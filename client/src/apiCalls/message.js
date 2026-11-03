import { request } from "./index";

export const createNewMessage = (message) =>
  request({ method: "post", url: "/api/message/new-message", data: message, timeout: 60000 });

export const getAllMessage = (chatId) =>
  request({ method: "get", url: `/api/message/get-all-messages/${chatId}` });

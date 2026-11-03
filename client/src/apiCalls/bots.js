import { request } from "./index";

export const getBots = () => request({ method: "get", url: "/api/bots" });
export const createBot = (bot) => request({ method: "post", url: "/api/bots", data: bot });
export const updateBot = (id, bot) => request({ method: "put", url: `/api/bots/${id}`, data: bot });
export const deleteBot = (id) => request({ method: "delete", url: `/api/bots/${id}` });
export const testBot = (id) => request({ method: "post", url: `/api/bots/${id}/test`, timeout: 100000 });
export const openBotChat = (id) => request({ method: "post", url: `/api/bots/${id}/chat` });

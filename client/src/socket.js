import { io } from "socket.io-client";
import { API_URL } from "./config";
import { getToken } from "./apiCalls";

let socket = null;

/** Returns the shared socket, connecting with the current token if needed. */
export function getSocket() {
  const token = getToken();
  if (socket && socket.auth?.token === token) return socket;
  if (socket) socket.disconnect();
  socket = io(API_URL || undefined, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnectionDelayMax: 10000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

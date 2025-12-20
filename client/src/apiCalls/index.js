import axios from "axios";
export const url = "https://quick-chat-app-server-a1ws.onrender.com";
export const axiosInstance = axios.create({
  headers: {
    authorization: `Bearer ${localStorage.getItem("token")}`,
  },
});

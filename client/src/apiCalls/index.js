import axios from "axios";
import { API_URL } from "../config";

export const TOKEN_KEY = "token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Read the token on every request, so logging in/out never needs a page reload.
axiosInstance.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired/invalid session anywhere outside the auth endpoints sends the user to /login.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = error.config?.url?.startsWith("/api/auth/");
    if (error.response?.status === 401 && !isAuthCall && getToken()) {
      clearToken();
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);

/** Runs a request and always resolves to the `{ success, message, data }` shape. */
export async function request(config) {
  try {
    const response = await axiosInstance.request(config);
    return response.data;
  } catch (error) {
    if (error.response?.data && typeof error.response.data === "object") {
      return { success: false, ...error.response.data };
    }
    const message =
      error.code === "ECONNABORTED"
        ? "The server took too long to respond"
        : "Unable to reach the server. Check your connection.";
    return { success: false, message };
  }
}

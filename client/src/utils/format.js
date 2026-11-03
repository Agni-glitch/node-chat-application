import moment from "moment";

const capitalize = (s = "") => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "");

export function formatName(user) {
  if (!user) return "";
  return [capitalize(user.firstname), capitalize(user.lastname)].filter(Boolean).join(" ");
}

export function getInitials(user) {
  if (!user) return "";
  return ((user.firstname?.[0] || "") + (user.lastname?.[0] || "")).toUpperCase();
}

/** Time shown under each message bubble. */
export function formatMessageTime(timestamp) {
  return moment(timestamp).format("h:mm A");
}

/** Short time shown in the conversation list. */
export function formatListTime(timestamp, now = moment()) {
  if (!timestamp) return "";
  const t = moment(timestamp);
  if (t.isSame(now, "day")) return t.format("h:mm A");
  if (t.isSame(moment(now).subtract(1, "day"), "day")) return "Yesterday";
  if (t.isSame(now, "year")) return t.format("MMM D");
  return t.format("MMM D, YYYY");
}

/** Label for the separators between days in a conversation. */
export function formatDayLabel(timestamp, now = moment()) {
  const t = moment(timestamp);
  if (t.isSame(now, "day")) return "Today";
  if (t.isSame(moment(now).subtract(1, "day"), "day")) return "Yesterday";
  return t.format(t.isSame(now, "year") ? "dddd, MMM D" : "MMM D, YYYY");
}

export const sameDay = (a, b) => moment(a).isSame(moment(b), "day");

/** Reads a File as a base64 data URL. */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** The member of a chat who is not the current user. */
export const otherMember = (chat, currentUserId) =>
  chat?.members?.find((m) => m._id !== currentUserId) || null;

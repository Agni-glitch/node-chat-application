// Base URL of the API / Socket.IO server.
// - Set REACT_APP_API_URL at build time when the API lives on another origin.
// - Leave it empty in production to use the same origin (SERVE_CLIENT=true on the server).
const fromEnv = (process.env.REACT_APP_API_URL || "").trim().replace(/\/$/, "");

export const API_URL =
  fromEnv || (process.env.NODE_ENV === "development" ? "http://localhost:5000" : "");

export const MAX_IMAGE_MB = Number(process.env.REACT_APP_MAX_IMAGE_MB) || 5;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// Must match server/utils/socialLinks.js (the server is the source of truth for validation).
export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: "fa-instagram", placeholder: "instagram.com/username" },
  { key: "twitter", label: "X (Twitter)", icon: "fa-twitter", placeholder: "x.com/username" },
  { key: "facebook", label: "Facebook", icon: "fa-facebook", placeholder: "facebook.com/username" },
  { key: "linkedin", label: "LinkedIn", icon: "fa-linkedin", placeholder: "linkedin.com/in/username" },
  { key: "github", label: "GitHub", icon: "fa-github", placeholder: "github.com/username" },
  { key: "youtube", label: "YouTube", icon: "fa-youtube-play", placeholder: "youtube.com/@channel" },
  { key: "tiktok", label: "TikTok", icon: "fa-music", placeholder: "tiktok.com/@username" },
  { key: "website", label: "Website", icon: "fa-globe", placeholder: "yourwebsite.com" },
];

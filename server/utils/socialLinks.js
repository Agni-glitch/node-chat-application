const HttpError = require("./httpError");

// Allowed platforms and the hostnames their links must point to. `null` = any site.
const PLATFORMS = {
  instagram: { label: "Instagram", domains: ["instagram.com"] },
  twitter: { label: "X (Twitter)", domains: ["twitter.com", "x.com"] },
  facebook: { label: "Facebook", domains: ["facebook.com", "fb.com"] },
  linkedin: { label: "LinkedIn", domains: ["linkedin.com"] },
  github: { label: "GitHub", domains: ["github.com"] },
  youtube: { label: "YouTube", domains: ["youtube.com", "youtu.be"] },
  tiktok: { label: "TikTok", domains: ["tiktok.com"] },
  website: { label: "Website", domains: null },
};

const MAX_URL_LENGTH = 300;

function normalizeUrl(platform, raw) {
  const { label, domains } = PLATFORMS[platform];
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, `${label}: please enter a valid link`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new HttpError(400, `${label}: only http(s) links are allowed`);
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) throw new HttpError(400, `${label}: please enter a valid link`);
  if (domains && !domains.some((d) => host === d || host.endsWith(`.${d}`))) {
    throw new HttpError(400, `${label}: the link must be on ${domains.join(" or ")}`);
  }
  if (domains && url.pathname.replace(/\/+$/, "") === "") {
    throw new HttpError(400, `${label}: link to your profile, not the home page`);
  }
  const out = url.toString();
  if (out.length > MAX_URL_LENGTH) throw new HttpError(400, `${label}: link is too long`);
  return out;
}

/** Validates `{ platform: url }` input. Empty values remove a link. Unknown keys are rejected. */
function normalizeSocialLinks(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "socialLinks must be an object");
  }
  const result = {};
  for (const [platform, value] of Object.entries(input)) {
    if (!PLATFORMS[platform]) throw new HttpError(400, `Unsupported platform: ${platform}`);
    if (value === null || value === undefined || (typeof value === "string" && !value.trim())) continue;
    if (typeof value !== "string") throw new HttpError(400, `${PLATFORMS[platform].label}: link must be text`);
    result[platform] = normalizeUrl(platform, value);
  }
  return result;
}

module.exports = { PLATFORMS, normalizeSocialLinks };

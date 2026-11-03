/**
 * CORS origin matching.
 *
 * CLIENT_URL entries are exact origins (`https://chat.example.com`) or patterns with `*`
 * in the hostname (`https://quick-chat-*.vercel.app`). A `*` matches one or more
 * letters, digits or hyphens, never a dot, so `https://*.vercel.app` can't match
 * `https://evil.com/.vercel.app` or `https://a.b.vercel.app`.
 */

const normalize = (origin) => String(origin).trim().replace(/\/$/, "").toLowerCase();

const escapeRegex = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Throws if a pattern is malformed, so a bad CLIENT_URL fails at startup, not at request time. */
function toMatcher(entry) {
  const value = normalize(entry);
  const match = /^(https?):\/\/([^/?#]+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid CLIENT_URL entry "${entry}": expected an origin like https://app.example.com`);
  }
  if (!value.includes("*")) return (origin) => origin === value;

  const [, scheme, host] = match;
  const labels = host.split(".");
  if (labels.length < 3 || labels.slice(-2).some((l) => l.includes("*"))) {
    // Refuse things like https://*.app or https://*.*, which would allow almost any site.
    throw new Error(`Invalid CLIENT_URL pattern "${entry}": "*" is not allowed in the registrable domain`);
  }
  const hostRegex = escapeRegex(host).replace(/\*/g, "[a-z0-9-]+");
  const regex = new RegExp(`^${scheme}://${hostRegex}$`);
  return (origin) => regex.test(origin);
}

/** Returns `(origin) => boolean` for a list of exact origins and patterns. */
function createOriginMatcher(entries) {
  const matchers = entries.map(toMatcher);
  return (origin) => {
    if (!origin) return false;
    const value = normalize(origin);
    return matchers.some((m) => m(value));
  };
}

module.exports = { createOriginMatcher };

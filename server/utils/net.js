const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");
const config = require("../config/env");
const HttpError = require("./httpError");

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") ||
      v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
  }
  return true;
}

/** DNS lookup that refuses to connect to private addresses (blocks SSRF and DNS rebinding). */
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad) return callback(Object.assign(new Error("Private network addresses are not allowed"), { code: "EPRIVATE" }));
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/** Validates a user-supplied API base URL. */
function assertSafeBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Base URL must be a valid URL, e.g. https://openrouter.ai/api/v1");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new HttpError(400, "Base URL must be an http(s) URL without credentials");
  }
  if (!config.ai.allowPrivateEndpoints) {
    if (url.protocol !== "https:") throw new HttpError(400, "Base URL must use https");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || (net.isIP(host) && isPrivateIp(host))) {
      throw new HttpError(400, "Base URL must be a public address");
    }
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * Minimal JSON HTTP client for AI providers: no redirects, timeout, response size cap,
 * and (unless private endpoints are allowed) no connections to private addresses.
 */
function requestJson(urlString, { method = "POST", headers = {}, body, timeoutMs, maxBytes = 30 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!config.ai.allowPrivateEndpoints && net.isIP(host) && isPrivateIp(host)) {
      reject(Object.assign(new Error("Private network addresses are not allowed"), { code: "EPRIVATE" }));
      return;
    }
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          accept: "application/json",
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        lookup: config.ai.allowPrivateEndpoints ? undefined : guardedLookup,
        timeout: timeoutMs || config.ai.requestTimeoutMs,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(Object.assign(new Error("Response too large"), { code: "ETOOBIG" }));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            // non-JSON error pages are reported below
          }
          resolve({ status: res.statusCode, json, text });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { isPrivateIp, assertSafeBaseUrl, requestJson };

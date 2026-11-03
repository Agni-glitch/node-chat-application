const crypto = require("crypto");
const config = require("../config/env");

// AES-256-GCM for provider API keys. The key is derived from AI_KEYS_SECRET.
const key = () => crypto.createHash("sha256").update(config.ai.keysSecret).digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function decrypt(box) {
  if (!box?.data) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };

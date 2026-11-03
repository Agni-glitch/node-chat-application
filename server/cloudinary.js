const cloudinary = require("cloudinary").v2;
const config = require("./config/env");
const HttpError = require("./utils/httpError");

if (config.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/;

/**
 * Validates a base64 image data URL and uploads it to Cloudinary.
 * Returns { url, publicId } of the uploaded image.
 */
async function uploadImage(dataUrl, subfolder) {
  if (typeof dataUrl !== "string" || !DATA_URL_RE.test(dataUrl)) {
    throw new HttpError(400, "Image must be a PNG, JPEG, GIF or WebP file");
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > config.maxImageBytes) {
    throw new HttpError(413, `Image must be smaller than ${Math.round(config.maxImageBytes / 1024 / 1024)} MB`);
  }
  if (!config.cloudinary.enabled) {
    throw new HttpError(503, "Image uploads are not configured on this server");
  }
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: subfolder ? `${config.cloudinary.folder}/${subfolder}` : config.cloudinary.folder,
    resource_type: "image",
  });
  return { url: result.secure_url, publicId: result.public_id };
}

/** Best-effort deletion of uploaded images (errors are logged, never thrown). */
async function deleteImages(publicIds) {
  const ids = publicIds.filter(Boolean);
  if (!ids.length || !config.cloudinary.enabled) return;
  for (let i = 0; i < ids.length; i += 100) {
    try {
      await cloudinary.api.delete_resources(ids.slice(i, i + 100), { resource_type: "image" });
    } catch (err) {
      console.error("[cloudinary] delete failed:", err.message || err);
    }
  }
}

module.exports = { cloudinary, uploadImage, deleteImages };

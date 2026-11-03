/**
 * Cloudinary serves a file as a download when `fl_attachment` is in the URL.
 * (`<a download>` is ignored for cross-origin URLs, so this is the reliable way.)
 */
export function downloadUrlFor(url, filename = "quick-chat-image") {
  if (/^https:\/\/res\.cloudinary\.com\/.+\/image\/upload\//.test(url)) {
    const safe = filename.replace(/[^\w-]+/g, "-").slice(0, 60) || "image";
    return url.replace("/image/upload/", `/image/upload/fl_attachment:${safe}/`);
  }
  return url;
}

/** Downloads an image. Data URLs and same-origin URLs download directly. */
export async function downloadImage(url, filename = "quick-chat-image") {
  const target = downloadUrlFor(url, filename);
  if (target !== url || url.startsWith("data:")) {
    triggerDownload(target, `${filename}.png`);
    return;
  }
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, `${filename}.${(blob.type.split("/")[1] || "png").split("+")[0]}`);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Synchronous data-URL -> Blob, so window.open still runs inside the click (no popup blocking). */
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Opens an image in a new tab. Browsers block top-level data: URLs, so those become blob: URLs. */
export function openImage(url) {
  if (url.startsWith("data:")) {
    const objectUrl = URL.createObjectURL(dataUrlToBlob(url));
    window.open(objectUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

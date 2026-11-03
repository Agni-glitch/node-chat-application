import { request } from "./index";

export const getLoggedUser = () => request({ method: "get", url: "/api/user/get-logged-user" });

export const getAllUser = () => request({ method: "get", url: "/api/user/get-all-user" });

export const uploadProfilePic = (image) =>
  request({ method: "post", url: "/api/user/upload-profile-pic", data: { image }, timeout: 60000 });

export const updateSocialLinks = (socialLinks) =>
  request({ method: "put", url: "/api/user/social-links", data: { socialLinks } });

export const getAppConfig = () => request({ method: "get", url: "/api/config" });

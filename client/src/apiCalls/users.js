import { axiosInstance,url } from "./index";
export const getLoggedUser = async () => {
  try {
    const res = await axiosInstance.get(url+"/api/user/get-logged-user");
    return res.data;
  } catch (error) {
    return error;
  }
};
export const getAllUser = async () => {
  try {
    const res = await axiosInstance.get(url+"/api/user/get-all-user");
    return res.data;
  } catch (error) {
    return error;
  }
};
export const uploadProfilePic = async (image) => {
  try {
    const res = await axiosInstance.post(url+"/api/user/upload-profile-pic",{image});
    return res.data;
  } catch (error) {
    return error;
  }
};

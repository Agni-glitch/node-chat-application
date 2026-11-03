import { request } from "./index";

const post = (url, data) => request({ method: "post", url, data });

export const signupUser = (user) => post("/api/auth/signup", user);
export const loginUser = (user) => post("/api/auth/login", user);
export const verifyEmail = (email, otp) => post("/api/auth/verify-email", { email, otp });
export const resendOtp = (email) => post("/api/auth/resend-otp", { email });
export const forgotPassword = (email) => post("/api/auth/forgot-password", { email });
export const resetPassword = (email, otp, password) => post("/api/auth/reset-password", { email, otp, password });

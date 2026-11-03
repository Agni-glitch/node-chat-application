import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { resendOtp, verifyEmail } from "../../apiCalls/auth";
import { getToken, setToken } from "../../apiCalls";
import AuthLayout from "../../components/AuthLayout";
import OtpField, { useCooldown } from "../../components/OtpField";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useCooldown(location.state?.retryAfter ?? 0);
  const emailLocked = Boolean(location.state?.email);

  if (getToken()) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code from the email");
      return;
    }
    setSubmitting(true);
    const res = await verifyEmail(email.trim(), otp);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.message || "Verification failed");
      if (res.message?.includes("already verified")) navigate("/login", { replace: true, state: { email } });
      return;
    }
    setToken(res.token);
    toast.success(res.message);
    navigate("/", { replace: true });
  }

  async function onResend() {
    if (!email.trim()) {
      toast.error("Enter your email first");
      return;
    }
    const res = await resendOtp(email.trim());
    if (res.data?.retryAfter) setCooldown(res.data.retryAfter);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        emailLocked ? (
          <>
            We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
          </>
        ) : (
          "Enter your email and the 6-digit code we sent you."
        )
      }
      footer={
        <>
          Wrong address? <Link to="/signup">Sign up again</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit}>
        {!emailLocked && (
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        )}
        <OtpField value={otp} onChange={setOtp} autoFocus={emailLocked} />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting || otp.length !== 6}>
          {submitting ? <span className="btn-spinner" /> : "Verify and continue"}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onResend} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </form>
      <p className="auth-note">Can't find it? Check your spam or promotions folder.</p>
    </AuthLayout>
  );
}

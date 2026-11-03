import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { forgotPassword, resetPassword } from "../../apiCalls/auth";
import { getToken } from "../../apiCalls";
import AuthLayout, { PasswordField } from "../../components/AuthLayout";
import OtpField, { useCooldown } from "../../components/OtpField";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState("request"); // "request" -> "reset"
  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useCooldown(0);

  if (getToken()) return <Navigate to="/" replace />;

  async function requestCode(e) {
    e?.preventDefault();
    setSubmitting(true);
    const res = await forgotPassword(email.trim());
    setSubmitting(false);
    if (res.data?.retryAfter) setCooldown(res.data.retryAfter);
    if (!res.success) {
      toast.error(res.message || "Could not send the code");
      // A cooldown error means a code was already sent recently, so continue to the next step.
      if (!res.data?.retryAfter) return;
    } else {
      toast.success(res.message);
    }
    setStep("reset");
  }

  async function onReset(e) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSubmitting(true);
    const res = await resetPassword(email.trim(), otp, password);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.message || "Could not reset your password");
      return;
    }
    toast.success(res.message);
    navigate("/login", { replace: true, state: { email: email.trim() } });
  }

  return (
    <AuthLayout
      title={step === "request" ? "Forgot your password?" : "Set a new password"}
      subtitle={
        step === "request" ? (
          "Enter your email and we'll send you a 6-digit code to reset it."
        ) : (
          <>
            Enter the code sent to <strong>{email}</strong> and choose a new password.
          </>
        )
      }
      footer={
        <>
          Remembered it? <Link to="/login">Back to log in</Link>
        </>
      }
    >
      {step === "request" ? (
        <form className="form" onSubmit={requestCode}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? <span className="btn-spinner" /> : "Send reset code"}
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={onReset}>
          <OtpField value={otp} onChange={setOtp} />
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters. You'll be signed out on all devices."
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting || otp.length !== 6}>
            {submitting ? <span className="btn-spinner" /> : "Reset password"}
          </button>
          <div className="form-row-split">
            <button type="button" className="link-btn" onClick={() => setStep("request")}>
              Use a different email
            </button>
            <button type="button" className="link-btn" onClick={() => requestCode()} disabled={cooldown > 0 || submitting}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

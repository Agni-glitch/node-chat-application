import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { loginUser } from "../../apiCalls/auth";
import { getToken, setToken } from "../../apiCalls";
import AuthLayout, { PasswordField } from "../../components/AuthLayout";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: location.state?.email || "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  if (getToken()) return <Navigate to="/" replace />;

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    const res = await loginUser({ email: form.email.trim(), password: form.password });
    setSubmitting(false);
    if (res.needsVerification) {
      toast(res.message, { icon: "✉️" });
      navigate("/verify-email", { state: { email: res.data.email, retryAfter: res.data.retryAfter } });
      return;
    }
    if (!res.success) {
      toast.error(res.message || "Login failed");
      return;
    }
    setToken(res.token);
    toast.success("Welcome back!");
    navigate("/", { replace: true });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue your conversations."
      footer={
        <>
          Don't have an account? <Link to="/signup">Create one</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit} noValidate={false}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            autoFocus
          />
        </div>
        <PasswordField
          id="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="form-row-end">
          <Link to="/forgot-password" state={{ email: form.email.trim() }} className="small-link">
            Forgot password?
          </Link>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? <span className="btn-spinner" /> : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}

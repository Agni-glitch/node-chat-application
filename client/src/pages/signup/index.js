import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { signupUser } from "../../apiCalls/auth";
import { getToken } from "../../apiCalls";
import AuthLayout, { PasswordField } from "../../components/AuthLayout";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstname: "", lastname: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  if (getToken()) return <Navigate to="/" replace />;

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    const payload = {
      firstname: form.firstname.trim(),
      lastname: form.lastname.trim(),
      email: form.email.trim(),
      password: form.password,
    };
    const res = await signupUser(payload);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.message || "Sign up failed");
      return;
    }
    toast.success(res.message || "Check your inbox for a verification code");
    navigate("/verify-email", { state: { email: res.data.email, retryAfter: res.data.retryAfter } });
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="We'll email you a code to verify your address."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="firstname">First name</label>
            <input
              id="firstname"
              autoComplete="given-name"
              value={form.firstname}
              onChange={update("firstname")}
              maxLength={50}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="lastname">Last name</label>
            <input
              id="lastname"
              autoComplete="family-name"
              value={form.lastname}
              onChange={update("lastname")}
              maxLength={50}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={update("email")} required />
        </div>
        <PasswordField
          id="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update("password")}
          hint="At least 8 characters."
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? <span className="btn-spinner" /> : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}

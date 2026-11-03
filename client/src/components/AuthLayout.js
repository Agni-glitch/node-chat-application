import React from "react";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-hero" aria-hidden="true">
        <div className="auth-hero-content">
          <span className="brand-mark brand-mark-lg">
            <i className="fa fa-comments" />
          </span>
          <h2>Quick Chat</h2>
          <p>Real-time conversations with read receipts, typing indicators and photo sharing.</p>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand-mobile">
            <span className="brand-mark">
              <i className="fa fa-comments" aria-hidden="true" />
            </span>
            Quick Chat
          </div>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <p className="auth-footer">{footer}</p>}
        </div>
      </div>
    </div>
  );
}

export function PasswordField({ id, value, onChange, autoComplete, label = "Password", hint }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-with-action">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
          minLength={autoComplete === "new-password" ? 8 : undefined}
          maxLength={128}
        />
        <button
          type="button"
          className="field-action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <i className={`fa ${visible ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
        </button>
      </div>
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

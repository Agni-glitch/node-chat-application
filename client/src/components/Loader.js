import React from "react";

export default function Loader({ fullscreen = true, label = "Loading" }) {
  return (
    <div className={fullscreen ? "loader-overlay" : "loader-inline"} role="status" aria-live="polite">
      <div className="loader-spinner" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

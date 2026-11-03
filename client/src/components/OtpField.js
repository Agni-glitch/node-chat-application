import React from "react";

/** Single 6-digit code input; works with iOS/Android one-time-code autofill. */
export default function OtpField({ value, onChange, autoFocus = true }) {
  return (
    <div className="field">
      <label htmlFor="otp">6-digit code</label>
      <input
        id="otp"
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="••••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
        autoFocus={autoFocus}
      />
    </div>
  );
}

/** Countdown for "resend code" buttons. */
export function useCooldown(initialSeconds = 0) {
  const [left, setLeft] = React.useState(initialSeconds);
  React.useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, setLeft];
}

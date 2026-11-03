const nodemailer = require("nodemailer");
const config = require("../config/env");
const HttpError = require("./httpError");

const transporter = config.smtp.enabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    // Development fallback: print the email so OTPs can be used without SMTP.
    if (!config.isTest) console.log(`\n[mail] SMTP not configured, printing instead.\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
  } catch (err) {
    console.error("[mail] send failed:", err.message);
    throw new HttpError(502, "We couldn't send the email right now. Please try again shortly.");
  }
}

const COPY = {
  verify: {
    subject: (code) => `${code} is your Quick Chat verification code`,
    intro: "Use this code to verify your email address and finish creating your Quick Chat account.",
  },
  reset: {
    subject: (code) => `${code} is your Quick Chat password reset code`,
    intro: "Use this code to reset your Quick Chat password. If you didn't ask for this, you can ignore this email.",
  },
};

function sendOtpEmail(to, code, purpose) {
  const copy = COPY[purpose];
  const minutes = config.otp.ttlMinutes;
  const text = `${copy.intro}\n\nYour code: ${code}\n\nIt expires in ${minutes} minutes. Never share this code with anyone.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#171a2c">
    <h2 style="margin:0 0 12px">Quick Chat</h2>
    <p style="margin:0 0 20px;line-height:1.5">${copy.intro}</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px;text-align:center;background:#eef2ff;border-radius:12px;color:#4338ca">${code}</div>
    <p style="margin:20px 0 0;color:#646a86;font-size:14px">This code expires in ${minutes} minutes. Never share it with anyone.</p>
  </div>`;
  return sendMail({ to, subject: copy.subject(code), text, html });
}

module.exports = { sendMail, sendOtpEmail };

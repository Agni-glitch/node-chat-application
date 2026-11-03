# Changelog

## 2.1.0 — verified accounts, disappearing messages, profile links

### Added
- **Email verification by OTP.** Sign-up emails a 6-digit code, and accounts can't log in until it's confirmed.
  Codes are hashed, single-use, expire in 10 minutes and are burned after 5 wrong guesses; resends have a 60 s cooldown.
  Domains that can't receive email are rejected. Unverified sign-ups are deleted after 24 h, and their email can be claimed again.
  Accounts created before this release verify on their next login.
- **Forgot password.** Request a code by email, then set a new password. A reset revokes every existing session
  (via a token version check) and disconnects open sockets.
- **Disappearing messages.** A seen message is permanently deleted 2 minutes after it was read (configurable),
  with a live countdown in the UI. Closing a chat (switching chats, back button, leaving the page, logging out,
  closing the tab) immediately deletes all of its seen messages. Attached images are deleted from Cloudinary too.
  Clients are notified through the new `messages-deleted` event.
- **Profile links** for Instagram, X/Twitter, Facebook, LinkedIn, GitHub, YouTube, TikTok and a website.
  Each link is checked against its platform's domain (only http/https), edited on the profile page, shown in a
  new contact panel, and pushed live to chat partners (`user-updated`).
- `GET /api/config`, SMTP mailer (console fallback in development), new env vars (see `server/.env.example`).

### Changed
- Authenticated requests and sockets now check the database: the account must exist and be verified,
  and the token must have been issued after the last password reset.
- Search and new chats only include verified users.

### Upgrade notes
- Production now **requires SMTP** settings.
- Existing seen messages are scheduled for deletion on first start (about 2 minutes later).
- Run once with `MONGO_AUTO_INDEX=true` to create the new TTL indexes.

## 2.0.0 — production hardening & redesign

### Security
- Removed committed credentials (`server/config.env`, hardcoded Cloudinary keys); all config now comes from environment variables, validated on startup. **Rotate the old credentials. They remain in git history.**
- Fixed message routes that used the auth *router* instead of the auth *middleware*, which left them unauthenticated.
- Added per-chat authorization: only members can read, post or clear a chat; the sender is always the authenticated user.
- Socket.IO connections now require a valid JWT; rooms and presence are derived from the token, not client input.
- Signup whitelists fields (no mass assignment), validates input, normalises emails and adds a unique index.
- Login returns one generic error, so it can't be used to check which emails have accounts.
- Added Helmet (with CSP when serving the client), CORS allow-list, rate limiting, body size limits and a central error handler.
- Images are validated (type/size) and uploaded to Cloudinary instead of being stored as base64 in MongoDB.

### Fixes
- Every message is now delivered in real time (previously `socket.once` delivered only the first per connection).
- Read receipts persist (wrong `chatId` source) and reach the sender (wrong event name).
- Duplicate socket listeners, duplicated chats in the list, stuck typing indicator, presence never cleared on disconnect, and a re-render loop on the home page.
- Duplicate chats between the same two users are no longer created; the other user sees new chats immediately.
- `npm start` no longer runs nodemon; graceful shutdown, `/api/health`, correct DB error logging.

### UI
- Full redesign: new auth pages, conversation list with previews/badges/presence, message bubbles with day separators and read ticks, typing animation, image preview before sending, lazy-loaded emoji picker.
- Responsive mobile layout and automatic dark mode; fonts and icons bundled (no CDN).

### Tooling & docs
- `.env.example` files, root scripts, Dockerfile, GitHub Actions CI, server API tests, client unit tests.
- New README, [API reference](docs/API.md) and [deployment guide](docs/DEPLOYMENT.md).

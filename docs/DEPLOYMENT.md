# Deployment guide

Quick Chat has two parts:

- **server/**: Express REST API + Socket.IO (Node ≥ 18.18, MongoDB)
- **client/**: React single-page app (Create React App), built to static files

You can deploy them as **one service** (simplest, no CORS) or as **two services**.

---

## Before your first production deploy

1. **Rotate every credential that was ever committed.** Earlier versions of this repo
   contained a MongoDB password, Cloudinary API secret and JWT secret in git history.
   Removing the files does not remove them from history, so treat them as public:
   - MongoDB Atlas → *Database Access* → edit the user → new password (or create a new user and delete the old one).
     Also check *Network Access* is not `0.0.0.0/0` unless you need it.
   - Cloudinary → *Settings → API Keys* → generate a new key pair and revoke the old one.
   - Generate a new `JWT_SECRET` (this logs everybody out once):
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - Optionally purge history with [`git filter-repo`](https://github.com/newren/git-filter-repo)
     and force-push. Rotating is still required either way.
2. **Build the indexes once.** Start the server one time with `MONGO_AUTO_INDEX=true`.
   This creates the unique email index plus the TTL indexes that expire OTP codes,
   unverified sign-ups and seen messages. If existing data has duplicate emails
   (or mixed-case duplicates), index creation fails; clean those up first.
   If you later change `SEEN_MESSAGE_TTL_SECONDS`, drop the `readAt_ttl` index so it is rebuilt.
3. **Configure email (SMTP).** Production refuses to start without `SMTP_HOST`, because
   nobody could verify an account or reset a password. Any SMTP provider works (SendGrid,
   Mailgun, Resend, Amazon SES, Brevo, Gmail with an app password). Set up SPF/DKIM for
   your sending domain so the codes don't land in spam.
4. **Know what happens to existing data on the first start of this version:**
   - Messages that were already seen get their 2-minute timer started at boot, so
     **existing seen messages are deleted about 2 minutes after the first deploy.** Back up first if you need them.
   - Existing users must verify their email by code the next time they log in, and
     older login tokens stop working.

---

## Option A: one service (recommended)

The server serves the React build, so the API, sockets and UI share one origin.

### Render / Railway / Fly / any Node host

| Setting        | Value |
| -------------- | ----- |
| Root directory | repository root |
| Build command  | `npm run build` |
| Start command  | `npm start` |
| Health check   | `/api/health` |

Environment variables:

```
NODE_ENV=production
SERVE_CLIENT=true
MONGODB_URI=...
JWT_SECRET=...            # ≥ 32 chars
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Quick Chat <no-reply@yourdomain.com>"
# CLIENT_URL is optional here; add other origins if anything else calls the API.
```

Leave `REACT_APP_API_URL` **unset** so the client calls its own origin.
Most hosts set `PORT` automatically; the server reads it.

### Docker

```bash
docker build -t quick-chat .
docker run -d -p 5000:5000 --env-file server/.env -e NODE_ENV=production -e SERVE_CLIENT=true quick-chat
```

The image runs as the non-root `node` user and includes a `HEALTHCHECK` on `/api/health`.

---

## Option B: separate API and static client

### API (e.g. Render Web Service)

| Setting        | Value |
| -------------- | ----- |
| Root directory | `server` |
| Build command  | `npm ci --omit=dev` |
| Start command  | `npm start` |

Environment: as above, but `SERVE_CLIENT=false` and
`CLIENT_URL=https://your-client.example.com` (comma-separate several origins).

### Client (Render Static Site, Netlify, Vercel, S3 + CloudFront…)

| Setting           | Value |
| ----------------- | ----- |
| Root directory    | `client` |
| Build command     | `npm ci && npm run build` |
| Publish directory | `build` |

Build-time environment:

```
REACT_APP_API_URL=https://your-api.example.com
GENERATE_SOURCEMAP=false
```

**Add an SPA rewrite** so deep links like `/profile` work: rewrite `/*` → `/index.html`
(Netlify: `_redirects` file with `/* /index.html 200`; Render: *Redirects/Rewrites*;
Vercel: `rewrites` in `vercel.json`).

---

## Production checklist

- [ ] Credentials rotated (see above) and stored only in the host's secret manager
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` ≥ 32 random characters
- [ ] `CLIENT_URL` lists exactly your front-end origin(s), or `SERVE_CLIENT=true`
- [ ] Indexes built once with `MONGO_AUTO_INDEX=true`
- [ ] SMTP configured and a test verification email received (check spam / SPF / DKIM)
- [ ] Backed up any existing seen messages you want to keep (they're deleted after the first start)
- [ ] Health check pointed at `/api/health`
- [ ] HTTPS enabled (the host usually terminates TLS; `TRUST_PROXY` defaults to `1` in production)
- [ ] MongoDB backups enabled

## Scaling notes

- Online presence and Socket.IO rooms live in process memory, so run **one instance**,
  or add the [`@socket.io/redis-adapter`](https://socket.io/docs/v4/redis-adapter/)
  and a shared presence store before scaling horizontally. Rate-limit counters are
  also per-instance. The message-cleanup job is safe to run on several instances
  (deletes are idempotent), but each instance only notifies its own sockets unless
  you add the Redis adapter.
- Images are stored in Cloudinary; MongoDB only stores their URLs. Messages from
  older versions that embedded base64 images still display.
- `GET /api/message/get-all-messages/:chatId` returns the whole history. Add
  pagination if conversations get very long.

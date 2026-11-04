# Deployment guide

Quick Chat has two parts:

- **server/**: Express REST API + Socket.IO (Node ≥ 24, MongoDB)
- **client/**: React single-page app (Create React App), built to static files

The server holds WebSocket connections open and runs a cleanup job every few seconds, so it needs a
**long-running Node host**. Pick one of these setups:

| Setup | Client | API | When to use |
| --- | --- | --- | --- |
| [**Vercel + Render**](#vercel--render) (recommended) | Vercel | Render | Global CDN for the UI, a preview deploy for every PR |
| [**One service**](#one-service) | served by the API | Render, Railway, Fly.io, VPS | Simplest, no CORS |
| [**Docker**](#docker) | served by the API | any container host | You already run containers |

> **Why not put the API on Vercel too?** Vercel Functions are short-lived and can't keep Socket.IO
> connections open, presence lives in memory, and the disappearing-message sweeper needs a process that
> stays up. Running the API there would break real-time chat, so it goes on a regular Node host.

---

## Before your first production deploy

1. **Rotate every credential that was ever committed.** Earlier versions of this repo
   contained a MongoDB password, Cloudinary API secret and JWT secret in git history.
   Removing the files does not remove them from history, so treat them as public:
   - MongoDB Atlas → *Database Access* → edit the user → new password (or create a new user and delete the old one).
   - Cloudinary → *Settings → API Keys* → generate a new key pair and revoke the old one.
   - Generate a new `JWT_SECRET` (this logs everybody out once):
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - Optionally purge history with [`git filter-repo`](https://github.com/newren/git-filter-repo)
     and force-push. Rotating is still required either way.
2. **Build the indexes.** Start the server at least once with `MONGO_AUTO_INDEX=true` (the Render
   Blueprint leaves it on). This creates the unique email index plus the TTL indexes that expire OTP codes,
   unverified sign-ups and seen messages. If existing data has duplicate emails
   (or mixed-case duplicates), index creation fails; clean those up first.
   If you later change `SEEN_MESSAGE_TTL_SECONDS`, drop the `readAt_ttl` index so it is rebuilt.
3. **Set `AI_KEYS_SECRET`** (≥ 32 random characters) to enable AI models. It encrypts users' provider API keys.
   Keep it stable and secret: changing it makes stored keys unreadable, and users would have to re-enter them.
   Without it the app works normally, but AI features are disabled.
4. **Configure email (SMTP).** Production refuses to start without `SMTP_HOST`, because
   nobody could verify an account or reset a password. Any SMTP provider works (Resend, SendGrid,
   Mailgun, Amazon SES, Brevo, Gmail with an app password). Set up SPF/DKIM for
   your sending domain so the codes don't land in spam.
5. **Know what happens to existing data on the first start of this version:**
   - Messages that were already seen get their 2-minute timer started at boot, so
     **existing seen messages are deleted about 2 minutes after the first deploy.** Back up first if you need them.
   - Existing users must verify their email by code the next time they log in, and
     older login tokens stop working.

---

## Vercel + Render

### 1. MongoDB Atlas

1. Create a cluster (the free M0 tier is fine to start) and a database user with a strong password.
2. *Network Access*: Render's outbound IPs aren't fixed on most plans, so either allow `0.0.0.0/0` and rely
   on the strong password, or use a plan with static outbound IPs and allow only those.
3. Copy the connection string and add a database name:
   `mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/quick-chat`.

### 2. API on Render

The repo includes a [Render Blueprint](../render.yaml).

1. Render dashboard → **New → Blueprint** → connect this repository.
2. Fill in the prompted values: `MONGODB_URI`, SMTP settings, `MAIL_FROM` and Cloudinary keys.
   `JWT_SECRET` and `AI_KEYS_SECRET` are generated for you. For `CLIENT_URL`, enter a placeholder
   such as `https://example.com`; you'll set the real value in step 4.
3. Deploy, wait for the health check (`/api/health`) to pass, and copy the service URL, e.g.
   `https://quick-chat-api.onrender.com`.

The Blueprint uses the **Starter** plan. The free plan is fine for trying things out, but it sleeps after
15 minutes without traffic: the next request takes 30–60 s to wake it, and open sockets drop.

<details>
<summary>Setting it up by hand instead of with the Blueprint</summary>

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | `server` |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment: `NODE_ENV=production`, `SERVE_CLIENT=false`, `NODE_VERSION=24`, `MONGO_AUTO_INDEX=true`, plus
everything under [Environment variables](#environment-variables).
</details>

Railway, Fly.io or a VPS work the same way: root directory `server`, `npm ci --omit=dev`, `npm start`,
health check `/api/health`.

### 3. Client on Vercel

[vercel.json](../vercel.json) already sets the install and build commands, the output directory
(`client/build`), SPA rewrites, long-term caching for hashed assets and security headers, so you don't
need to change any build settings.

1. Vercel dashboard → **Add New → Project** → import this repository.
   Keep **Root Directory** as the repository root.
2. Under **Environment Variables**, add these for *Production* and *Preview*:

   | Name | Value |
   | --- | --- |
   | `REACT_APP_API_URL` | your Render URL, e.g. `https://quick-chat-api.onrender.com` (no `/api` suffix) |
   | `REACT_APP_MAX_IMAGE_MB` | `5` (optional; match the server's `MAX_IMAGE_MB`) |

3. Deploy. If `REACT_APP_API_URL` is missing, not https, or has a path, the build stops with a clear
   message from [client/scripts/check-env.js](../client/scripts/check-env.js) instead of shipping a broken app.

`REACT_APP_*` values are compiled into the bundle. They're public, and **changing one requires a redeploy**.

**Node version:** Vercel reads `engines.node` (`>=24`) from the root `package.json` and builds with Node 24 or newer.
If your project settings pin an older version, set *Settings → General → Node.js Version* to 24.x or later:
Node 22 ships npm 10, which can't install the npm 11 lockfiles in this repo.

### 4. Connect the two

On Render, set `CLIENT_URL` to your Vercel production URL, then redeploy the API:

```
CLIENT_URL=https://quick-chat.vercel.app
```

Open the Vercel URL, sign up, and check that the verification email arrives. If the browser console shows a
CORS error, `CLIENT_URL` doesn't exactly match the origin in the address bar (scheme included, no path).

### Preview deployments

Vercel builds every pull request at a URL like `https://quick-chat-git-my-branch-your-team.vercel.app`.
To let previews call the API, add a pattern to `CLIENT_URL`. A `*` matches letters, digits and hyphens
inside one hostname label, never a dot:

```
CLIENT_URL=https://quick-chat.vercel.app,https://quick-chat-*-your-team.vercel.app
```

Include your team or username suffix so the pattern only matches your own deployments. Overly broad
patterns such as `https://*.vercel.app` are rejected at startup.

Previews then share the production database. To keep them apart, run a second Render service with its own
database and set the *Preview* value of `REACT_APP_API_URL` in Vercel to that service.

### Custom domains

- **Client:** add `chat.example.com` in Vercel → *Settings → Domains*, then add it to `CLIENT_URL` on Render.
- **API:** add `api.example.com` in Render → *Settings → Custom Domains*, then update `REACT_APP_API_URL`
  in Vercel and redeploy the client.

### Tightening the CSP

`vercel.json` allows `connect-src 'self' https: wss:` because the API origin is only known at build time.
Once your API URL is fixed, you can narrow it, for example to
`connect-src 'self' https://api.example.com wss://api.example.com`.

---

## One service

The server serves the React build, so the API, sockets and UI share one origin.

| Setting        | Value |
| -------------- | ----- |
| Root directory | repository root |
| Build command  | `npm run build` |
| Start command  | `npm start` |
| Health check   | `/api/health` |

Set `SERVE_CLIENT=true` and leave `REACT_APP_API_URL` **unset** so the client calls its own origin.
`CLIENT_URL` is optional here; add other origins only if something else calls the API.

## Docker

```bash
docker build -t quick-chat .
docker run -d -p 5000:5000 --env-file server/.env -e NODE_ENV=production -e SERVE_CLIENT=true quick-chat
```

The image runs as the non-root `node` user and includes a `HEALTHCHECK` on `/api/health`.

---

## Environment variables

Production values for the API. The full, commented list is in [server/.env.example](../server/.env.example).

```
NODE_ENV=production
MONGODB_URI=...
JWT_SECRET=...            # ≥ 32 chars
CLIENT_URL=...            # Vercel URL(s); not needed with SERVE_CLIENT=true
SERVE_CLIENT=false        # true for the one-service setup
MONGO_AUTO_INDEX=true     # at least on the first start
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Quick Chat <no-reply@yourdomain.com>"
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
AI_KEYS_SECRET=...        # ≥ 32 chars, enables AI models
```

Most hosts set `PORT` automatically; the server reads it.

---

## Production checklist

- [ ] Credentials rotated (see above) and stored only in the host's secret manager
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` ≥ 32 random characters
- [ ] `CLIENT_URL` lists exactly your front-end origin(s), plus a scoped preview pattern if you use previews, or `SERVE_CLIENT=true`
- [ ] `REACT_APP_API_URL` set in Vercel (Production and Preview) and pointing at the API over https
- [ ] API on a plan that doesn't sleep, so sockets stay connected
- [ ] Indexes built with `MONGO_AUTO_INDEX=true`
- [ ] `AI_KEYS_SECRET` set (if you want AI models) and backed up somewhere safe
- [ ] Cloudinary configured (required for AI image generation in production)
- [ ] SMTP configured and a test verification email received (check spam / SPF / DKIM)
- [ ] Backed up any existing seen messages you want to keep (they're deleted after the first start)
- [ ] Health check pointed at `/api/health`
- [ ] HTTPS everywhere (Vercel and Render terminate TLS; `TRUST_PROXY` defaults to `1` in production)
- [ ] MongoDB backups enabled

## Scaling notes

- Online presence and Socket.IO rooms live in process memory, so run **one instance**,
  or add the [`@socket.io/redis-adapter`](https://socket.io/docs/v4/redis-adapter/)
  and a shared presence store before scaling horizontally. Rate-limit counters are
  also per-instance. The message-cleanup job is safe to run on several instances
  (deletes are idempotent), but each instance only notifies its own sockets unless
  you add the Redis adapter. AI rate limits are also per-instance.
- AI requests are made by the server with each user's own key, so provider costs go to that user.
  Custom `openai-compatible` endpoints are restricted to public https addresses in production
  (DNS is checked at connect time), so users can't make your server call internal services.
- Images are stored in Cloudinary; MongoDB only stores their URLs. Messages from
  older versions that embedded base64 images still display.
- `GET /api/message/get-all-messages/:chatId` returns the whole history. Add
  pagination if conversations get very long.

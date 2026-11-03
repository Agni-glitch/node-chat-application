# API reference

Base URL: `http://localhost:5000` in development, or your deployed server.

Every JSON response has the shape:

```json
{ "success": true, "message": "Human readable text", "data": {} }
```

Errors use standard HTTP status codes (`400` validation, `401` unauthenticated,
`404` not found or not a member, `409` conflict, `413` too large, `429` rate limited,
`503` dependency unavailable) with `success: false`.

## Authentication

Protected endpoints require a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are issued by `POST /api/auth/login` and expire after `JWT_EXPIRES_IN` (default `1d`).

## Public config

### `GET /api/config`

No auth. `{ seenMessageTtlSeconds, maxImageMb, otpResendCooldownSeconds, serverTime }`.
The client uses `serverTime` to correct for clock skew in message countdowns.

## Health

### `GET /api/health`

No auth. Returns `200` when the database is connected, `503` otherwise. Use it for
load-balancer / container health checks.

```json
{ "status": "ok", "db": "up", "uptime": 123.4 }
```

## Auth — `/api/auth` (rate limited: `AUTH_RATE_LIMIT` per 15 min per IP)

Accounts must verify their email with a 6-digit code (OTP) before they can log in.
Codes are emailed, stored hashed, expire after `OTP_TTL_MINUTES` (10), are single-use,
are burned after `OTP_MAX_ATTEMPTS` (5) wrong guesses, and can be re-sent at most every
`OTP_RESEND_COOLDOWN_SECONDS` (60). Endpoints that send a code return `data.retryAfter` (seconds).

### `POST /api/auth/signup`

| Field       | Type   | Rules                         |
| ----------- | ------ | ----------------------------- |
| `firstname` | string | required, ≤ 50 chars          |
| `lastname`  | string | required, ≤ 50 chars          |
| `email`     | string | required, valid, domain must accept mail, unique (case-insensitive) |
| `password`  | string | 8–128 chars                   |

Creates an **unverified** account and emails a verification code. Returns `201`
`{ data: { email, retryAfter } }`, or `409` if a verified account already uses the email.
Signing up again with an unverified email replaces the pending details and sends a new code.
Unverified accounts are deleted after `UNVERIFIED_ACCOUNT_TTL_HOURS` (24). Other fields are ignored.

### `POST /api/auth/verify-email`

Body `{ email, otp }`. On success returns `{ token }`, so the user is logged in straight away.
`400` for a wrong/expired code (message says how many attempts are left), `409` if already verified.

### `POST /api/auth/resend-otp`

Body `{ email }`. Sends a new verification code. `429` during the cooldown.
Unknown or already verified emails get the same `200` response.

### `POST /api/auth/login`

Body: `{ "email", "password" }`. Returns `{ token }` on success, or `401`
"Invalid email or password" (the same message whether or not the account exists).
If the password is right but the email isn't verified yet (including accounts created
before verification existed), returns `403` with `needsVerification: true` and emails a code.

### `POST /api/auth/forgot-password`

Body `{ email }`. Emails a password-reset code if the account exists. Always `200` with the
same message, so it can't be used to find out which emails have accounts (`429` during the cooldown).

### `POST /api/auth/reset-password`

Body `{ email, otp, password }`. Sets the new password, marks the email verified, and
**signs the account out everywhere**: existing tokens stop working and open sockets are disconnected.

## Users — `/api/user` (auth required)

| Method | Path                  | Description |
| ------ | --------------------- | ----------- |
| GET    | `/get-logged-user`    | The current user. |
| GET    | `/get-all-user`       | Every other **verified** user (`firstname`, `lastname`, `email`, `profilePic`, `socialLinks`, `createdAt`), for search. |
| POST   | `/upload-profile-pic` | Body `{ image }`: a base64 data URL (PNG, JPEG, GIF or WebP, ≤ `MAX_IMAGE_MB`). Uploads to Cloudinary and returns the updated user. `503` if Cloudinary is not configured. |
| PUT    | `/social-links`       | Body `{ socialLinks: { instagram?, twitter?, facebook?, linkedin?, github?, youtube?, tiktok?, website? } }`. Replaces all links; empty values remove one. Links may omit `https://`; each must be http(s) and on the platform's domain (e.g. `instagram.com`, `x.com`/`twitter.com`), `website` can be any site. Returns the updated user and emits `user-updated` to chat partners. |

Authenticated requests also require a verified email and a token issued after the last password reset.

## Chats — `/api/chat` (auth required)

| Method | Path                     | Description |
| ------ | ------------------------ | ----------- |
| GET    | `/get-all-chats`         | Chats the user belongs to, newest activity first, with `members` and `lastMessage` populated. |
| POST   | `/create-new-chat`       | Body `{ userId }` (legacy `{ members: [a, b] }` also accepted). Returns the existing chat (`200`) or creates one (`201`). The other user receives a `new-chat` socket event. |
| POST   | `/clear-unread-messages` | Body `{ chatId }`. Marks the other member's messages as read and resets the unread badge. Emits `messages-read` to both members. Sets `readAt`, which starts the disappearing timer. |
| POST   | `/close-chat`            | Body `{ chatId }`. Call when a member closes the conversation: **permanently deletes every seen message in the chat** (and their images). Unseen messages are kept. Returns `{ deleted }` and emits `messages-deleted`. |

## Messages — `/api/message` (auth required, members only)

| Method | Path                        | Description |
| ------ | --------------------------- | ----------- |
| GET    | `/get-all-messages/:chatId` | All messages in the chat, oldest first. |
| POST   | `/new-message`              | Body `{ chatId, text?, image? }`. `text` ≤ 5000 chars; `image` is a base64 data URL uploaded to Cloudinary. At least one is required. The sender is always the authenticated user. Emits `receive-message` to both members. |

Non-members get `404` for any chat they don't belong to.

### Disappearing messages

A message becomes *seen* when its recipient opens the chat (`clear-unread-messages`).
Seen messages are permanently deleted, together with any Cloudinary image:

- `SEEN_MESSAGE_TTL_SECONDS` (default 120) after being seen. A background job runs every
  `MESSAGE_SWEEP_INTERVAL_SECONDS` (15), and a MongoDB TTL index acts as a safety net.
- Immediately, when either member closes the chat (`close-chat`).

Unseen messages are never deleted. Clients are told through `messages-deleted`.

## Socket.IO events

Connect with the JWT in the handshake:

```js
import { io } from "socket.io-client";
const socket = io(API_URL, { auth: { token } });
```

Connections without a valid token are rejected with a `connect_error`.
Each socket automatically joins a room named after its user id. Messages are
sent through the REST API; the socket only delivers events.

### Server → client

| Event             | Payload                         | When |
| ----------------- | ------------------------------- | ---- |
| `online-users`    | `string[]` of user ids          | On any connect/disconnect. |
| `receive-message` | message document                | A message was posted in one of your chats (including your own, for multi-tab sync). |
| `messages-read`   | `{ chatId, readerId, readAt }`  | A member read the chat; the disappearing timer started at `readAt`. |
| `messages-deleted`| `{ chatId, messageIds, lastMessage? }` | Seen messages were deleted (timer or chat closed). `lastMessage` is present (possibly `null`) when the chat preview changed. |
| `user-updated`    | user document                   | A chat partner (or you) changed their profile picture or links. |
| `new-chat`        | chat document (members populated) | Someone started a chat with you. |
| `started-typing`  | `{ chatId, sender }`            | The other member is typing (sent at most every ~2 s). |

### Client → server

| Event         | Payload       | Notes |
| ------------- | ------------- | ----- |
| `user-typing` | `{ chatId }`  | Relayed only if the sender is a member of the chat. |

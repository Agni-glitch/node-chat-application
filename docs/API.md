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

## Groups: `/api/chat/groups` (auth required, members only)

Groups are chats with `type: "group"`, a `name`, `members` (1–`GROUP_MAX_MEMBERS`) and `admins`.
All other chat and message endpoints (`get-all-chats`, `new-message`, `get-all-messages`,
`clear-unread-messages`, `close-chat`, typing, `@mentions`) work for groups too.

| Method | Path                              | Who      | Description |
| ------ | --------------------------------- | -------- | ----------- |
| POST   | `/groups`                         | anyone   | Body `{ name, memberIds }`. Needs at least 2 other verified users. You become the admin. Members get `new-chat`. |
| PUT    | `/groups/:id`                     | admins   | Body `{ name }`. Rename. Everyone gets `chat-updated`. |
| POST   | `/groups/:id/members`             | admins   | Body `{ userIds }`. Add people (they get `new-chat`). Existing unseen messages are treated as seen by newcomers, so they don't block the timer. |
| DELETE | `/groups/:id/members/:userId`     | admins / self | Remove someone, or leave with your own id. The removed user gets `chat-removed`. If the last admin leaves, the longest-standing member becomes admin. When the last member leaves, the group and its messages are deleted. |

**Reads in groups.** Each message keeps `readBy` (members, other than the sender, who have seen it).
It becomes `read` (and gets `readAt`, which starts its disappearing timer) only when **every other current
member** has seen it. If someone leaves, messages everyone remaining has seen become read immediately.
`unreadMessageCount` in `get-all-chats` is per member for groups.

### Disappearing messages

A message becomes *seen* when its recipient opens the chat (`clear-unread-messages`).
Seen messages are permanently deleted, together with any Cloudinary image:

- `SEEN_MESSAGE_TTL_SECONDS` (default 120) after being seen. A background job runs every
  `MESSAGE_SWEEP_INTERVAL_SECONDS` (15), and a MongoDB TTL index acts as a safety net.
- Immediately, when either member closes the chat (`close-chat`).

Unseen messages are never deleted. Clients are told through `messages-deleted`.

## AI models: `/api/bots` (auth required)

Users add their own models and API keys. Keys are encrypted with AES-256-GCM (`AI_KEYS_SECRET`)
and are **never returned**: responses only include `apiKeyLast4`. All routes return `503` if AI is disabled.

| Method | Path          | Description |
| ------ | ------------- | ----------- |
| GET    | `/`           | Your models. |
| POST   | `/`           | Create (body below). `409` if you already have a model with that name. |
| PUT    | `/:id`        | Update any field. Omit `apiKey` to keep the stored key. |
| DELETE | `/:id`        | Delete the model, its private AI chat and all of that chat's messages (`chat-removed` event). |
| POST   | `/:id/test`   | Chat models only: sends a one-line prompt and returns `{ reply }` (checks the key and model id). |
| POST   | `/:id/chat`   | Opens (or creates) your private AI chat with this model and returns the chat. |

| Field          | Rules |
| -------------- | ----- |
| `name`         | 1–30 chars, starts with a letter, letters/digits/`-`/`_`. It's the `@mention` handle (case-insensitive, unique per user). |
| `kind`         | `chat` or `image` |
| `provider`     | `openai`, `anthropic` (chat only), `gemini`, `openai-compatible` |
| `model`        | The provider's model id, e.g. `gpt-5.5`, `gpt-image-1`, `gemini-2.5-flash` |
| `baseUrl`      | Required for `openai-compatible`, e.g. `https://openrouter.ai/api/v1`. Must be public https in production. |
| `apiKey`       | Required except for `openai-compatible` (local servers may not need one) |
| `instructions` | Optional personality for chat models, ≤ 1000 chars |

### How models are called

- **Private AI chat** (`chat.type === "ai"`): every message you send goes to the chat's model, with the last
  `AI_HISTORY_MESSAGES` turns as context. The model "reads" your prompt immediately (`messages-read` with
  `messageIds`), and its reply counts as seen when you view it.
- **Mentions in a person-to-person chat**: `@Name` anywhere in your message calls **your own** model with that
  name (up to 3 per message). Only the text of that message, minus the mention, is sent to the provider. Other
  messages in the conversation are never shared. Mentioning someone else's model does nothing.
- Replies are saved as normal messages with `sender` = the owner who asked and a `bot` snapshot
  `{ id, name, model, kind, provider }`. They follow the disappearing-message rules: deleted
  `SEEN_MESSAGE_TTL_SECONDS` after the other person sees them, or when the chat is closed.
- Text replies are kept short by instruction, an output-token cap, and server-side trimming to `AI_MAX_REPLY_CHARS`.
- Image models store their output in Cloudinary (`503` without Cloudinary in production; development falls back to an inline image).
- Each user gets `AI_RATE_LIMIT_PER_MINUTE` generations per minute, and at most 2 at a time.

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
| `messages-read`   | `{ chatId, readerId, readAt, messageIds?, group? }`  | A member read the chat; the disappearing timer started at `readAt`. |
| `messages-deleted`| `{ chatId, messageIds, lastMessage? }` | Seen messages were deleted (timer or chat closed). `lastMessage` is present (possibly `null`) when the chat preview changed. |
| `user-updated`    | user document                   | A chat partner (or you) changed their profile picture or links. |
| `ai-typing`       | `{ chatId, bot: { name, model, kind }, active }` | A model started (`active: true`) or finished working in a chat. Sent to all members. |
| `ai-error`        | `{ chatId, botName, message }` | Your model failed (bad key, quota, refused prompt…). Sent only to the model's owner. |
| `chat-removed`    | `{ chatId }`                    | A chat was deleted, or you were removed from / left a group. |
| `chat-updated`    | chat document (your view)       | A group you're in was renamed or its members changed. |

For groups, `messages-read` means `readerId` has now seen the group; `messageIds` are the messages that just
became seen by **everyone**, so their timers start at `readAt`. `started-typing` includes `sender`, so
clients can show who is typing.
| `new-chat`        | chat document (members populated) | Someone started a chat with you. |
| `started-typing`  | `{ chatId, sender }`            | The other member is typing (sent at most every ~2 s). |

### Client → server

| Event         | Payload       | Notes |
| ------------- | ------------- | ----- |
| `user-typing` | `{ chatId }`  | Relayed only if the sender is a member of the chat. |

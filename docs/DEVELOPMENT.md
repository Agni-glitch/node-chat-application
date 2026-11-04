# Local development and testing

Everything you need to run Quick Chat on your machine, test changes, and try the production build.
Pick **one** of the three setups below.

| Setup | You install | Best for |
| --- | --- | --- |
| [A. Everything in Docker](#a-everything-in-docker) | Docker Desktop | Trying the project, or not installing Node at all |
| [B. Node + Docker database](#b-node-locally-database-in-docker) (recommended) | Node 24 + Docker Desktop | Day-to-day development: fastest reloads, works with your editor's tooling |
| [C. No Docker](#c-no-docker) | Node 24 + MongoDB | Machines where Docker isn't an option |

Whichever you choose, you'll end up with:

| URL | What |
| --- | --- |
| http://localhost:3000 | The app (React dev server, hot reload) |
| http://localhost:5000/api/health | The API |
| http://localhost:8025 | Mailpit inbox with verification and reset emails (setups A and B) |

---

## A. Everything in Docker

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose v2).

```bash
git clone https://github.com/Agni-glitch/node-chat-application.git
cd node-chat-application
docker compose up
```

The **first start is slow**: the client installs ~1,350 packages into a Docker volume and compiles
(about 10 minutes on a 2-CPU laptop; much less on faster machines). Later starts reuse the volume.
When `docker compose logs client` shows `webpack compiled successfully`, open http://localhost:3000.

> **Already running MongoDB on port 27017** (for example the MongoDB Windows service)? Create a `.env` file
> in the repo root with `MONGO_PORT=27018`. Containers still reach the database internally; only the port
> exposed to your machine changes. `MAILPIT_PORT`, `SMTP_PORT_HOST` and `PROD_PORT` work the same way.

Create demo users (in a second terminal):

```bash
docker compose exec server npm run seed
```

Edit files in `server/` or `client/` on your machine and the containers reload automatically.

> **Hot reload speed on Windows and macOS:** file changes made on the host don't send file-system events
> into containers, so the containers watch by **polling**. It works, but it costs CPU: on a 2-CPU laptop a
> client rebuild can take minutes. For day-to-day development, [setup B](#b-node-locally-database-in-docker)
> reloads almost instantly. On Windows you can also clone the repo inside WSL2 (e.g. `~/code` in Ubuntu),
> run `docker compose` from there, and set `DOCKER_POLLING=false` in the root `.env` to use real file events.

| Task | Command |
| --- | --- |
| Start in the background | `docker compose up -d`, then `docker compose logs -f server` |
| Stop | `docker compose down` |
| Wipe the database too | `docker compose down -v` |
| Run all server tests (unit + end-to-end) | `npm run docker:test`, or `docker compose run --rm server sh -c "npm install && npm test && npm run test:e2e"` |
| Run client tests | `docker compose run --rm client sh -c "npm install && npm run test:ci"` |
| Open a shell in the API container | `docker compose exec server sh` |
| After `package.json` changes | just restart: `docker compose restart server` (or `client`); `npm install` runs on start |

Containers ignore `server/.env` (`SKIP_DOTENV=true`) and use the local values in
[docker-compose.yml](../docker-compose.yml). To enable image uploads, create a `.env` file in the repo root
with your `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. Compose picks it up automatically.

---

## B. Node locally, database in Docker

You need **Node.js 24+** (`nvm use` reads [.nvmrc](../.nvmrc)) and Docker Desktop.

```bash
git clone https://github.com/Agni-glitch/node-chat-application.git
cd node-chat-application

npm run install:all     # install server + client dependencies
npm run setup           # create server/.env and client/.env.local with fresh secrets
npm run docker:db       # start MongoDB (27017) and Mailpit (8025) in Docker
npm run seed            # optional: demo users and chats
npm run dev             # API + app together; Ctrl+C stops both
```

`npm run setup` prints verification codes to the API console by default. To see the emails in Mailpit
instead, set these in `server/.env`:

```env
SMTP_HOST=localhost
SMTP_PORT=1025
```

Prefer two terminals? `npm run dev:server` and `npm run dev:client` do the same as `npm run dev`.

---

## C. No Docker

You need **Node.js 24+** and MongoDB, either installed locally
([Community Server](https://www.mongodb.com/try/download/community)) or a free
[Atlas](https://www.mongodb.com/atlas) cluster.

```bash
npm run install:all
npm run setup
# Using Atlas? Edit MONGODB_URI in server/.env. Use a separate database for development.
npm run seed            # local MongoDB only; refuses remote databases unless you add --force
npm run dev
```

Emails aren't sent. The verification and reset codes are printed in the API output, like this:

```
[api] [mail] SMTP not configured, printing instead.
[api] To: you@example.com
[api] Subject: 123456 is your Quick Chat verification code
```

---

## Demo data

`npm run seed` (or `docker compose exec server npm run seed`) creates:

| Email | Password | Notes |
| --- | --- | --- |
| alice@example.com | `Password123!` | Admin of "Demo group", has an unread message from Bob |
| bob@example.com | `Password123!` | |
| carol@example.com | `Password123!` | |

It's safe to run more than once. It refuses to run with `NODE_ENV=production` or against a non-local
database, so it can't touch real data by accident.

To try realtime features, log in as two users at once: one in a normal window, one in a private window
(or a different browser).

---

## Running tests

| Command (repo root) | What it runs | Needs |
| --- | --- | --- |
| `npm test` | Server unit/API tests + client tests | Nothing (no database) |
| `npm run test:e2e` | End-to-end: real server, sign-up with codes, sockets, disappearing messages, groups, password reset | MongoDB on `127.0.0.1:27017` |
| `npm run docker:test` | Server unit + end-to-end tests inside Docker | Docker |
| `npm test --prefix client` | Client tests in watch mode | Nothing |
| `CI=true npm run build --prefix client` | Production build with warnings as errors, like CI | Nothing |

The end-to-end test **drops its own database** (`quick-chat-e2e`) before and after running. Point it
elsewhere with `E2E_MONGODB_URI`. It refuses non-local hosts unless `E2E_ALLOW_REMOTE=true`.
It takes about 25 seconds because it waits for a seen message to disappear.

CI runs all of the above on every pull request, on Node 24 and 26, plus the Docker checks below.

---

## Testing the production build

### With Docker (same image as a real deploy)

```bash
npm run docker:prod        # docker compose --profile prod up --build app
```

Open http://localhost:8080. The image runs with `NODE_ENV=production` and serves the API and the built
React app from one origin. It uses its own database (`quick-chat-prod`) and sends email to Mailpit
(http://localhost:8025). Seed it with (`--force` because the container runs in production mode):

```bash
docker compose --profile prod exec app node scripts/seed.js --force
```

`HTTPS_ONLY=false` is set because this runs over plain http. Real deploys behind HTTPS keep the default
(`true`), which adds HSTS and `upgrade-insecure-requests`.

### Without Docker

```bash
npm run build                                      # installs deps and builds client/build
SERVE_CLIENT=true HTTPS_ONLY=false npm start       # http://localhost:5000
```

`npm run build` reinstalls the server with production dependencies only. Run `npm run install:all`
afterwards to get the dev tools back.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Missing required environment variable: MONGODB_URI` | Run `npm run setup`, or check `server/.env` exists |
| `[db] initial connection failed` | MongoDB isn't running: `npm run docker:db`, or start your local `mongod` |
| Port 27017 already in use (local MongoDB) | Add `MONGO_PORT=27018` to a `.env` file in the repo root. Same for `MAILPIT_PORT`, `SMTP_PORT_HOST`, `PROD_PORT` |
| Port 3000 or 5000 already in use | Stop whatever uses it (the app and API URLs are wired to these ports) |
| `docker compose up` says `server gave HTTP response to HTTPS client` | Docker Desktop was still starting its network proxy. Wait a minute and retry; `docker pull hello-world` is a quick test |
| `npm error code ECONNRESET` in the `client` or `server` logs | A network hiccup during `npm install`. Run `docker compose up -d` again; it continues where it stopped |
| `mongo` reported unhealthy, `dependency failed to start` | Usually a very busy machine. `docker compose up -d mongo` and retry; the health check allows up to 10 s per probe |
| CORS errors in the browser console | The app must be opened at the origin in `CLIENT_URL` (default `http://localhost:3000`) |
| No verification email | Setup C: look for the code in the API output. Setups A/B: open http://localhost:8025 |
| Hot reload is slow or the fans spin up in Docker (Windows/macOS) | That's polling; see the note under setup A. Use setup B for development, or move the repo into WSL2 with `DOCKER_POLLING=false` |
| Hot reload misses a change in Docker | `docker compose restart client` (or `server`) |
| `npm ci` fails with "Missing: … from lock file" | You're on npm 10 (Node 22). Use Node 24+, which ships npm 11 |
| Client container exits right after starting | Make sure `stdin_open: true` is still set for `client` in `docker-compose.yml` |
| Weird state after switching branches | `docker compose down -v && docker compose up`, or delete `node_modules` and run `npm run install:all` |

# Contributing to Quick Chat

Thanks for taking the time to contribute. Bug reports, docs fixes, tests and features are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
**Security issues** go through [SECURITY.md](SECURITY.md), never public issues.

## Ways to help

- **Report a bug** or **suggest a feature** with the [issue templates](https://github.com/Agni-glitch/node-chat-application/issues/new/choose).
- **Pick up an issue.** [`good first issue`](https://github.com/Agni-glitch/node-chat-application/labels/good%20first%20issue)
  and [`help wanted`](https://github.com/Agni-glitch/node-chat-application/labels/help%20wanted) are good starting points.
  Comment on it first so nobody else duplicates the work.
- **Improve the docs.** If something confused you during setup, it will confuse the next person too.

For anything bigger than a small fix, open an issue to discuss the approach **before** you write the code.
That saves you from building something that can't be merged.

## Development setup

You need **Node.js 22+** (`nvm use` picks the version from [.nvmrc](.nvmrc)), **npm**, and a MongoDB database.

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/node-chat-application.git
cd node-chat-application
git remote add upstream https://github.com/Agni-glitch/node-chat-application.git

npm run install:all
cp server/.env.example server/.env   # set MONGODB_URI and JWT_SECRET
```

A local MongoDB is the easiest option:

```bash
docker run -d --name quick-chat-mongo -p 27017:27017 mongo:7
# server/.env → MONGODB_URI=mongodb://127.0.0.1:27017/quick-chat
```

Leave `SMTP_HOST` empty: verification codes are printed to the server console. Cloudinary and AI settings
are only needed if you're working on image uploads or AI models.

```bash
npm run dev:server   # http://localhost:5000, restarts on change
npm run dev:client   # http://localhost:3000, hot reload
```

To try realtime features, sign up two accounts in two different browsers (or one normal and one private window).

New to the codebase? [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how requests, sockets,
disappearing messages and AI replies flow, and which files to touch for common changes.

## Making a change

1. Sync and branch from `main`:
   ```bash
   git fetch upstream && git checkout -b fix/short-description upstream/main
   ```
   Branch prefixes: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.
2. Make your change, with tests where it makes sense (see below).
3. Run the full check locally. It's what CI runs:
   ```bash
   npm test
   CI=true npm run build --prefix client   # warnings fail the build in CI
   ```
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(chat): show a preview of the replied-to message
   fix(auth): keep the resend cooldown after a page reload
   docs: explain CLIENT_URL wildcards
   ```
5. Push and open a pull request against `main`, then fill in the template.

### Pull request checklist

- [ ] One focused change per PR; unrelated refactors go in a separate PR
- [ ] `npm test` and the client production build pass
- [ ] New behavior has tests; bug fixes have a test that failed before the fix
- [ ] User-visible changes are noted under **Unreleased** in [CHANGELOG.md](CHANGELOG.md)
- [ ] New endpoints, socket events or env vars are documented ([docs/API.md](docs/API.md), [server/.env.example](server/.env.example), README)
- [ ] UI changes include before/after screenshots and work in light mode, dark mode and on mobile

A maintainer will review your PR, usually within a few days. Expect questions or change requests;
that's normal. Once approved, it's squash-merged.

## Coding guidelines

The codebase is plain JavaScript (CommonJS on the server, ES modules + JSX on the client). Match the
style of the file you're editing. [.editorconfig](.editorconfig) sets the basics: 2-space indent,
LF line endings, final newline. The client's ESLint config (`react-app`) runs during `npm start` and `npm run build`.

**Server**
- Take the user id from `req.userId` / `socket.userId`, **never** from the request body.
- Scope every chat or message query to chats the user is a member of (`{ _id, members: req.userId }`).
- Validate and normalize input at the edge (see `server/utils/validation.js`), and return
  `{ success, message, data }` with an appropriate status code.
- New settings go through `server/config/env.js` with a safe default, and are documented in `.env.example`.
- Don't log secrets, tokens, OTP codes (outside the dev console mailer) or message contents.

**Client**
- Keep API calls in `src/apiCalls/` and socket subscriptions in `src/hooks/useChatSocket.js`.
- Shared state goes in Redux; local UI state stays in components.
- Use the existing CSS variables in `index.css` so light and dark themes keep working.
- Make interactive elements keyboard-accessible and labeled.

## Tests

| Where | Runner | Command |
| --- | --- | --- |
| `server/tests/` | [`node:test`](https://nodejs.org/api/test.html) | `npm test --prefix server` |
| `client/src/**/*.test.js` | Jest (react-scripts) | `npm run test:ci --prefix client`, or `npm test --prefix client` for watch mode |

Server tests run **without a database**. They exercise auth, validation, CORS and pure utilities.
Prefer adding unit tests for logic you extract into `server/utils/` or `server/services/`.

## Project conventions

- **Versioning:** [Semantic Versioning](https://semver.org/). The version in the three `package.json` files stays in sync.
- **Changelog:** add entries under `## Unreleased`; maintainers turn them into a release section.
- **Dependencies:** Dependabot opens weekly update PRs. Add new dependencies only when they clearly pay
  for themselves, and explain why in the PR.

## Questions

Open a [discussion or issue](https://github.com/Agni-glitch/node-chat-application/issues) and we'll help.

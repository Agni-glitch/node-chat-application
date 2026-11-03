# Quick Chat: client

React single-page app for Quick Chat. See the [root README](../README.md) for the full setup.

```bash
npm install
cp .env.example .env.local   # optional; defaults to http://localhost:5000
npm start                    # http://localhost:3000
npm run test:ci              # unit tests
npm run build                # production build in ./build
```

## How it fits together

- **`src/apiCalls/`**: one Axios instance. The token is attached on every request, and a
  `401` from any non-auth endpoint logs the user out. Every call resolves to
  `{ success, message, data }`, so callers never need `try/catch`.
- **`src/socket.js`**: a single Socket.IO connection, authenticated with the JWT.
- **`src/hooks/useChatSocket.js`**: subscribes to all realtime events and dispatches them
  to Redux. It is mounted once for all authenticated pages, so events keep arriving on the profile page.
- **`src/redux/userSlice.js`**: user, users, chats, the open conversation's messages,
  online users and typing state. Message de-duplication (REST response + socket echo) happens here.
- **`src/index.css`**: design tokens (CSS custom properties) with an automatic dark theme.

Fonts (Inter) and icons (Font Awesome 4.7) are bundled from npm, so the app loads nothing
from third-party CDNs at runtime.

`REACT_APP_*` variables are embedded at build time and visible to anyone, so never put secrets in them.

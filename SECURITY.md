# Security Policy

## Supported versions

Only the latest release on `main` receives security fixes.

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Report privately through GitHub: go to the repository's **Security** tab →
[**Report a vulnerability**](https://github.com/Agni-glitch/node-chat-application/security/advisories/new).

Include:

- what the issue is and what an attacker could do with it
- steps or a proof of concept to reproduce it
- the affected version or commit, and your deployment setup if it matters

You can expect an acknowledgement within **3 days** and an assessment within **7 days**. We'll keep you
updated while a fix is prepared, and credit you in the advisory unless you'd rather stay anonymous.

## Scope

In scope: this repository's server and client code, and its default configuration.

Especially interesting areas: authentication and OTP flows, chat and group authorization, socket
authentication, message deletion guarantees, AI key encryption, and SSRF protection for custom AI endpoints.

Out of scope: vulnerabilities in third-party services (MongoDB Atlas, Cloudinary, AI providers, hosting
platforms), issues that need a compromised server or `.env`, missing best-practice headers with no
demonstrated impact, and volumetric denial of service.

## For people running their own deployment

- Generate unique, random `JWT_SECRET` and `AI_KEYS_SECRET` values (≥ 32 characters) and keep them in your host's secret manager.
- Set `CLIENT_URL` to exactly your front-end origin(s).
- Keep dependencies updated. Dependabot PRs on this repo are a good signal of when to redeploy.
- See the [production checklist](docs/DEPLOYMENT.md#production-checklist).

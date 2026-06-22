# Open Tome

A self-hosted writing app inspired by Scrivener. Organize long-form projects in a binder, write in a rich text editor with autosave, and export to PDF, DOCX, ePub, or Markdown. Runs anywhere Docker does.

---

## Features

- Binder with drag-and-drop, nested folders
- Rich text editor (TipTap) with split-pane view
- WebSocket autosave with offline fallback
- Corkboard for outlining
- Character and research notes
- Export to PDF, DOCX, ePub, Markdown, Standard Manuscript Format, or ZIP archive
- Writing analytics (heatmap, pace charts, streaks)
- Three themes: light, dark, tome
- Multi-user with invite-based registration
- Encrypted daily database backups

---

## Quick Start

```bash
git clone https://github.com/brian-chalfant/open-tome.git
cd open-tome
cp .env.example .env
```

Edit `.env` and set these two values:

```
POSTGRES_PASSWORD=<pick-a-strong-password>
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
```

Start everything:

```bash
docker compose up -d
```

Open **http://localhost:5137**. The first account you create is the admin. Put a reverse proxy in front for HTTPS in production.

---

## Environment Variables

| Variable | Required | What it does |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | Signs session cookies |
| `JWT_EXPIRY` | No | Session lifetime, default `7d` |
| `ALLOWED_ORIGIN` | Production | Your HTTPS domain for CORS |
| `MANUSCRIPT_ENCRYPTION_KEY` | Production | AES-256 key for author PII |
| `ADMIN_SECRET` | No | Enables admin UI on port 3002 (loopback) |
| `ADMIN_TOKEN_SIGNING_KEY` | With admin | Signs admin tokens |
| `BACKUP_PASSPHRASE` | No | GPG passphrase for backup encryption |

Full docs in `.env.example`.

---

## Inviting Users

Registration is invite-only after the first account:

```bash
curl -X POST https://your-domain.com/api/auth/invite \
  -H "Cookie: tome_token=YOUR_SESSION_COOKIE"
```

Share the returned token. It expires in 7 days and works once.

---

## Development

**Prerequisites:** Node.js 20+, Docker

```bash
cp .env.example .env.dev
docker compose -f docker-compose.dev.yml up --build
```

- Frontend (Vite + HMR): http://localhost:5173
- Backend (nodemon): http://localhost:3001

**Tests:**

```bash
cd server && npm test    # Vitest + pg-mem
cd client && npm test    # Vitest + jsdom
npm run e2e              # Playwright (dev stack must be running)
```

---

## Tech Stack

| | |
|---|---|
| Frontend | React, Vite |
| Editor | TipTap (ProseMirror) |
| Backend | Node.js, Express |
| Database | PostgreSQL 16 |
| Auth | bcrypt + JWT (httpOnly cookies) |
| Autosave | WebSockets |
| Export | Puppeteer, docx.js, epub-gen |
| Deploy | Docker Compose |

---

## License

[GPL-3.0](LICENSE)

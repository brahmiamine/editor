# Papertrail

Next.js 16 static-export notes app for GitHub Pages, with its own Node.js + MariaDB API (`server/`) for accounts, private notes and image storage.

## Run and verify

Use Node.js 24. Run `npm ci`, configure `.env.local` from `.env.example`, then `npm run dev`.
`npm run build` produces `out/`, the installable manifest, PNG icons and a versioned offline service worker.
Preview using `npm start`. The development server intentionally does not register a service worker.

Checks:

- `npm test`: Node regression tests for notes, conflicts, backup validation, safe Markdown and images.
- `cd server && npm test`: API integration tests against a real MariaDB test database (`TEST_DB_NAME`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, plus `TEST_DB_HOST` or `TEST_DB_SOCKET`).
- `npm run typecheck`: Next.js/client TypeScript.
- `npx playwright install chromium`, then `npm run test:e2e` after a build: isolated browser flows against the actual static export.
- `GITHUB_ACTIONS=true npm run build && GITHUB_ACTIONS=true npm run test:e2e`: GitHub Pages `/editor` paths, including offline reload.

Browser tests use disposable profiles, not the user's browser data. The sync test doubles only the API HTTP boundary; authentication UI, IndexedDB, guest transfer, conflict handling and the save queue remain real.

## Features and data flow

- A single borderless writing surface; titles derive from the first nonempty line. Creating a note focuses its text.
- Autosave to IndexedDB, separate guest/account notebooks, recoverable migration from the former localStorage cache. Closing during an unfinished local save is protected by a warning. A browser-wide Web Lock permits one writing tab per notebook; other tabs are read-only and can retry after the writer closes.
- Guest notes transfer to the signed-in account in one cancellable, atomic IndexedDB transaction. Cloud writes debounce for 700 ms. Reconnect and a 30-second refresh retry failed saves. Sign-out first flushes local edits; Retry can recover a failed local write too.
- Optimistic concurrency uses a server-generated revision and conditional writes. When another device changed a note, both versions remain as distinct notes; a conflict copy is marked. This is not collaborative editing.
- Trash restores complete notes for 30 days. Expired notes are removed on app loading/refresh and cloud deletion on the next successful synchronization, not by a background server scheduler.
- Up to 50 history checkpoints, at most one per 30 seconds of editing. Restoring a version also preserves the current content.
- Pin, archive, tags, sort by title/creation/modification, highlighted sidebar results, find-in-note and focus mode.
- Full portable JSON backups include notes, trash, metadata, history and embedded local images. Import .txt/.md files or JSON backups in a batch (50 MB maximum). Imports create new IDs and never overwrite existing notes.
- Themes and French/English/Arabic UI, including Auth, account dialogs, errors and RTL layout. Text size uses a numeric field.
- Markdown WYSIWYG tools: headings, bold, italic, underline, strikethrough, lists, tasks, tables, links, quotes, code, dividers and native undo/redo.
- JSON and code syntax coloring in preview; switch back to edit the original source. User-supplied HTML is escaped, link/image protocols are checked.
- Images via file, URL, clipboard or drop: PNG/JPEG/GIF/WebP, 1 MB maximum per file. Large dimensions are reduced to 1600 px for non-animated images. Captions and width are editable. Files use IndexedDB blobs and a private per-account table in MariaDB; Markdown stores stable attachment IDs, never expiring signed URLs. Legacy/backup inline images remain compatible.
- Cloud images are fetched with authenticated requests and cached for offline viewing. Automatic orphan-image deletion is intentionally disabled: a client-side stale snapshot cannot prove an image is unused across devices. Account deletion removes that account's image folder.
- Installable PWA caches only the static shell and same-origin build assets. It never caches API responses or authentication pages. First online installation is required before offline launch.
- Offline account access uses the last locally stored identity even when its server session has expired. This permits reading/editing only that device's account cache; no server authorization is bypassed. Explicit sign-out removes access to that identity, and reconnect asks the API for the current session again.
- Account settings change passwords and delete accounts with a typed confirmation. Deletion removes the account's sessions, notes, images and shares in one cascading database delete.
- Read-only sharing creates a seven-day snapshot, with a high-entropy token stored only as its SHA-256 hash. The owner can revoke links. The link token lives in the URL fragment, not a query string. Anyone with the link can read the snapshot; future edits do not modify it.

Shortcuts: Ctrl/Cmd+K searches notes, Ctrl/Cmd+F searches the open note, Ctrl/Cmd+Alt+N creates a note, Escape exits focus/search. Formatting uses the browser's native commands.

## API, database and security

The browser never talks to the database: it calls the API in `server/` (Node.js 24, no framework) which stores everything in MariaDB.

- Schema: `server/schema.sql`, applied automatically on API start (idempotent). Tables: `users`, `sessions`, `email_tokens`, `notes`, `note_images`, `note_shares`.
- Accounts: e-mail + password (bcrypt). Sessions are random opaque Bearer tokens (60 days) stored only as SHA-256 hashes; logout and password change revoke them. Login and sign-up are rate limited.
- Every query is scoped to the authenticated `user_id`. Notes use a server-side `revision` for optimistic concurrency: a stale write gets `409` and the client keeps both versions.
- Images: PNG/JPEG/GIF/WebP, 1 MB maximum, private per account.
- E-mail features (password reset, magic link) appear only when the API has `SMTP_HOST` configured. Links carry a single-use token (1 hour) in the URL fragment.
- CORS only allows the origins listed in `ALLOWED_ORIGINS`.
- Configuration: copy `server/.env.example` to `server/.env`. Deploy on the VPS with `cd server && docker compose up -d --build`; The container serves the static site at `https://papertrail.clubika.com` and the API under `/api` (behind Caddy); the site is built inside the Docker image.

## Deployment

The Pages workflow runs unit tests, static build, typecheck and Playwright before deployment. The build targets `https://papertrail.clubika.com/api` by default; set `NEXT_PUBLIC_API_URL` (`.env.local` or a repository variable) to use another API. Never commit `.env` files or database credentials.

Implementation lives in `app/components` (UI), `app/hooks` (Auth/autosave), `app/lib` (note transformations, IndexedDB, attachments, safe rendering), and `server` (API and MariaDB schema). No new editor, persistence or UI library was added; Playwright is a development-only browser-test dependency.

# Papertrail

Next.js 16 static-export notes app for GitHub Pages, with Supabase Auth, private notes and image storage.

## Run and verify

Use Node.js 24. Run `npm ci`, configure `.env.local` from `.env.example`, then `npm run dev`.
`npm run build` produces `out/`, the installable manifest, PNG icons and a versioned offline service worker.
Preview using `npm start`. The development server intentionally does not register a service worker.

Checks:

- `npm test`: Node regression tests for notes, conflicts, backup validation, safe Markdown, images and Edge Function authorization.
- `npm run typecheck`: Next.js/client TypeScript.
- `deno check supabase/functions/papertrail-account/index.ts supabase/functions/papertrail-share/index.ts`: the separate Edge runtime.
- `npx playwright install chromium`, then `npm run test:e2e` after a build: isolated browser flows against the actual static export.
- `GITHUB_ACTIONS=true npm run build && GITHUB_ACTIONS=true npm run test:e2e`: GitHub Pages `/editor` paths, including offline reload.

Browser tests use disposable profiles, not the user's browser data. The sync test doubles only the Supabase HTTP boundary; authentication UI, IndexedDB, guest transfer, conflict handling and the save queue remain real.

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
- Images via file, URL, clipboard or drop: PNG/JPEG/GIF/WebP, 1 MB maximum per file. Large dimensions are reduced to 1600 px for non-animated images. Captions and width are editable. Files use IndexedDB blobs and private Supabase Storage; Markdown stores stable attachment IDs, never expiring signed URLs. Legacy/backup inline images remain compatible.
- Cloud images are fetched with authenticated requests and cached for offline viewing. Automatic orphan-image deletion is intentionally disabled: a client-side stale snapshot cannot prove an image is unused across devices. Account deletion removes that account's image folder.
- Installable PWA caches only the static shell and same-origin build assets. It never caches Supabase API responses or authentication pages. First online installation is required before offline launch.
- Offline account access uses the last locally stored Auth identity even when its JWT expires. This permits reading/editing only that device's account cache; no server authorization is bypassed. Explicit sign-out removes access to that identity, and reconnect asks Supabase for the current session again.
- Account settings change passwords and delete accounts with a typed confirmation. On a dedicated Papertrail project, deletion revokes sessions, removes that account's cloud images and deletes its Auth user (notes/shares cascade). A service-role-only preflight blocks global Auth deletion whenever the project has foreign-app user dependencies, including the currently shared project. A racing row-count check would not safely protect other apps.
- Read-only sharing creates a seven-day snapshot, with a high-entropy token stored only as its SHA-256 hash. The owner can revoke links. The link token lives in the URL fragment, not a query string. Anyone with the link can read the snapshot; future edits do not modify it.

Shortcuts: Ctrl/Cmd+K searches notes, Ctrl/Cmd+F searches the open note, Ctrl/Cmd+Alt+N creates a note, Escape exits focus/search. Formatting uses the browser's native commands.

## Supabase setup and security

For a new project, apply `supabase/schema.sql` then `supabase/features.sql`. These feature changes were applied to the configured project through the Supabase plugin. The feature SQL is a setup record, not a repeatable migration runner.

Deploy `supabase/functions/papertrail-account/index.ts` with JWT verification enabled, and `papertrail-share/index.ts` with gateway JWT verification disabled: the latter deliberately authorizes public read-only access with its unguessable token and expiry. Neither accepts a caller-supplied deletion target.

Notes and share-management tables use ownership RLS; anonymous table privileges are revoked. The image bucket is private and restricted to `userId/assetId`. A narrowly privileged helper in the non-exposed `papertrail_private` schema checks that the caller's signed session still exists, preventing continued note/share-management/image access after sign-out/account deletion. Service-role credentials exist only inside Supabase Edge Functions, never the browser build.

See `supabase/AUTH.md` for email delivery/redirect configuration. Email receipt and a real destructive account deletion are not exercised by automated tests. No AI or live collaborative editing is included.

## Deployment

The Pages workflow runs unit tests, static build, typecheck and Playwright before deployment. Configure repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never commit `.env.local` or service-role credentials.

Implementation lives in `app/components` (UI), `app/hooks` (Auth/autosave), `app/lib` (note transformations, IndexedDB, attachments, safe rendering), and `supabase/functions` (privileged account deletion and token-based share reading). No new editor, persistence or UI library was added; Playwright is a development-only browser-test dependency.

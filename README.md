# Papertrail

Next.js notes app exported to GitHub Pages, with Supabase email authentication and account-scoped notes.

## Run

Use Node.js 24. Run `npm ci`, copy `.env.example` to `.env.local` and set the Supabase URL and public key. Run `npm run dev`. Run `npm run build` and `npm start` to preview the static export.

## Checks

`npm test` runs six regression tests using the built-in Node test runner. `npm run build` checks TypeScript and produces `out/`. `npm run typecheck` can be run after the build.

## Structure

- `app/components/`: sidebar, editor, authentication form.
- `app/hooks/`: typed auth session and persistent notebook state.
- `app/lib/`: note operations, storage validation, exports, language copy.
- `supabase/schema.sql`: notes table, ownership policies and grants.
- `tests/`: regression checks.

Guest notes and each account have separate local storage. Signed-in notes load from Supabase and save after 500ms of inactivity. Local pending changes and deletions survive reloads. Failed cloud saves display an error and can be retried.

Simultaneous edits of the same note on different devices use the last successful write. This is not collaborative editing; reload to receive changes from another device.

See `supabase/AUTH.md` for email delivery and redirect URLs. The Pages workflow runs tests and build, using repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never publish a service-role key or `.env.local`.

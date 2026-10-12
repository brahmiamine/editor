create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled note',
  body text not null default '',
  color text not null default '#e9b949',
  updated_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create index if not exists notes_user_id_idx on public.notes(user_id);
drop policy if exists "Users manage their notes" on public.notes;
create policy "Users manage their notes" on public.notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.notes to authenticated;

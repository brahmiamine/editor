alter table public.notes add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notes add column if not exists revision bigint not null default 1;
create or replace function public.note_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end $$;
drop trigger if exists note_revision on public.notes;
create trigger note_revision before update on public.notes for each row execute function public.note_revision();
revoke all on function public.note_revision() from public;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('note-images','note-images',false,1048576,array['image/png','image/jpeg','image/gif','image/webp']) on conflict (id) do nothing;
create policy "Papertrail private images" on storage.objects for all to authenticated using (bucket_id='note-images' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='note-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create table public.note_shares (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, token_hash text not null unique, body text not null, expires_at timestamptz not null, created_at timestamptz not null default now());
alter table public.note_shares enable row level security;
create index note_shares_user_id_idx on public.note_shares(user_id);
create policy "Owners manage shares" on public.note_shares for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and expires_at <= now() + interval '30 days');
grant select,insert,update,delete on public.note_shares to authenticated;
revoke all on public.notes, public.note_shares from anon;
create schema if not exists papertrail_private;
revoke all on schema papertrail_private from public;
grant usage on schema papertrail_private to authenticated;
-- This privileged lookup exposes only whether the caller's own signed session still exists.
create or replace function papertrail_private.active_session() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id')
$$;
revoke all on function papertrail_private.active_session() from public, anon;
grant execute on function papertrail_private.active_session() to authenticated;
alter policy "Papertrail private images" on storage.objects using (bucket_id='note-images' and (storage.foldername(name))[1]=(select auth.uid())::text and (select papertrail_private.active_session())) with check (bucket_id='note-images' and (storage.foldername(name))[1]=(select auth.uid())::text and (select papertrail_private.active_session()));
alter policy "Users manage their notes" on public.notes using ((select auth.uid())=user_id and (select papertrail_private.active_session())) with check ((select auth.uid())=user_id and (select papertrail_private.active_session()));
alter policy "Owners manage shares" on public.note_shares using ((select auth.uid())=user_id and (select papertrail_private.active_session())) with check ((select auth.uid())=user_id and expires_at <= now() + interval '30 days' and (select papertrail_private.active_session()));
-- A shared Auth project cannot safely treat global identity deletion as a Papertrail-only action.
-- Refuse based on foreign-app dependencies, not a racing snapshot of that user's rows.
create or replace function public.papertrail_can_delete_account(p_user_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
select p_user_id is not null and not exists(
  select 1 from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  where c.contype='f' and c.confrelid='auth.users'::regclass
    and ns.nspname not in ('auth','storage')
    and not (ns.nspname='public' and t.relname in ('notes','note_shares'))
)
$$;
revoke all on function public.papertrail_can_delete_account(uuid) from public,anon,authenticated;
grant execute on function public.papertrail_can_delete_account(uuid) to service_role;

-- Progress photos: the most sensitive data in the study, so the bucket is
-- private and every path is namespaced by the owner's user id. Nothing here is
-- ever served from a public URL; the app mints short-lived signed URLs instead.
--
-- Applied to the live project on 2026-08-27.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('body-photos', 'body-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment is the owner's uuid, so an object is reachable only by
-- the account that owns that folder — the path layout is the access control,
-- which is why uploadPhoto() builds it and never lets a caller supply one.
drop policy if exists "own body photos read" on storage.objects;
create policy "own body photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own body photos insert" on storage.objects;
create policy "own body photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own body photos delete" on storage.objects;
create policy "own body photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- One row per photo. The image lives in storage; this is the index that makes
-- "front view, week 1 against week 16" a query rather than a scroll.
create table if not exists public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  taken_on date not null,
  pose text not null,
  storage_path text not null unique,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists body_photos_user_date_idx
  on public.body_photos (user_id, taken_on desc);

alter table public.body_photos enable row level security;

drop policy if exists "own body photos" on public.body_photos;
create policy "own body photos" on public.body_photos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

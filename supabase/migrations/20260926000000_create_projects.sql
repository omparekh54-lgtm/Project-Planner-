create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;
revoke all on public.projects from anon;
grant select, insert, update, delete on public.projects to authenticated;

create policy "Owners can read projects" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners can create projects" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners can edit projects" on public.projects
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Owners can delete projects" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Run this once in the Supabase SQL editor.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'umpire')) default 'umpire',
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  status text not null check (status in ('live', 'complete', 'stopped')) default 'live',
  created_at timestamptz not null default now()
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team smallint not null check (team in (0, 1)),
  primary key (match_id, user_id)
);

create table if not exists public.over_scores (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  innings smallint not null check (innings in (0, 1)),
  over_number integer not null check (over_number >= 0),
  score jsonb not null,
  locked_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  unique (match_id, innings, over_number)
);

create table if not exists public.score_audit (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  over_id uuid references public.over_scores(id) on delete set null,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('create', 'edit', 'lock')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.over_scores enable row level security;
alter table public.score_audit enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') $$;

create or replace function public.is_match_player(target_match uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.match_players where match_id = target_match and user_id = auth.uid()) $$;

drop policy if exists user_roles_read_self on public.user_roles;
create policy user_roles_read_self on public.user_roles for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists matches_player_read on public.matches;
create policy matches_player_read on public.matches for select using (created_by = auth.uid() or public.is_match_player(id) or public.is_admin());
drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches for all using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());

drop policy if exists match_players_read on public.match_players;
create policy match_players_read on public.match_players for select using (user_id = auth.uid() or public.is_match_player(match_id) or public.is_admin());
drop policy if exists match_players_admin_write on public.match_players;
create policy match_players_admin_write on public.match_players for all using (public.is_admin());

drop policy if exists over_scores_read on public.over_scores;
create policy over_scores_read on public.over_scores for select using (public.is_match_player(match_id) or public.is_admin());
drop policy if exists over_scores_create on public.over_scores;
create policy over_scores_create on public.over_scores for insert with check ((public.is_match_player(match_id) or public.is_admin()) and updated_by = auth.uid());
drop policy if exists over_scores_admin_edit on public.over_scores;
create policy over_scores_admin_edit on public.over_scores for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists score_audit_read on public.score_audit;
create policy score_audit_read on public.score_audit for select using (public.is_match_player(match_id) or public.is_admin());
drop policy if exists score_audit_create on public.score_audit;
create policy score_audit_create on public.score_audit for insert with check (actor_id = auth.uid());

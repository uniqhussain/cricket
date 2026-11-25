create table if not exists public.cricket_series (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  team_a text not null check (char_length(btrim(team_a)) between 1 and 80),
  team_b text not null check (char_length(btrim(team_b)) between 1 and 80),
  created_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (lower(btrim(team_a)) <> lower(btrim(team_b)))
);

alter table public.cricket_series enable row level security;
revoke all on public.cricket_series from public, anon, authenticated;
grant select on public.cricket_series to service_role;
alter table public.matches add column if not exists series_id uuid references public.cricket_series(id);
alter table public.matches add column if not exists winner_side smallint check (winner_side in (0, 1));
create index if not exists matches_series_key on public.matches(series_id) where archived_at is null;

create or replace function public.cricket_series_directory(actor uuid)
returns table(id uuid, name text, team_a text, team_b text, started_at timestamptz, ended_at timestamptz,
  wins_a integer, wins_b integer, ties integer, live_matches integer, stopped_matches integer)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.team_a, s.team_b, s.started_at, s.ended_at,
    count(*) filter (where m.status = 'complete' and m.winner_side = 0)::integer,
    count(*) filter (where m.status = 'complete' and m.winner_side = 1)::integer,
    count(*) filter (where m.status = 'complete' and m.winner_side is null)::integer,
    count(*) filter (where m.status = 'live')::integer,
    count(*) filter (where m.status = 'stopped')::integer
  from public.cricket_series s
  left join public.matches m on m.series_id = s.id and m.archived_at is null
  where public.cricket_identity(actor) is not null and (
    public.cricket_admin(actor) or exists (
      select 1 from public.matches member_match join public.match_players p on p.match_id = member_match.id
      where member_match.series_id = s.id and member_match.archived_at is null and p.user_id = actor
    )
  )
  group by s.id
  order by s.started_at desc;
$$;

create or replace function public.cricket_start_series(actor uuid, series_name text, first_team text, second_team text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.cricket_admin(actor) then raise insufficient_privilege; end if;
  insert into public.cricket_series(name, team_a, team_b, created_by)
  values (btrim(series_name), btrim(first_team), btrim(second_team), actor)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.cricket_end_series(actor uuid, series_key uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.cricket_admin(actor) then raise insufficient_privilege; end if;
  perform 1 from public.cricket_series where id = series_key and ended_at is null for update;
  if not found then raise sqlstate '22023' using message = 'This series is already closed or unavailable.'; end if;
  if exists (select 1 from public.matches where series_id = series_key and archived_at is null and status = 'live') then
    raise sqlstate '22023' using message = 'Finish or stop the live matches before ending the series.';
  end if;
  update public.cricket_series set ended_at = statement_timestamp() where id = series_key;
end;
$$;

create or replace function public.cricket_create_series_match(actor uuid, series_key uuid, title text, state jsonb, roster jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.cricket_admin(actor) then raise insufficient_privilege; end if;
  perform 1 from public.cricket_series where id = series_key and ended_at is null
    and state->'teamNames' = jsonb_build_array(team_a, team_b) for share;
  if not found then raise sqlstate '22023' using message = 'Choose an active series and use its team names.'; end if;
  new_id := public.cricket_create_match(actor, title, state, roster);
  update public.matches set series_id = series_key where id = new_id;
  return new_id;
end;
$$;

create or replace function cricket_private.guard_series_score()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.series_id is not null then
    perform 1 from public.cricket_series where id = old.series_id and ended_at is null for share;
    if not found then raise sqlstate '22023' using message = 'This series has ended. Its results are final.'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cricket_guard_series_score on public.matches;
create trigger cricket_guard_series_score before update of cricket_state, revision, winner_side on public.matches
for each row execute function cricket_private.guard_series_score();

create or replace function public.cricket_save_match_result(
  actor uuid, match_key uuid, expected_revision integer, state jsonb, match_status text,
  event jsonb, frozen jsonb, admin_only boolean, winner integer
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare new_revision integer;
begin
  new_revision := public.cricket_save_match(actor, match_key, expected_revision, state, match_status, event, frozen, admin_only);
  update public.matches set winner_side = case when match_status = 'complete' then winner else null end
    where id = match_key and series_id is not null;
  return new_revision;
end;
$$;

revoke execute on function public.cricket_series_directory(uuid), public.cricket_start_series(uuid,text,text,text),
  public.cricket_end_series(uuid,uuid), public.cricket_create_series_match(uuid,uuid,text,jsonb,jsonb),
  public.cricket_save_match_result(uuid,uuid,integer,jsonb,text,jsonb,jsonb,boolean,integer) from public, anon, authenticated;
grant execute on function public.cricket_series_directory(uuid), public.cricket_start_series(uuid,text,text,text),
  public.cricket_end_series(uuid,uuid), public.cricket_create_series_match(uuid,uuid,text,jsonb,jsonb),
  public.cricket_save_match_result(uuid,uuid,integer,jsonb,text,jsonb,jsonb,boolean,integer) to service_role;
notify pgrst, 'reload schema';

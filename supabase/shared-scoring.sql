alter table public.matches add column if not exists cricket_state jsonb;
alter table public.matches add column if not exists revision integer not null default 0;
alter table public.matches add column if not exists updated_at timestamptz not null default now();
alter table public.matches add column if not exists updated_by uuid references auth.users(id);
alter table public.match_players add column if not exists player_name text;

-- The server performs delivery validation before calling the write RPCs.
revoke insert, update, delete on public.matches, public.match_players, public.over_scores,
  public.score_audit, public.user_roles from public, anon, authenticated;

create schema if not exists cricket_private;
create table if not exists cricket_private.owner (
  singleton boolean primary key default true check (singleton),
  phone text not null
);

create table if not exists public.cricket_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  nickname text not null default '' check (char_length(nickname) <= 40),
  updated_at timestamptz not null default now()
);
alter table public.cricket_profiles enable row level security;
revoke all on public.cricket_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.cricket_profiles to service_role;

create or replace function public.cricket_admin(actor uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = actor and role = 'admin')
  or exists (
    select 1 from auth.users u join cricket_private.owner o
      on ltrim(u.phone, '+') = o.phone
    where u.id = actor and u.phone_confirmed_at is not null
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.cricket_admin(auth.uid()); $$;

create or replace function public.cricket_identity(actor uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('admin', public.cricket_admin(u.id)) from auth.users u
  where u.id = actor and (u.banned_until is null or u.banned_until <= now())
    and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null);
$$;

create or replace function public.cricket_accounts(actor uuid)
returns table(id uuid, label text, admin boolean, owner boolean, player_login boolean, disabled boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.cricket_admin(actor) then raise insufficient_privilege; end if;
  return query select u.id, coalesce(
      nullif(regexp_replace(u.email, '@players\.cricket\.invalid$', ''), ''),
      nullif(u.phone, ''), u.id::text),
    public.cricket_admin(u.id),
    exists (select 1 from cricket_private.owner o where o.phone = ltrim(u.phone, '+')
      and u.phone_confirmed_at is not null),
    coalesce(u.raw_app_meta_data->>'cricket_player' = 'true', false),
    coalesce(u.banned_until > now(), false)
    from auth.users u where u.email_confirmed_at is not null or u.phone_confirmed_at is not null
    order by 2;
end;
$$;

create or replace function public.cricket_set_admin(actor uuid, target uuid, enabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(274908130);
  if not public.cricket_admin(actor) or actor = target then raise insufficient_privilege; end if;
  if not exists (select 1 from public.cricket_accounts(actor) a where a.id = target and not a.owner)
    then raise sqlstate '22023' using message = 'Choose a verified account other than the project owner.'; end if;
  if enabled then
    insert into public.user_roles(user_id, role) values (target, 'admin')
    on conflict (user_id) do update set role = 'admin', updated_at = now();
  else
    delete from public.user_roles where user_id = target and role = 'admin';
  end if;
end;
$$;

create or replace function public.cricket_create_match(actor uuid, title text, state jsonb, roster jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.cricket_admin(actor) then raise insufficient_privilege; end if;
  if exists (
    select 1 from jsonb_to_recordset(roster) p(user_id uuid)
    where not exists (select 1 from public.cricket_accounts(actor) a where a.id = p.user_id and not a.disabled)
  ) then raise sqlstate '22023' using message = 'Link every player to a verified account.'; end if;
  insert into public.matches(name, created_by, cricket_state, updated_by)
    values (title, actor, state, actor) returning id into new_id;
  insert into public.match_players(match_id, user_id, team, player_name)
    select new_id, p.user_id, p.team, p.player_name
    from jsonb_to_recordset(roster) p(user_id uuid, team smallint, player_name text);
  return new_id;
end;
$$;

create or replace function public.cricket_save_match(
  actor uuid, match_key uuid, expected_revision integer, state jsonb, match_status text,
  event jsonb, frozen jsonb, admin_only boolean
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare current_revision integer;
declare is_admin boolean;
declare snapshot record;
declare over_key uuid;
begin
  select revision into current_revision from public.matches
    where id = match_key and cricket_state is not null for update;
  if not found then raise sqlstate 'P0002' using message = 'Match not found.'; end if;
  is_admin := public.cricket_admin(actor);
  if public.cricket_identity(actor) is null or (not is_admin and (admin_only or not exists (
    select 1 from public.match_players where match_id = match_key and user_id = actor
  ))) then raise insufficient_privilege; end if;
  if current_revision <> expected_revision then
    raise sqlstate '40001' using message = 'The score changed. Reload it before retrying.';
  end if;
  update public.matches set cricket_state = state, status = match_status, updated_by = actor,
    updated_at = now(), revision = revision + 1 where id = match_key;

  for snapshot in select * from jsonb_to_recordset(frozen)
    as s(innings smallint, over_number integer, score jsonb)
  loop
    over_key := null;
    insert into public.over_scores as previous(match_id, innings, over_number, score, updated_by)
      values (match_key, snapshot.innings, snapshot.over_number, snapshot.score, actor)
      on conflict (match_id, innings, over_number) do update
        set score = excluded.score, updated_by = actor where previous.score is distinct from excluded.score
        returning id into over_key;
    if over_key is not null and event->>'operation' <> 'correct' then
      insert into public.score_audit(match_id, over_id, actor_id, action, details)
        values (match_key, over_key, actor, 'lock',
          jsonb_build_object('innings', snapshot.innings, 'over', snapshot.over_number, 'actorName', event->>'actorName'));
    end if;
  end loop;
  insert into public.score_audit(match_id, actor_id, action, details)
    values (match_key, actor, case when event->>'operation' = 'ball' then 'create' else 'edit' end, event);
  return current_revision + 1;
end;
$$;

revoke execute on function public.cricket_admin(uuid), public.cricket_identity(uuid), public.cricket_accounts(uuid),
  public.cricket_set_admin(uuid,uuid,boolean), public.cricket_create_match(uuid,text,jsonb,jsonb),
  public.cricket_save_match(uuid,uuid,integer,jsonb,text,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.cricket_admin(uuid), public.cricket_identity(uuid), public.cricket_accounts(uuid),
  public.cricket_set_admin(uuid,uuid,boolean), public.cricket_create_match(uuid,text,jsonb,jsonb),
  public.cricket_save_match(uuid,uuid,integer,jsonb,text,jsonb,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('admin', 'umpire', 'player'));
alter table public.user_roles alter column role set default 'player';

create or replace function public.cricket_identity(actor uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'admin', public.cricket_admin(u.id),
    'role', case when public.cricket_admin(u.id) then 'admin' else coalesce(r.role, 'player') end
  )
  from auth.users u left join public.user_roles r on r.user_id = u.id
  where u.id = actor and (u.banned_until is null or u.banned_until <= now())
    and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null);
$$;

create or replace function public.cricket_accounts_with_roles(actor uuid)
returns table(id uuid, label text, admin boolean, owner boolean, player_login boolean, disabled boolean, role text)
language sql stable security definer set search_path = ''
as $$
  select a.*, case when a.admin or a.owner then 'admin' else coalesce(r.role, 'player') end
  from public.cricket_accounts(actor) a left join public.user_roles r on r.user_id = a.id
  order by a.label;
$$;

create or replace function public.cricket_set_role(actor uuid, target uuid, new_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(274908130);
  if not public.cricket_admin(actor) or actor = target then raise insufficient_privilege; end if;
  if new_role is null or new_role not in ('admin', 'umpire', 'player') then
    raise sqlstate '22023' using message = 'Choose a valid account role.';
  end if;
  if not exists (select 1 from public.cricket_accounts(actor) a where a.id = target and not a.owner and not a.disabled) then
    raise sqlstate '22023' using message = 'Choose an active account other than the project owner.';
  end if;
  insert into public.user_roles(user_id, role) values (target, new_role)
  on conflict (user_id) do update set role = excluded.role, updated_at = now();
end;
$$;

create or replace function cricket_private.check_score_role()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare actor_role text;
begin
  actor_role := public.cricket_identity(new.updated_by)->>'role';
  if actor_role is distinct from 'admin' and (
    actor_role is distinct from 'umpire' or not exists (
      select 1 from public.match_players p where p.match_id = old.id and p.user_id = new.updated_by
    )
  ) then raise insufficient_privilege; end if;
  return new;
end;
$$;

drop trigger if exists cricket_check_score_role on public.matches;
create trigger cricket_check_score_role before update of cricket_state, revision on public.matches
for each row execute function cricket_private.check_score_role();

revoke execute on function public.cricket_accounts_with_roles(uuid), public.cricket_set_role(uuid,uuid,text),
  cricket_private.check_score_role() from public, anon, authenticated;
grant execute on function public.cricket_accounts_with_roles(uuid), public.cricket_set_role(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';

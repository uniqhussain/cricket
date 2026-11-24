create table if not exists public.cricket_grounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists cricket_grounds_name_key on public.cricket_grounds (lower(btrim(name)));
alter table public.cricket_grounds enable row level security;
revoke all on public.cricket_grounds from public, anon, authenticated;
grant select on public.cricket_grounds to service_role;

create or replace function public.cricket_add_ground(actor uuid, ground_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ground public.cricket_grounds%rowtype;
begin
  if not public.cricket_admin(actor) then raise insufficient_privilege; end if;
  if ground_name is null or char_length(btrim(ground_name)) not between 1 and 120 then
    raise sqlstate '22023' using message = 'Enter a ground name of up to 120 characters.';
  end if;
  insert into public.cricket_grounds(name, created_by) values (btrim(ground_name), actor)
  returning * into ground;
  return jsonb_build_object('id', ground.id, 'name', ground.name);
exception when unique_violation then
  raise sqlstate '22023' using message = 'This ground is already saved.';
end;
$$;

revoke execute on function public.cricket_add_ground(uuid,text) from public, anon, authenticated;
grant execute on function public.cricket_add_ground(uuid,text) to service_role;
notify pgrst, 'reload schema';

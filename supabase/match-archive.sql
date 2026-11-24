alter table public.matches add column if not exists archived_at timestamptz;

create or replace function cricket_private.prevent_archived_match_scoring()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.archived_at is not null then
    raise sqlstate 'P0002' using message = 'Match not found.';
  end if;
  return new;
end;
$$;

drop trigger if exists cricket_prevent_archived_scoring on public.matches;
create trigger cricket_prevent_archived_scoring
before update of cricket_state, revision on public.matches
for each row execute function cricket_private.prevent_archived_match_scoring();

notify pgrst, 'reload schema';

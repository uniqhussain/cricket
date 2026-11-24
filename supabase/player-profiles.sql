alter table public.cricket_profiles
  add column if not exists details jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';

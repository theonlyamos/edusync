-- Function to sync last_sign_in_at from auth.users to public.users
create or replace function public.handle_auth_user_login()
returns trigger as $$
begin
  update public.users
  set "lastLogin" = new.last_sign_in_at
  where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function when auth.users is updated
create or replace trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_auth_user_login();

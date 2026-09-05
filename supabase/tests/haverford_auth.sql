-- Run inside a transaction and ROLLBACK after testing. Never sends mail.
do $$
declare
  address text;
  provider text;
  student_id uuid := gen_random_uuid();
begin
  foreach address in array array['', '@haverford.edu', 'a@gmail.com', 'a@brynmawr.edu',
      'a@haverford.edu.evil.com', 'a@haverford.edu@evil.com', 'a b@haverford.edu'] loop
    if public.is_college_domain(address) then raise exception 'Accepted invalid domain: %', address; end if;
    foreach provider in array array['email', 'google'] loop
      begin
        insert into auth.users (id, email, raw_app_meta_data)
        values (gen_random_uuid(), address, jsonb_build_object('provider', provider));
        raise exception 'Signup gate allowed invalid domain';
      exception when sqlstate '28000' then null;
      end;
    end loop;
  end loop;
  if public.is_college_domain(null) then raise exception 'Accepted null email'; end if;

  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (student_id, 'auth-test-' || student_id || '@haverford.edu', '{"provider":"email"}',
    '{"full_name":"Auth test","email_verified":true,"college_verified":true,"role":"admin"}');
  if not exists (select 1 from public.profiles where id = student_id and not college_verified and role = 'user') then
    raise exception 'Unconfirmed signup or metadata spoof granted verification';
  end if;
  update auth.users set email_confirmed_at = now() where id = student_id;
  if not exists (select 1 from public.profiles where id = student_id and college_verified) then
    raise exception 'Confirmation did not verify profile';
  end if;
  begin
    update auth.users set email = 'changed@gmail.com' where id = student_id;
    raise exception 'Email change escaped domain restriction';
  exception when sqlstate '28000' then null;
  end;
  update auth.users set email_confirmed_at = null where id = student_id;
  if exists (select 1 from public.profiles where id = student_id and college_verified) then
    raise exception 'Removing confirmation did not revoke verification';
  end if;

  student_id := gen_random_uuid();
  insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at)
  values (student_id, 'auth-test-' || student_id || '@haverford.edu', '{"provider":"google"}', now());
  if not exists (select 1 from public.profiles where id = student_id and college_verified) then
    raise exception 'Verified Google signup did not verify profile';
  end if;
  if has_function_privilege('authenticated', 'public.enforce_haverford_domain()', 'execute')
    or has_function_privilege('anon', 'public.handle_user_signup()', 'execute') then
    raise exception 'Trigger functions exposed to API clients';
  end if;
end;
$$;

begin;
create function public.push_registered(p_endpoint text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint and enabled)
$$;
revoke all on function public.push_registered(text) from public,anon;
grant execute on function public.push_registered(text) to authenticated;
commit;

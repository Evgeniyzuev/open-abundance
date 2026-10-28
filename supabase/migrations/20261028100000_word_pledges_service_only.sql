-- API routes call Supabase with the service role after checking the person's token (lib/serverSupabase.ts), so
-- auth.uid() is null there. create_word_pledge now takes the person's id and, like settle_word_pledges, is callable
-- only by the service role; the route always passes the signed-in person's own id.

drop function if exists public.create_word_pledge(uuid, text, numeric, timestamptz);

create or replace function public.create_word_pledge(
  p_user_id uuid,
  p_user_challenge_id uuid,
  p_goal text,
  p_amount numeric,
  p_deadline_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(30, 12);
  v_id uuid;
begin
  if p_user_id is null then return jsonb_build_object('error', 'sign_in'); end if;
  perform public.settle_word_pledges(p_user_id);
  if p_amount is null or p_amount < 1 or p_amount > 20 then return jsonb_build_object('error', 'amount'); end if;
  if p_deadline_at < now() + interval '12 hours' or p_deadline_at > now() + interval '15 days' then
    return jsonb_build_object('error', 'deadline');
  end if;
  if not exists (select 1 from public.user_challenges where id = p_user_challenge_id and user_id = p_user_id and status = 'accepted') then
    return jsonb_build_object('error', 'quest');
  end if;
  if exists (select 1 from public.word_pledges where user_challenge_id = p_user_challenge_id) then
    return jsonb_build_object('error', 'quest_used');
  end if;
  if exists (select 1 from public.word_pledges where user_id = p_user_id and status = 'active') then
    return jsonb_build_object('error', 'active');
  end if;

  select balance into v_balance from public.wallet_accounts where user_id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then return jsonb_build_object('error', 'balance'); end if;

  insert into public.word_pledges (user_id, user_challenge_id, goal, amount, bonus_percent, deadline_at)
    values (p_user_id, p_user_challenge_id, left(btrim(p_goal), 300), round(p_amount, 2), 10, p_deadline_at)
    returning id into v_id;
  update public.wallet_accounts set balance = balance - round(p_amount, 2), updated_at = now() where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
    values (p_user_id, 'debit', round(p_amount, 2), '$', 'word_pledge_hold', 'word_pledge', v_id, v_balance,
      'word_pledge:' || v_id::text || ':hold', jsonb_build_object('pledge_id', v_id, 'user_challenge_id', p_user_challenge_id));
  return jsonb_build_object('pledge_id', v_id);
end;
$$;

revoke all on function public.create_word_pledge(uuid, uuid, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.create_word_pledge(uuid, uuid, text, numeric, timestamptz) to service_role;
revoke execute on function public.settle_word_pledges(uuid) from authenticated;

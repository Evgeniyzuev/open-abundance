-- Remove the temporary single-reward compatibility layer after the numeric
-- Core/Wallet API has been deployed everywhere.

do $cleanup$
declare
  definition text;
begin
  -- Economy metrics must read the immutable Core snapshot directly before the
  -- old user_challenges mirror is removed.
  select pg_get_functiondef('public.rebuild_user_economy_metrics(uuid,date,date)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'rebuild_user_economy_metrics definition is missing';
  end if;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition,
    $legacy$    from public.user_challenges c
    where c.user_id = p_user_id
      and c.status = 'completed'
      and c.reward_account = 'core'
      and c.reward_amount is not null$legacy$,
    $numeric$    from public.user_challenges c
    where c.user_id = p_user_id
      and c.status = 'completed'
      and c.core_reward_amount > 0$numeric$);
  definition := replace(definition,
    $legacy$      case when c.reward_account = 'core' then c.reward_amount else 0 end,$legacy$,
    $numeric$      c.core_reward_amount,$numeric$);
  -- The same snapshot is also used by the core-growth projection later in
  -- this function; normalize any remaining qualified legacy amount reference.
  definition := replace(definition, 'c.reward_amount', 'c.core_reward_amount');
  definition := replace(definition, 'c.reward_account = ''core''', 'c.core_reward_amount > 0');
  if position('c.reward_account' in definition) > 0 or position('c.reward_amount' in definition) > 0 then
    raise exception 'Legacy user_challenges reward fields remain in rebuild_user_economy_metrics';
  end if;
  execute definition;

  select pg_get_functiondef('public.reconcile_user_economy_metrics(uuid)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'reconcile_user_economy_metrics definition is missing';
  end if;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition, 'select c.reward_amount from public.user_challenges c', 'select c.core_reward_amount from public.user_challenges c');
  definition := replace(definition, 'and c.reward_account = ''core'' and c.reward_amount is not null', 'and c.core_reward_amount > 0');
  definition := replace(definition, 'c.reward_account = ''core''', 'c.core_reward_amount > 0');
  definition := replace(definition, 'c.reward_amount', 'c.core_reward_amount');
  if position('c.reward_account' in definition) > 0 or position('c.reward_amount' in definition) > 0 then
    raise exception 'Legacy user_challenges reward fields remain in reconcile_user_economy_metrics';
  end if;
  execute definition;

  -- The settlement RPC keeps the numeric return contract but no longer writes
  -- the old account/amount mirrors.
  select pg_get_functiondef('public.settle_user_challenge_rewards(uuid,uuid)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'settle_user_challenge_rewards definition is missing';
  end if;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition,
    $legacy$      -- Transitional mirrors for the deployed metrics functions.
      reward_account = case
        when challenge_row.core_reward_amount > 0 then 'core'
        when challenge_row.wallet_reward_amount > 0 then 'wallet'
        else 'core'
      end,
      reward_amount = case
        when challenge_row.core_reward_amount > 0 then challenge_row.core_reward_amount
        else challenge_row.wallet_reward_amount
      end,
$legacy$,
    '');
  if position('reward_account =' in definition) > 0 or position('reward_amount =' in definition) > 0 then
    raise exception 'Legacy reward mirrors remain in settle_user_challenge_rewards';
  end if;
  execute definition;

  -- Peer-review RPCs retain a computed reward_amount in their return type for
  -- the endpoint contract, but derive it from the two numeric columns.
  select pg_get_functiondef('public.settle_peer_review_answer(uuid,text,text)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'settle_peer_review_answer definition is missing';
  end if;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition, 'answer_row.reward_amount', 'coalesce(answer_row.core_reward_amount, 0) + coalesce(answer_row.wallet_reward_amount, 0)');
  definition := replace(definition, E'      reward_amount = reward,\n', '');
  if position('answer_row.reward_amount' in definition) > 0 or position('reward_amount = reward' in definition) > 0 then
    raise exception 'Legacy peer-review reward field remains in settle_peer_review_answer';
  end if;
  execute definition;

  select pg_get_functiondef('public.audit_peer_review_answer(uuid,text,text)'::regprocedure)
    into definition;
  if definition is null then
    raise exception 'audit_peer_review_answer definition is missing';
  end if;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition, 'answer_row.reward_amount', 'coalesce(answer_row.core_reward_amount, 0) + coalesce(answer_row.wallet_reward_amount, 0)');
  definition := replace(definition, E'        reward_amount = 0,\n', '');
  if position('answer_row.reward_amount' in definition) > 0 or position('reward_amount = 0' in definition) > 0 then
    raise exception 'Legacy peer-review reward field remains in audit_peer_review_answer';
  end if;
  execute definition;
end;
$cleanup$;

drop function if exists public.complete_user_challenge(uuid, uuid, text, numeric);

alter table public.challenges
  drop column if exists reward_label,
  drop column if exists reward_amount,
  drop column if exists reward_account,
  drop column if exists review_reward_amount;

alter table public.user_challenges
  drop column if exists reward_account,
  drop column if exists reward_amount;

alter table public.peer_review_answers
  drop column if exists reward_amount;

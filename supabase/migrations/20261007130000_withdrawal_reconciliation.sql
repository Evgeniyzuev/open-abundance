-- Automatic reconciliation of crypto withdrawals.
-- A background job compares withdrawals that were sent (or whose send is unclear)
-- with the blockchain and settles them: confirmed when the transfer is found,
-- refunded once when the signed message has expired without being processed,
-- left or sent to manual review otherwise. Existing refund functions only accept
-- funds_reserved and broadcasting rows, so these functions cover the later states.

create or replace function public.reconcile_settle_ton_withdrawal(
  p_withdrawal_id uuid,
  p_outcome text,
  p_transaction_hash text,
  p_message text,
  p_actual_fee_ton numeric default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.ton_withdrawals%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_balance numeric(30, 12);
  release_ton numeric;
  release_amount numeric(30, 12);
begin
  if p_outcome not in ('confirmed', 'refunded', 'manual_review') then
    raise exception 'Unsupported reconciliation outcome.';
  end if;

  select * into w from public.ton_withdrawals where id = p_withdrawal_id for update;
  if not found or w.status not in ('broadcasting', 'broadcast', 'manual_review') then
    return coalesce(w.status, 'missing');
  end if;

  if p_outcome = 'confirmed' then
    update public.ton_withdrawals
    set status = 'confirmed', confirmed_at = now(), transaction_hash = coalesce(nullif(p_transaction_hash, ''), transaction_hash),
        error_code = null, error_message = null
    where id = w.id;
    update public.wallet_ledger
    set metadata = metadata || jsonb_build_object('withdrawal_status', 'confirmed', 'transaction_hash', p_transaction_hash)
    where source_id = w.id and operation_type = 'crypto_withdrawal' and direction = 'debit';

    -- Return the unused part of the network fee reserve once the real fee is known.
    if p_actual_fee_ton is not null and p_actual_fee_ton > 0 and w.network_fee_reserve_ton > 0 then
      release_ton := greatest(0, w.network_fee_reserve_ton - p_actual_fee_ton);
      release_amount := trunc(w.network_fee_reserve_amount * release_ton / w.network_fee_reserve_ton, 6);
      if release_amount > 0 then
        select * into wallet from public.wallet_accounts where user_id = w.user_id for update;
        if found then
          next_balance := wallet.balance + release_amount;
          update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = w.user_id;
          insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
          values (w.user_id, 'credit', release_amount, wallet.currency_code, 'crypto_withdrawal', 'crypto_withdrawal', w.id, next_balance,
            'ton_withdrawal:' || w.id::text || ':fee_release',
            jsonb_build_object('withdrawal_status', 'fee_released', 'network_fee_reserve_ton', w.network_fee_reserve_ton, 'actual_fee_ton', p_actual_fee_ton, 'released_ton', release_ton))
          on conflict (idempotency_key) where idempotency_key is not null do nothing;
        end if;
      end if;
    end if;
    return 'confirmed';
  end if;

  if p_outcome = 'manual_review' then
    update public.ton_withdrawals
    set status = 'manual_review', error_code = 'reconcile_unresolved', error_message = left(p_message, 500)
    where id = w.id;
    return 'manual_review';
  end if;

  select * into wallet from public.wallet_accounts where user_id = w.user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;
  next_balance := wallet.balance + w.total_reserved_amount;
  update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = w.user_id;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (w.user_id, 'credit', w.total_reserved_amount, wallet.currency_code, 'crypto_withdrawal', 'crypto_withdrawal', w.id, next_balance,
    'ton_withdrawal:' || w.id::text || ':refund',
    jsonb_build_object('withdrawal_status', 'refunded', 'error_code', 'expired_not_sent', 'error_message', left(p_message, 500)));
  update public.ton_withdrawals
  set status = 'refunded', error_code = 'expired_not_sent', error_message = left(p_message, 500), refunded_at = now()
  where id = w.id;
  return 'refunded';
end;
$$;

create or replace function public.reconcile_settle_ton_usdt_withdrawal(
  p_withdrawal_id uuid,
  p_outcome text,
  p_transaction_hash text,
  p_message text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.ton_usdt_withdrawals%rowtype;
  wallet public.wallet_accounts%rowtype;
  next_balance numeric(30, 12);
begin
  if p_outcome not in ('confirmed', 'refunded', 'manual_review') then
    raise exception 'Unsupported reconciliation outcome.';
  end if;

  select * into w from public.ton_usdt_withdrawals where id = p_withdrawal_id for update;
  if not found or w.status not in ('broadcasting', 'broadcast', 'manual_review') then
    return coalesce(w.status, 'missing');
  end if;

  if p_outcome = 'confirmed' then
    update public.ton_usdt_withdrawals
    set status = 'confirmed', confirmed_at = now(), transaction_hash = coalesce(nullif(p_transaction_hash, ''), transaction_hash),
        error_code = null, error_message = null
    where id = w.id;
    update public.wallet_ledger
    set metadata = metadata || jsonb_build_object('withdrawal_status', 'confirmed', 'transaction_hash', p_transaction_hash)
    where source_id = w.id and operation_type = 'crypto_withdrawal' and direction = 'debit';
    return 'confirmed';
  end if;

  if p_outcome = 'manual_review' then
    update public.ton_usdt_withdrawals
    set status = 'manual_review', error_code = 'reconcile_unresolved', error_message = left(p_message, 500)
    where id = w.id;
    return 'manual_review';
  end if;

  select * into wallet from public.wallet_accounts where user_id = w.user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;
  next_balance := wallet.balance + w.total_reserved_amount;
  update public.wallet_accounts set balance = next_balance, updated_at = now() where user_id = w.user_id;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (w.user_id, 'credit', w.total_reserved_amount, wallet.currency_code, 'crypto_withdrawal', 'crypto_withdrawal', w.id, next_balance,
    'ton_usdt_withdrawal:' || w.id::text || ':refund',
    jsonb_build_object('withdrawal_status', 'refunded', 'error_code', 'expired_not_sent', 'error_message', left(p_message, 500)));
  update public.ton_usdt_withdrawals
  set status = 'refunded', error_code = 'expired_not_sent', error_message = left(p_message, 500), refunded_at = now()
  where id = w.id;
  return 'refunded';
end;
$$;

revoke all on function public.reconcile_settle_ton_withdrawal(uuid, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.reconcile_settle_ton_usdt_withdrawal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reconcile_settle_ton_withdrawal(uuid, text, text, text, numeric) to service_role;
grant execute on function public.reconcile_settle_ton_usdt_withdrawal(uuid, text, text, text) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_withdrawal_reconciliation()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;
  if v_project_url is null or v_secret is null then
    raise exception 'Withdrawal reconciliation Vault configuration is missing.';
  end if;
  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/ton/withdrawals/reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ton-scanner-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.dispatch_withdrawal_reconciliation() from public, anon, authenticated;
grant execute on function public.dispatch_withdrawal_reconciliation() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-withdrawal-reconcile') then
    perform cron.unschedule('open-abundance-withdrawal-reconcile');
  end if;
  perform cron.schedule('open-abundance-withdrawal-reconcile', '* * * * *', 'select public.dispatch_withdrawal_reconciliation();');
end;
$$;

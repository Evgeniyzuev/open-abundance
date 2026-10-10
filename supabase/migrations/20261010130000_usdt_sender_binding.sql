-- Bound USDT senders: automatic attribution of deposits without a comment.
--
-- A participant's first deposit carries the secret invoice comment. That proves the person can send
-- from that address, so the sender address is bound to the account. From then on a deposit from a
-- bound address is credited to that account with no comment and any amount. When an address is
-- bound, unmatched deposits that came from it in the last 14 days are credited too, so a payment
-- sent without a comment is recovered by one later payment with the comment.
--
-- Binding is only offered for personal-looking addresses (checked by the server before calling
-- bind_ton_usdt_sender); one address belongs to exactly one account.

create table if not exists public.ton_usdt_bound_senders (
  sender_owner_address text primary key,
  network text not null check (network in ('testnet', 'mainnet')),
  user_id uuid not null references auth.users(id) on delete cascade,
  bound_event_id uuid references public.ton_usdt_chain_events(id) on delete set null,
  created_at timestamptz not null default now(),
  last_credited_at timestamptz
);

create index if not exists ton_usdt_bound_senders_user_idx
  on public.ton_usdt_bound_senders (user_id, created_at desc);

alter table public.ton_usdt_bound_senders enable row level security;
revoke all on public.ton_usdt_bound_senders from public, anon, authenticated;
grant select, insert, update, delete on public.ton_usdt_bound_senders to service_role;

alter table public.ton_usdt_chain_events
  add column if not exists sender_binding_result text;

-- New terminal status for deposits credited through a bound sender.
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.ton_usdt_chain_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%credited_amount_mismatch%';
  if v_constraint is not null then
    execute format('alter table public.ton_usdt_chain_events drop constraint %I', v_constraint);
  end if;
end;
$$;

alter table public.ton_usdt_chain_events
  add constraint ton_usdt_chain_events_status_check check (status in (
    'detected', 'finalizing', 'finalized', 'credited', 'credited_late',
    'credited_amount_mismatch', 'credited_bound_sender', 'unmatched', 'awaiting_rate', 'failed'
  ));

-- Credits an event to the account that owns its sender address, or marks it unmatched.
create or replace function public.credit_ton_usdt_event_to_bound_sender(p_chain_event_id uuid)
returns table (event_status text, credited_user_id uuid, usd_amount numeric, wallet_balance numeric, ledger_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.ton_usdt_chain_events%rowtype;
  v_user_id uuid;
  v_wallet public.wallet_accounts%rowtype;
  v_usd_amount numeric(30, 2);
  v_ledger_id uuid;
begin
  select event.* into v_event
  from public.ton_usdt_chain_events as event
  where event.id = p_chain_event_id
  for update;
  if not found then raise exception 'TON USDT chain event not found.'; end if;

  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'credited_bound_sender') then
    return query select v_event.status, v_event.settlement_user_id, coalesce(v_event.settled_usd_amount, 0)::numeric, null::numeric, v_event.settlement_ledger_id;
    return;
  end if;
  if v_event.status not in ('finalized', 'unmatched') then
    raise exception 'TON USDT chain event is not settleable.';
  end if;

  select bound.user_id into v_user_id
  from public.ton_usdt_bound_senders as bound
  where bound.sender_owner_address = v_event.sender_owner_address
    and bound.network = v_event.network;

  if v_user_id is null or v_event.usdt_usd_rate is null then
    update public.ton_usdt_chain_events as target set status = 'unmatched' where target.id = v_event.id;
    return query select 'unmatched'::text, null::uuid, 0::numeric, null::numeric, null::uuid;
    return;
  end if;

  select wallet.* into v_wallet from public.wallet_accounts as wallet where wallet.user_id = v_user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;

  v_usd_amount := round(v_event.amount_units / 1000000 * v_event.usdt_usd_rate, 2);
  if v_usd_amount <= 0 then raise exception 'TON USDT deposit is below the minimum Wallet precision.'; end if;

  update public.wallet_accounts as wallet
  set balance = wallet.balance + v_usd_amount, updated_at = now()
  where wallet.user_id = v_user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (v_user_id, 'credit', v_usd_amount, v_wallet.currency_code, 'crypto_deposit', 'crypto_deposit', v_event.id, v_wallet.balance,
    'ton_usdt_deposit:' || v_event.id::text,
    jsonb_build_object('network', v_event.network, 'asset_code', v_event.asset_code, 'master_address', v_event.master_address,
      'transaction_hash', v_event.transaction_hash, 'logical_time', v_event.logical_time, 'amount_units', v_event.amount_units,
      'decimals', 6, 'usdt_usd_rate', v_event.usdt_usd_rate, 'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp, 'rate_metadata', v_event.rate_metadata,
      'quote_currency', 'USD', 'credited_usd_amount', v_usd_amount, 'wallet_currency_code', v_wallet.currency_code,
      'finalized_at', v_event.finalized_at, 'attribution', 'bound_sender', 'sender_owner_address', v_event.sender_owner_address))
  returning id into v_ledger_id;

  update public.ton_usdt_chain_events as target
  set status = 'credited_bound_sender', settled_usd_amount = v_usd_amount, settled_at = now(),
      settlement_user_id = v_user_id, settlement_ledger_id = v_ledger_id
  where target.id = v_event.id;

  update public.ton_usdt_bound_senders as bound
  set last_credited_at = now()
  where bound.sender_owner_address = v_event.sender_owner_address;

  return query select 'credited_bound_sender'::text, v_user_id, v_usd_amount::numeric, v_wallet.balance::numeric, v_ledger_id;
end;
$$;

-- Binds a sender address to an account and credits earlier unmatched deposits from that address.
-- Returns {result: bound | already_bound | taken | invalid, retro_credited: n}.
create or replace function public.bind_ton_usdt_sender(
  p_user_id uuid,
  p_sender text,
  p_network text,
  p_event_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_existing uuid;
  v_credited integer := 0;
  v_row record;
begin
  if p_user_id is null or p_sender is null or btrim(p_sender) = '' or p_network not in ('testnet', 'mainnet') then
    return jsonb_build_object('result', 'invalid', 'retro_credited', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ton_usdt_sender:' || p_sender, 0));

  select bound.user_id into v_existing
  from public.ton_usdt_bound_senders as bound
  where bound.sender_owner_address = p_sender;

  if v_existing is not null and v_existing <> p_user_id then
    return jsonb_build_object('result', 'taken', 'retro_credited', 0);
  end if;

  if v_existing is null then
    insert into public.ton_usdt_bound_senders (sender_owner_address, network, user_id, bound_event_id)
    values (p_sender, p_network, p_user_id, p_event_id);
  end if;

  for v_row in
    select event.id
    from public.ton_usdt_chain_events as event
    where event.status = 'unmatched'
      and event.sender_owner_address = p_sender
      and event.network = p_network
      and event.settlement_user_id is null
      and event.usdt_usd_rate is not null
      and event.finalized_at > now() - interval '14 days'
    order by event.logical_time
  loop
    begin
      perform public.credit_ton_usdt_event_to_bound_sender(v_row.id);
      v_credited := v_credited + 1;
    exception when others then
      -- One failing event must not undo the binding or the other credits.
      null;
    end;
  end loop;

  return jsonb_build_object(
    'result', case when v_existing is null then 'bound' else 'already_bound' end,
    'retro_credited', v_credited
  );
end;
$$;

-- Settlement: a deposit without a usable invoice comment is credited through a bound sender when
-- there is one, and stays unmatched otherwise. Everything else is unchanged.
create or replace function public.settle_ton_usdt_deposit(p_chain_event_id uuid)
returns table (event_status text, credited_user_id uuid, usd_amount numeric, wallet_balance numeric, ledger_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.ton_usdt_chain_events%rowtype;
  v_invoice public.ton_usdt_deposit_invoices%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_usd_amount numeric(30, 2);
  v_status text;
  v_ledger_id uuid;
begin
  select * into v_event from public.ton_usdt_chain_events where id = p_chain_event_id for update;
  if not found then raise exception 'TON USDT chain event not found.'; end if;
  if v_event.status in ('credited', 'credited_late', 'credited_amount_mismatch', 'credited_bound_sender', 'unmatched') then
    return query select v_event.status, v_event.settlement_user_id, coalesce(v_event.settled_usd_amount, 0)::numeric, null::numeric, v_event.settlement_ledger_id; return;
  end if;
  if v_event.status <> 'finalized' then raise exception 'TON USDT chain event is not finalized.'; end if;
  if v_event.invoice_code is null or btrim(v_event.invoice_code) = '' then
    return query select * from public.credit_ton_usdt_event_to_bound_sender(v_event.id);
    return;
  end if;
  select * into v_invoice from public.ton_usdt_deposit_invoices where invoice_code = v_event.invoice_code for update;
  if not found then
    return query select * from public.credit_ton_usdt_event_to_bound_sender(v_event.id);
    return;
  end if;
  if v_event.usdt_usd_rate is null then
    update public.ton_usdt_chain_events set status = 'awaiting_rate' where id = v_event.id;
    update public.ton_usdt_deposit_invoices set status = 'awaiting_rate' where id = v_invoice.id;
    return query select 'awaiting_rate'::text, v_invoice.user_id, 0::numeric, null::numeric, null::uuid; return;
  end if;
  select * into v_wallet from public.wallet_accounts where user_id = v_invoice.user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;
  v_usd_amount := round(v_event.amount_units / 1000000 * v_event.usdt_usd_rate, 2);
  if v_usd_amount <= 0 then raise exception 'TON USDT deposit is below the minimum Wallet precision.'; end if;
  v_status := case when v_invoice.expires_at < now() then 'credited_late'
    when v_invoice.expected_amount_units is not null and v_invoice.expected_amount_units <> v_event.amount_units then 'credited_amount_mismatch'
    else 'credited' end;
  update public.wallet_accounts set balance = balance + v_usd_amount, updated_at = now()
  where user_id = v_invoice.user_id returning * into v_wallet;
  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (v_invoice.user_id, 'credit', v_usd_amount, v_wallet.currency_code, 'crypto_deposit', 'crypto_deposit', v_event.id, v_wallet.balance,
    'ton_usdt_deposit:' || v_event.id::text,
    jsonb_build_object('network', v_event.network, 'asset_code', v_event.asset_code, 'master_address', v_event.master_address,
      'transaction_hash', v_event.transaction_hash, 'logical_time', v_event.logical_time, 'amount_units', v_event.amount_units,
      'decimals', 6, 'usdt_usd_rate', v_event.usdt_usd_rate, 'rate_provider', v_event.rate_provider,
      'rate_source_timestamp', v_event.rate_source_timestamp, 'rate_metadata', v_event.rate_metadata,
      'quote_currency', 'USD', 'credited_usd_amount', v_usd_amount, 'wallet_currency_code', v_wallet.currency_code,
      'finalized_at', v_event.finalized_at, 'invoice_code', v_event.invoice_code, 'invoice_status', v_status))
  returning id into v_ledger_id;
  update public.ton_usdt_chain_events set status = v_status, settled_usd_amount = v_usd_amount, settled_at = now(),
    settlement_user_id = v_invoice.user_id, settlement_ledger_id = v_ledger_id where id = v_event.id;
  update public.ton_usdt_deposit_invoices set status = v_status where id = v_invoice.id;
  return query select v_status, v_invoice.user_id, v_usd_amount, v_wallet.balance, v_ledger_id;
end;
$$;

revoke all on function public.credit_ton_usdt_event_to_bound_sender(uuid) from public, anon, authenticated;
revoke all on function public.bind_ton_usdt_sender(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.settle_ton_usdt_deposit(uuid) from public, anon, authenticated;
grant execute on function public.credit_ton_usdt_event_to_bound_sender(uuid) to service_role;
grant execute on function public.bind_ton_usdt_sender(uuid, text, text, uuid) to service_role;
grant execute on function public.settle_ton_usdt_deposit(uuid) to service_role;

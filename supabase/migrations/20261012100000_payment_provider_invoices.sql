-- Payment provider invoices (first provider: Crypto Pay). A provider invoice is a request to pay a USD amount
-- in the provider's own flow; when the provider confirms payment, the Wallet is credited once.
--
-- Safety rules enforced here, not only in the application:
--   * a "testnet" invoice never credits a real Wallet: it ends as `paid_test`;
--   * crediting is idempotent: one ledger row per invoice, a second call returns the first result;
--   * the table is server-only (no client grants).

create table if not exists public.payment_provider_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('cryptopay')),
  network text not null check (network in ('mainnet', 'testnet')),
  provider_invoice_id text,
  status text not null default 'active' check (status in ('active', 'paid_test', 'credited', 'expired', 'failed', 'manual_review')),
  usd_amount numeric(20, 2) not null check (usd_amount > 0),
  paid_asset text,
  provider_fee numeric(30, 12),
  pay_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  credited_at timestamptz,
  ledger_id uuid,
  idempotency_key text not null,
  provider_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, network, provider_invoice_id),
  unique (user_id, idempotency_key)
);

create index if not exists payment_provider_invoices_user_idx on public.payment_provider_invoices (user_id, created_at desc);
create index if not exists payment_provider_invoices_open_idx on public.payment_provider_invoices (status, created_at) where status = 'active';

alter table public.payment_provider_invoices enable row level security;
revoke all on public.payment_provider_invoices from public, anon, authenticated;
grant select, insert, update on public.payment_provider_invoices to service_role;

create or replace function public.settle_payment_provider_invoice(
  p_invoice_id uuid,
  p_paid_asset text,
  p_provider_fee numeric,
  p_provider_payload jsonb
)
returns table (invoice_status text, credited_user_id uuid, usd_amount numeric, wallet_balance numeric, ledger_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.payment_provider_invoices%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_ledger_id uuid;
begin
  select * into v_invoice from public.payment_provider_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Payment invoice not found.'; end if;

  if v_invoice.status in ('credited', 'paid_test') then
    return query select v_invoice.status, v_invoice.user_id, v_invoice.usd_amount::numeric, null::numeric, v_invoice.ledger_id;
    return;
  end if;
  if v_invoice.status in ('failed', 'manual_review') then
    raise exception 'Payment invoice needs manual review.';
  end if;

  -- A test-network payment proves the integration but is not money: it never reaches a Wallet.
  if v_invoice.network <> 'mainnet' then
    update public.payment_provider_invoices
    set status = 'paid_test', paid_asset = p_paid_asset, provider_fee = p_provider_fee, paid_at = now(),
        provider_payload = coalesce(p_provider_payload, '{}'::jsonb), updated_at = now()
    where id = v_invoice.id;
    return query select 'paid_test'::text, v_invoice.user_id, v_invoice.usd_amount::numeric, null::numeric, null::uuid;
    return;
  end if;

  select * into v_wallet from public.wallet_accounts where user_id = v_invoice.user_id for update;
  if not found then raise exception 'Wallet is not created yet.'; end if;

  update public.wallet_accounts set balance = balance + v_invoice.usd_amount, updated_at = now()
  where user_id = v_invoice.user_id returning * into v_wallet;

  insert into public.wallet_ledger (user_id, direction, amount, currency_code, operation_type, source_type, source_id, balance_after, idempotency_key, metadata)
  values (v_invoice.user_id, 'credit', v_invoice.usd_amount, v_wallet.currency_code, 'crypto_deposit', 'crypto_deposit', v_invoice.id, v_wallet.balance,
    'payment_provider:' || v_invoice.id::text,
    jsonb_build_object('provider', v_invoice.provider, 'network', v_invoice.network, 'provider_invoice_id', v_invoice.provider_invoice_id,
      'paid_asset', p_paid_asset, 'provider_fee', p_provider_fee, 'credited_usd_amount', v_invoice.usd_amount))
  returning id into v_ledger_id;

  update public.payment_provider_invoices
  set status = 'credited', paid_asset = p_paid_asset, provider_fee = p_provider_fee, paid_at = now(), credited_at = now(),
      ledger_id = v_ledger_id, provider_payload = coalesce(p_provider_payload, '{}'::jsonb), updated_at = now()
  where id = v_invoice.id;

  return query select 'credited'::text, v_invoice.user_id, v_invoice.usd_amount::numeric, v_wallet.balance::numeric, v_ledger_id;
end;
$$;

revoke all on function public.settle_payment_provider_invoice(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.settle_payment_provider_invoice(uuid, text, numeric, jsonb) to service_role;

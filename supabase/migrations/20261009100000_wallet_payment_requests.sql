-- Payment requests: a participant asks another participant to pay a fixed Wallet amount.
-- The payer opens a link or QR, sees who asks for what and confirms with one tap.
-- Payment reuses wallet_transfer, so it is fee-free, idempotent and recorded in both ledgers.

create table if not exists public.wallet_payment_requests (
  id uuid primary key default gen_random_uuid(),
  payee_user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(30, 12) not null check (amount > 0 and scale(amount) <= 6),
  note text check (note is null or char_length(note) <= 140),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  paid_by_user_id uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  payer_ledger_id uuid,
  payee_ledger_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_payment_requests_payee_created_idx
  on public.wallet_payment_requests (payee_user_id, created_at desc);
create index if not exists wallet_payment_requests_payer_paid_idx
  on public.wallet_payment_requests (paid_by_user_id, paid_at desc) where paid_by_user_id is not null;

alter table public.wallet_payment_requests enable row level security;
revoke all on public.wallet_payment_requests from public, anon, authenticated;
grant select, insert, update on public.wallet_payment_requests to service_role;

create or replace function public.pay_wallet_payment_request(
  p_request_id uuid,
  p_payer_user_id uuid
)
returns table (
  request_status text,
  payer_ledger_id uuid,
  payee_ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.wallet_payment_requests%rowtype;
  sender_ledger uuid;
  recipient_ledger uuid;
begin
  select * into req from public.wallet_payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'Payment request was not found.';
  end if;

  if req.status = 'paid' then
    if req.paid_by_user_id = p_payer_user_id then
      return query select req.status, req.payer_ledger_id, req.payee_ledger_id;
      return;
    end if;
    raise exception 'Payment request is already paid.';
  end if;
  if req.status <> 'open' then
    raise exception 'Payment request is not open.';
  end if;
  if req.expires_at <= now() then
    raise exception 'Payment request has expired.';
  end if;
  if req.payee_user_id = p_payer_user_id then
    raise exception 'Cannot transfer Wallet to yourself.';
  end if;

  select t.sender_wallet_ledger_id, t.recipient_wallet_ledger_id
  into sender_ledger, recipient_ledger
  from public.wallet_transfer(
    p_payer_user_id,
    req.payee_user_id,
    req.amount,
    'wallet_transfer',
    req.id,
    'payment_request:' || req.id::text
  ) t;

  update public.wallet_payment_requests
  set status = 'paid', paid_by_user_id = p_payer_user_id, paid_at = now(),
      payer_ledger_id = sender_ledger, payee_ledger_id = recipient_ledger, updated_at = now()
  where id = req.id;

  return query select 'paid'::text, sender_ledger, recipient_ledger;
end;
$$;

revoke all on function public.pay_wallet_payment_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pay_wallet_payment_request(uuid, uuid) to service_role;

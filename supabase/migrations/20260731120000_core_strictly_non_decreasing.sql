-- Core is a strictly non-decreasing internal balance.
-- The earlier breach/redemption safeguard is retained only as migration history;
-- it must not be able to reduce Core or initiate an external payout.

create or replace function public.guard_core_balance_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.balance < old.balance then
    raise exception 'Core balance cannot decrease.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.redeem_core_after_breach(
  p_user_id uuid,
  p_network text,
  p_payout_address text,
  p_idempotency_key text default null
)
returns setof public.core_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Core is strictly non-decreasing and cannot be redeemed.' using errcode = '42501';
end;
$$;

create or replace function public.complete_core_redemption_request(
  p_request_id uuid,
  p_tx_hash text
)
returns setof public.core_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Core is strictly non-decreasing and cannot be redeemed.' using errcode = '42501';
end;
$$;

update public.core_redemption_controls
set redemption_enabled = false,
    user_facing_enabled = false,
    worker_paused = true,
    updated_at = now()
where id = true;

revoke all on function public.redeem_core_after_breach(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.claim_core_redemption_request(uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_core_redemption_request(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.fail_core_redemption_request(uuid, text) from public, anon, authenticated, service_role;

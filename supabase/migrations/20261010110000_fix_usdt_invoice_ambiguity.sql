-- Fix: creating a TON USDT deposit invoice failed with
--   column reference "user_id" is ambiguous
-- The function returns a table whose output columns (user_id, status, created_at, expires_at, ...)
-- share names with the invoice table, so unqualified references were ambiguous. Every table column
-- is now qualified with an alias.
--
-- Also: an invoice that is past its expiry but still in an active status would block creating a
-- new one through the one-active-invoice-per-user unique index. Such invoices are now closed as
-- 'expired' first.

create or replace function public.create_or_reuse_ton_usdt_deposit_invoice(
  p_user_id uuid,
  p_network text,
  p_master_address text,
  p_invoice_code text,
  p_deposit_owner_address text,
  p_deposit_jetton_wallet_address text,
  p_expected_amount_units numeric,
  p_expires_at timestamptz,
  p_replace_active boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  network text,
  asset_code text,
  master_address text,
  invoice_code text,
  deposit_owner_address text,
  deposit_jetton_wallet_address text,
  expected_amount_units numeric,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reused boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice public.ton_usdt_deposit_invoices%rowtype;
begin
  if p_user_id is null or p_master_address is null or p_invoice_code is null then
    raise exception 'Missing TON USDT invoice data.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ton_usdt_invoice:' || p_user_id::text, 0));

  -- Close waiting invoices that ran out of time so they cannot block a new one. Invoices already
  -- detected on chain are left to the settlement flow.
  update public.ton_usdt_deposit_invoices as stale
  set status = 'expired', updated_at = now()
  where stale.user_id = p_user_id
    and stale.status = 'waiting'
    and stale.expires_at <= now();

  if p_replace_active then
    update public.ton_usdt_deposit_invoices as replaced
    set status = 'cancelled', updated_at = now()
    where replaced.user_id = p_user_id
      and replaced.status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate');
  else
    select invoice.* into v_invoice
    from public.ton_usdt_deposit_invoices as invoice
    where invoice.user_id = p_user_id
      and invoice.status in ('waiting', 'detected', 'finalizing', 'confirmed_pending_credit', 'awaiting_rate')
      and invoice.expires_at > now()
    order by invoice.created_at desc
    limit 1;
    if found then
      return query select v_invoice.id, v_invoice.user_id, v_invoice.network, v_invoice.asset_code,
        v_invoice.master_address, v_invoice.invoice_code, v_invoice.deposit_owner_address,
        v_invoice.deposit_jetton_wallet_address, v_invoice.expected_amount_units, v_invoice.status,
        v_invoice.expires_at, v_invoice.created_at, v_invoice.updated_at, true;
      return;
    end if;
  end if;

  insert into public.ton_usdt_deposit_invoices (
    user_id, network, master_address, invoice_code, deposit_owner_address,
    deposit_jetton_wallet_address, expected_amount_units, expires_at
  ) values (
    p_user_id, p_network, p_master_address, p_invoice_code, p_deposit_owner_address,
    p_deposit_jetton_wallet_address, p_expected_amount_units, p_expires_at
  ) returning * into v_invoice;

  return query select v_invoice.id, v_invoice.user_id, v_invoice.network, v_invoice.asset_code,
    v_invoice.master_address, v_invoice.invoice_code, v_invoice.deposit_owner_address,
    v_invoice.deposit_jetton_wallet_address, v_invoice.expected_amount_units, v_invoice.status,
    v_invoice.expires_at, v_invoice.created_at, v_invoice.updated_at, false;
end;
$$;

revoke all on function public.create_or_reuse_ton_usdt_deposit_invoice(uuid, text, text, text, text, text, numeric, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.create_or_reuse_ton_usdt_deposit_invoice(uuid, text, text, text, text, text, numeric, timestamptz, boolean) to service_role;

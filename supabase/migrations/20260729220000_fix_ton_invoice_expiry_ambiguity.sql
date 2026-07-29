create or replace function public.create_or_reuse_ton_deposit_invoice(
  p_user_id uuid,
  p_network text,
  p_asset_code text,
  p_invoice_code text,
  p_deposit_address text,
  p_expected_amount_nano numeric,
  p_expires_at timestamptz,
  p_replace_active boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  network text,
  asset_code text,
  invoice_code text,
  deposit_address text,
  expected_amount_nano numeric,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.ton_deposit_invoices%rowtype;
  v_invoice_id uuid;
begin
  if p_user_id is null then
    raise exception 'TON deposit user is required.';
  end if;
  if p_expected_amount_nano is not null and p_expected_amount_nano <= 0 then
    raise exception 'Expected TON amount must be positive.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_network || ':' || p_asset_code,
    0
  ));

  select invoice.*
  into v_invoice
  from public.ton_deposit_invoices as invoice
  where invoice.user_id = p_user_id
    and invoice.network = p_network
    and invoice.asset_code = p_asset_code
    and invoice.status in (
      'ready',
      'detected',
      'finalizing',
      'confirmed_pending_credit',
      'awaiting_rate'
    )
  order by invoice.created_at desc
  limit 1
  for update;

  if found and not p_replace_active then
    return query select
      v_invoice.id,
      v_invoice.user_id,
      v_invoice.network,
      v_invoice.asset_code,
      v_invoice.invoice_code,
      v_invoice.deposit_address,
      v_invoice.expected_amount_nano,
      v_invoice.status,
      v_invoice.expires_at,
      v_invoice.created_at,
      v_invoice.updated_at,
      true;
    return;
  end if;

  if found then
    update public.ton_deposit_invoices as replaced_invoice
    set status = 'cancelled',
        expires_at = least(replaced_invoice.expires_at, now())
    where replaced_invoice.id = v_invoice.id;
  end if;

  insert into public.ton_deposit_invoices (
    user_id,
    network,
    asset_code,
    invoice_code,
    deposit_address,
    expected_amount_nano,
    status,
    expires_at
  ) values (
    p_user_id,
    p_network,
    p_asset_code,
    p_invoice_code,
    p_deposit_address,
    p_expected_amount_nano,
    'ready',
    p_expires_at
  )
  returning ton_deposit_invoices.id into v_invoice_id;

  select invoice.*
  into strict v_invoice
  from public.ton_deposit_invoices as invoice
  where invoice.id = v_invoice_id;

  return query select
    v_invoice.id,
    v_invoice.user_id,
    v_invoice.network,
    v_invoice.asset_code,
    v_invoice.invoice_code,
    v_invoice.deposit_address,
    v_invoice.expected_amount_nano,
    v_invoice.status,
    v_invoice.expires_at,
    v_invoice.created_at,
    v_invoice.updated_at,
    false;
end;
$$;

revoke all on function public.create_or_reuse_ton_deposit_invoice(
  uuid, text, text, text, text, numeric, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.create_or_reuse_ton_deposit_invoice(
  uuid, text, text, text, text, numeric, timestamptz, boolean
) to service_role;

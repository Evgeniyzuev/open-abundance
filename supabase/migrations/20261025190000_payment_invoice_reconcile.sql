-- Safety net for provider top-ups (Crypto Pay): every 5 minutes, while any invoice is still open, the app asks the
-- provider about each one (POST /api/internal/payments/reconcile), credits paid ones once and marks expired ones.
-- The webhook stays the fast path; this catches a missed or switched-off webhook. Same Vault secrets as the TON jobs.

create or replace function public.dispatch_payment_invoice_reconciliation()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_secret text;
  v_request_id bigint;
begin
  if not exists (select 1 from public.payment_provider_invoices where status = 'active') then
    return null;
  end if;

  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'ton_scanner_project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ton_scanner_secret' limit 1;
  if v_project_url is null or v_secret is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/api/internal/payments/reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ton-scanner-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_payment_invoice_reconciliation() from public, anon, authenticated;
grant execute on function public.dispatch_payment_invoice_reconciliation() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'open-abundance-payment-invoice-reconcile') then
    perform cron.unschedule('open-abundance-payment-invoice-reconcile');
  end if;
  perform cron.schedule(
    'open-abundance-payment-invoice-reconcile',
    '*/5 * * * *',
    'select public.dispatch_payment_invoice_reconciliation();'
  );
end;
$$;

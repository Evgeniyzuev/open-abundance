-- Normalize the internal Wallet/Marketplace currency marker to a plain dollar sign.
-- Historical migration files may mention the former marker, but runtime data and defaults use '$'.

alter table public.user_economy_metrics
  drop constraint if exists user_economy_metrics_currency_code_check;

do $$
declare
  legacy_currency text := 'OA' || '$';
begin
  update public.wallet_accounts
  set currency_code = '$'
  where currency_code = legacy_currency;

  update public.wallet_ledger
  set currency_code = '$'
  where currency_code = legacy_currency;

  update public.marketplace_listings
  set currency_code = '$'
  where currency_code = legacy_currency;

  update public.marketplace_deals
  set currency_code = '$'
  where currency_code = legacy_currency;

  -- Avoid a key collision if a partially migrated read model already contains '$' rows.
  delete from public.user_economy_metrics legacy
  where legacy.currency_code = legacy_currency
    and exists (
      select 1
      from public.user_economy_metrics current_value
      where current_value.user_id = legacy.user_id
        and current_value.period_type = legacy.period_type
        and current_value.period_key = legacy.period_key
        and current_value.currency_code = '$'
    );

  update public.user_economy_metrics
  set currency_code = '$'
  where currency_code = legacy_currency;

  update public.wallet_ledger
  set metadata = jsonb_set(metadata, '{wallet_currency_code}', to_jsonb('$'::text), true)
  where metadata ->> 'wallet_currency_code' = legacy_currency;
end;
$$;

alter table public.wallet_accounts
  alter column currency_code set default '$';
alter table public.wallet_ledger
  alter column currency_code set default '$';
alter table public.marketplace_listings
  alter column currency_code set default '$';
alter table public.marketplace_deals
  alter column currency_code set default '$';

alter table public.user_economy_metrics
  drop constraint if exists user_economy_metrics_currency_code_check;
alter table public.user_economy_metrics
  add constraint user_economy_metrics_currency_code_check check (currency_code = '$');
alter table public.user_economy_metrics
  alter column currency_code set default '$';

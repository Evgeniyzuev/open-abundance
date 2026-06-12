create index if not exists wallet_ledger_counterparty_user_id_idx
on public.wallet_ledger (counterparty_user_id)
where counterparty_user_id is not null;

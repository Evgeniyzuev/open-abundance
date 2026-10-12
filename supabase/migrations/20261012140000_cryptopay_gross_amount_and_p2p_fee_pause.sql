-- CryptoBot deposits cost the project nothing: the invoice is raised by the provider's share, and the Wallet is
-- credited the amount the person chose (usd_amount). pay_usd_amount is what the provider invoice is for.
alter table public.payment_provider_invoices add column if not exists pay_usd_amount numeric(20, 2);

-- P2P fee: it is to be paid by the seller (the side that cashes out), which needs an extra reserve held from the
-- seller. Until that is built, no fee is taken from the buyer. No P2P order exists yet.
update public.p2p_risk_configs set pilot_fee_percent = 0 where version = 'p2p-pilot-v1';

-- New hot wallet (Evgen, 2026-11-15): deposits of TON and USDT on TON go to the new address.
-- The old wallet UQCKnJOL... was emptied on 2026-11-08 outside the app and is no longer used.
-- Rows are updated only where they exist; with no rows the app reads the addresses from the environment.
update public.ton_deposit_config
set deposit_address = 'UQDg6KYDf2lsve4pMD0OL6C-Ksw3ck6WTmYhC2KOByDzF5Cd'
where network = 'mainnet' and asset_code = 'TON';

-- The Jetton wallet is derived from the official USDT master EQCxE6mU... and the new owner (get_wallet_address).
update public.ton_usdt_config
set deposit_owner_address = 'UQDg6KYDf2lsve4pMD0OL6C-Ksw3ck6WTmYhC2KOByDzF5Cd',
    deposit_jetton_wallet_address = 'EQAHg6rAj8ujjBh2Ncsp_G1w6LgFs-605eXBrdjzwTMfRuoB'
where network = 'mainnet' and asset_code = 'USDT';

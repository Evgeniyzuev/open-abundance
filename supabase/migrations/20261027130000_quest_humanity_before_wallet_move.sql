-- Founder decision 2026-10-27: «Я не робот» goes before «Вывод и пополнение». It pays $1 to Wallet, so the next step
-- can be done by withdrawing that dollar (no own money needed), and after it the first withdrawal has no $1 minimum.
begin;
update public.challenges set path_order = path_order + 100 where path_order in (7, 8);
update public.challenges set path_order = 7 where path_order = 108 and verification_logic = 'humanity_confirmed';
update public.challenges set path_order = 8 where path_order = 107 and verification_logic = 'wallet_deposit_or_withdrawal';
commit;

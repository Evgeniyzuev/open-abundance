-- scale() of a numeric(30,12) column is always 12, so the original check rejected every
-- amount. Require at most six decimals by comparing the value with its rounded form.
alter table public.wallet_payment_requests
  drop constraint if exists wallet_payment_requests_amount_check;
alter table public.wallet_payment_requests
  add constraint wallet_payment_requests_amount_check check (amount > 0 and amount = round(amount, 6));

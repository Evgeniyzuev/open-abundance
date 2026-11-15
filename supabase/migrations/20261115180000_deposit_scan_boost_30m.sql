-- Fast deposit scanning (every 15 seconds) now lasts 30 minutes after the deposit screen was opened instead of 10.
-- People open the invoice, leave for their wallet or exchange and pay later; with 10 minutes the payment often
-- fell back to the 5-minute safety scan (Evgen, 2026-11-15: "почему идут 2-5 минут"). The boost never shrinks.
create or replace function public.boost_deposit_scan(p_asset text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_asset not in ('TON', 'USDT') then
    return;
  end if;
  insert into public.deposit_scan_boosts (asset_code, boosted_until)
  values (p_asset, now() + interval '30 minutes')
  on conflict (asset_code) do update set boosted_until = greatest(public.deposit_scan_boosts.boosted_until, excluded.boosted_until);
end;
$$;
revoke all on function public.boost_deposit_scan(text) from public, anon;
grant execute on function public.boost_deposit_scan(text) to authenticated, service_role;

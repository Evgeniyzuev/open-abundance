-- An Open Abundance product (listing with metadata.product_key from the OA seller account) is sold in any number of
-- copies. The marketplace marks a listing reserved on purchase and sold on completion; for these listings the status
-- stays active (sales_count and sold_at still count). Also reopens the first product bought on 2026-10-27.
begin;

create or replace function public.keep_oa_product_listing_open()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('reserved', 'sold')
     and new.metadata ? 'product_key'
     and new.seller_user_id = '351e063e-e59a-45bf-a911-4612df15ba57'::uuid then
    new.status := 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_oa_product_listing_open on public.marketplace_listings;
create trigger keep_oa_product_listing_open
before update of status on public.marketplace_listings
for each row execute function public.keep_oa_product_listing_open();

update public.marketplace_listings set status = 'active'
where seller_user_id = '351e063e-e59a-45bf-a911-4612df15ba57'::uuid and metadata ? 'product_key' and status in ('reserved', 'sold');

commit;

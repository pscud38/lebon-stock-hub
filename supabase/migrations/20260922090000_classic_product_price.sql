-- Restore the original product sale-price field as reference data only.
-- Stock documents remain IN/OUT/COUNT and never record a sale.
alter table public.products add column if not exists sale_price numeric not null default 0;

create or replace function stock_private.request_with_price(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; price numeric; target text;
begin
 if p_action='products' then
   result:=stock_private.request(p_token,p_action,p_data);
   select coalesce(jsonb_agg(item || jsonb_build_object('salePrice',p.sale_price) order by item->>'productId'),'[]'::jsonb)
     into result from jsonb_array_elements(result) item
     join public.products p on p.product_id=item->>'productId';
   return result;
 end if;
 if p_action='productSave' and p_data ? 'salePrice' then
   if jsonb_typeof(p_data->'salePrice') not in ('number','string')
      or coalesce(p_data->>'salePrice','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$'
   then raise exception 'ราคาขายต้องเป็นตัวเลขตั้งแต่ 0 ถึง 999999999 และมีทศนิยมไม่เกิน 2 ตำแหน่ง'; end if;
   price:=(p_data->>'salePrice')::numeric;
   target:=trim(p_data->>'productId');
   result:=stock_private.request(p_token,p_action,p_data);
   update public.products set sale_price=price where product_id=target;

   return result;
 end if;
 return stock_private.request(p_token,p_action,p_data);
end $$;

create or replace function public.stock_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select stock_private.request_with_price(p_token,p_action,p_data) $$;
revoke all on function stock_private.request_with_price(text,text,jsonb) from public,anon,authenticated;
grant execute on function stock_private.request_with_price(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';


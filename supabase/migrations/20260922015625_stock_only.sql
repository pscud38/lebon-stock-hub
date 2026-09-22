-- Apply atomically during cutover, after a verified backup. Existing rows are retained.
-- Authentication deliberately preserves the shop's existing username/password accounts.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists stock_private;
revoke all on schema stock_private from public;

create table if not exists public.products (
 product_id text primary key, product_name text not null, category text default 'ทั่วไป', unit text default 'ชิ้น',
 cost_price numeric default 0, current_stock numeric default 0, min_alert numeric default 5,
 note text default '', last_updated timestamptz default now()
);
create table if not exists public.transactions (
 trans_id text primary key, timestamp timestamptz default now(), product_id text,
 product_name text, type text not null, quantity numeric not null, cost_price numeric default 0,
 total_cost numeric default 0, operator text, note text default '', image_url text default ''
);
create table if not exists public.categories (name text primary key);
create table if not exists public.users (
 username text primary key, password text not null, full_name text, role text default 'staff',
 status text default 'active', created_at timestamptz default now()
);
create unique index if not exists stock_users_username_ci on public.users(lower(username));
alter table public.products add column if not exists active boolean not null default true;
alter table public.products add column if not exists image_url text not null default '';
alter table public.transactions add column if not exists document_id uuid;
alter table public.transactions add column if not exists stock_before numeric;
alter table public.transactions add column if not exists stock_after numeric;
alter table public.transactions add column if not exists recipient text default '';
create index if not exists stock_transactions_time on public.transactions(timestamp desc, trans_id);
create index if not exists stock_transactions_product on public.transactions(product_id, timestamp desc);
create index if not exists stock_transactions_document on public.transactions(document_id);

create table stock_private.sessions (
 token_hash text primary key, username text not null references public.users(username),
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index on stock_private.sessions(username);
create table stock_private.login_attempts (
 username text primary key, failures integer not null default 0, window_start timestamptz not null default now()
);
create table stock_private.documents (
 id uuid primary key, username text not null, payload jsonb not null,
 reversal_of uuid unique references stock_private.documents(id), created_at timestamptz not null default now()
);
create table stock_private.audit (
 id bigint generated always as identity primary key, username text not null, action text not null,
 reference text not null, detail jsonb not null, created_at timestamptz not null default now()
);

-- Hash any legacy plaintext passwords without changing the user's password.
update public.users set password = extensions.crypt(password, extensions.gen_salt('bf', 10))
where password not like '$2%';

-- Remove all legacy table/view access, including policies that admitted every visitor.
do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public'
   and tablename in ('products','transactions','categories','users','preorders') loop
   execute format('alter table public.%I enable row level security',r.tablename);
   execute format('revoke all on public.%I from public, anon, authenticated',r.tablename);
 end loop;
 for r in select tablename,policyname from pg_policies where schemaname='public'
   and tablename in ('products','transactions','categories','users','preorders') loop
   execute format('drop policy %I on public.%I',r.policyname,r.tablename);
 end loop;
 for r in select viewname from pg_views where schemaname='public' and viewname in ('safe_users','staff_products') loop
   execute format('revoke all on public.%I from public, anon, authenticated',r.viewname);
 end loop;
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
   ('login_user','change_password','admin_save_user','admin_delete_user','execute_stock_transaction','get_next_product_id','mute_product_alert') loop
   execute format('revoke all on function %s from public, anon, authenticated',r.signature);
 end loop;
end $$;
alter table stock_private.sessions enable row level security;
alter table stock_private.login_attempts enable row level security;
alter table stock_private.documents enable row level security;
alter table stock_private.audit enable row level security;
revoke all on all tables in schema stock_private from public,anon,authenticated;

create function stock_private.actor(p_token text) returns public.users
language plpgsql security definer set search_path='' as $$
declare u public.users;
begin
 select x.* into u from public.users x join stock_private.sessions s on s.username=x.username
 where s.token_hash=encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex')
 and s.expires_at>now() and x.status='active' and x.role in ('admin','staff') for share of x;
 if not found then raise exception 'กรุณาเข้าสู่ระบบใหม่' using errcode='28000'; end if;
 return u;
end $$;

create function stock_private.login(p_username text,p_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; a stock_private.login_attempts; token text;
begin
 if length(coalesce(p_username,''))>100 or octet_length(coalesce(p_password,''))>72 then
   return jsonb_build_object('success',false,'message','ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
 end if;
 select * into u from public.users where lower(username)=lower(trim(p_username));
 if not found then return jsonb_build_object('success',false,'message','ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); end if;
 insert into stock_private.login_attempts(username) values(u.username) on conflict do nothing;
 select * into a from stock_private.login_attempts where username=u.username for update;
 if a.window_start < now()-interval '15 minutes' then
   update stock_private.login_attempts set failures=0,window_start=now() where username=u.username;
   a.failures:=0;
 end if;
 if a.failures>=5 then return jsonb_build_object('success',false,'message','ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที'); end if;
 if u.status is distinct from 'active' or u.role not in ('admin','staff') or
    extensions.crypt(coalesce(p_password,''),u.password) is distinct from u.password then
   update stock_private.login_attempts set failures=failures+1 where username=u.username;
   return jsonb_build_object('success',false,'message','ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
 end if;
 update stock_private.login_attempts set failures=0,window_start=now() where username=u.username;
 delete from stock_private.sessions where expires_at<=now();
 token:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into stock_private.sessions(token_hash,username,expires_at)
 values(encode(sha256(convert_to(token,'UTF8')),'hex'),u.username,now()+interval '8 hours');
 return jsonb_build_object('success',true,'token',token,'expiresAt',now()+interval '8 hours',
   'user',jsonb_build_object('username',u.username,'fullName',u.full_name,'role',u.role));
end $$;

create function stock_private.post_document(u public.users,p_id uuid,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old stock_private.documents; item jsonb; p public.products; q numeric; new_stock numeric;
 new_cost numeric; unit_cost numeric; kind text:=d->>'type'; signed_q numeric; i integer:=0; ref uuid;
begin
 if p_id is null or d is null then raise exception 'เอกสารไม่ถูกต้อง'; end if;
 if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') not between 1 and 100
 then raise exception 'เอกสารต้องมีสินค้า 1–100 รายการ'; end if;
 if kind not in ('IN','OUT','COUNT') or kind is null or length(trim(coalesce(d->>'reason','')))=0
   or length(d->>'reason')>1000 or length(coalesce(d->>'recipient',''))>300 then raise exception 'ประเภทหรือเหตุผลไม่ถูกต้อง'; end if;
 if kind='COUNT' and u.role<>'admin' then raise exception 'เฉพาะผู้ดูแลปรับยอดได้' using errcode='42501'; end if;
 if length(coalesce(d->>'image',''))>400000 or (coalesce(d->>'image','')<>'' and d->>'image' !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
 then raise exception 'รูปเอกสารไม่ถูกต้องหรือใหญ่เกินกำหนด'; end if;
 if exists(select 1 from jsonb_array_elements(d->'items') x group by x->>'productId' having count(*)>1)
 then raise exception 'สินค้าซ้ำในเอกสาร'; end if;
 -- Serializes retries for one document; row locks below serialize different documents.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into old from stock_private.documents where id=p_id;
 if found then
   if old.username<>u.username or old.payload<>d then raise exception 'รหัสเอกสารถูกใช้กับข้อมูลอื่นแล้ว'; end if;
   return jsonb_build_object('id',p_id,'duplicate',true);
 end if;
 ref:=nullif(d->>'reversalOf','')::uuid;
 if ref is not null then
   if u.role<>'admin' then raise exception 'เฉพาะผู้ดูแลย้อนรายการได้' using errcode='42501'; end if;
   perform 1 from stock_private.documents where id=ref for update;
   if not found then raise exception 'ไม่พบเอกสารต้นทาง'; end if;
   if exists(select 1 from stock_private.documents where reversal_of=ref) then raise exception 'เอกสารถูกย้อนแล้ว'; end if;
 end if;
 -- Stable lock order prevents deadlocks across multi-product documents.
 perform 1 from public.products where product_id in (select x->>'productId' from jsonb_array_elements(d->'items') x)
 order by product_id for update;
 insert into stock_private.documents(id,username,payload,reversal_of) values(p_id,u.username,d,ref);
 for item in select value from jsonb_array_elements(d->'items') loop
   i:=i+1;
   select * into p from public.products where product_id=item->>'productId';
   if not found or not p.active then raise exception 'ไม่พบสินค้าหรือสินค้าปิดใช้งาน: %',item->>'productId'; end if;
   q:=(item->>'quantity')::numeric;
   if q is null or q<0 or q>100000000 or q<>round(q,3) or q::text in ('NaN','Infinity','-Infinity')
     or (kind<>'COUNT' and q=0) then raise exception 'จำนวนไม่ถูกต้อง'; end if;
   if p.current_stock is null or p.cost_price is null or p.current_stock<0 or p.cost_price<0 then raise exception 'ข้อมูลตั้งต้นสินค้าไม่ถูกต้อง'; end if;
   if kind='COUNT' then
     if (item->>'expectedStock')::numeric is distinct from p.current_stock then raise exception 'สต็อกเปลี่ยนระหว่างตรวจนับ กรุณาโหลดข้อมูลใหม่'; end if;
     signed_q:=q-p.current_stock;
   else signed_q:=case when kind='IN' then q else -q end; end if;
   new_stock:=p.current_stock+signed_q;
   if new_stock<0 or new_stock>100000000 then raise exception 'สต็อกไม่เพียงพอหรือเกินขอบเขต: %',p.product_name; end if;
   unit_cost:=p.cost_price;
   new_cost:=p.cost_price;
   if item ? 'cost' then
     if u.role<>'admin' or (kind<>'IN' and ref is null) then raise exception 'ไม่มีสิทธิ์กำหนดต้นทุน' using errcode='42501'; end if;
     unit_cost:=(item->>'cost')::numeric;
     if unit_cost is null or unit_cost<0 or unit_cost>100000000 or unit_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'ต้นทุนไม่ถูกต้อง'; end if;
   end if;
   if kind='IN' then new_cost:=round((p.current_stock*p.cost_price+q*unit_cost)/new_stock,6); end if;
   if kind='OUT' and ref is not null then
     if p.current_stock*p.cost_price-q*unit_cost < -0.000001 then raise exception 'ย้อนต้นทุนไม่ได้ กรุณาตรวจนับและปรับยอด'; end if;
     new_cost:=case when new_stock=0 then p.cost_price else round(greatest(0,p.current_stock*p.cost_price-q*unit_cost)/new_stock,6) end;
   end if;
   update public.products set current_stock=new_stock,cost_price=new_cost,last_updated=now() where product_id=p.product_id;
   insert into public.transactions(trans_id,product_id,product_name,type,quantity,cost_price,total_cost,operator,note,image_url,
      document_id,stock_before,stock_after,recipient)
   values(p_id::text||'-'||i,p.product_id,p.product_name,case when kind='COUNT' then 'ADJUST' else kind end,
     case when kind='COUNT' then signed_q else q end,unit_cost,abs(signed_q)*unit_cost,u.username,d->>'reason',coalesce(d->>'image',''),
     p_id,p.current_stock,new_stock,coalesce(d->>'recipient',''));
 end loop;
 insert into stock_private.audit(username,action,reference,detail) values(u.username,'document',p_id::text,jsonb_build_object('type',kind,'lines',i));
 return jsonb_build_object('id',p_id,'duplicate',false);
end $$;

create function stock_private.request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users; result jsonb; row_before jsonb; p public.products; target text; new_role text;
 original stock_private.documents; items jsonb; reversal jsonb; reverse_kind text;
begin
 u:=stock_private.actor(p_token);
 if p_action='session' then return jsonb_build_object('username',u.username,'fullName',u.full_name,'role',u.role); end if;
 if p_action='logout' then
   delete from stock_private.sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
   return '{}'::jsonb;
 end if;
 if p_action='products' then
   select coalesce(jsonb_agg(jsonb_build_object('productId',product_id,'name',product_name,'category',category,'unit',unit,
     'stock',current_stock,'minAlert',min_alert,'active',active,'note',note,'image',image_url,'updatedAt',last_updated)
     ||case when u.role='admin' then jsonb_build_object('cost',cost_price) else '{}'::jsonb end order by product_id),'[]')
   into result from public.products;
   return result;
 end if;
 if p_action='history' then
   select coalesce(jsonb_agg(t.row order by t.timestamp desc,t.trans_id desc),'[]') into result from (
     select trans_id,timestamp,jsonb_build_object('id',trans_id,'timestamp',timestamp,'productId',product_id,'name',product_name,
       'type',type,'quantity',quantity,'operator',operator,'reason',note,'image',image_url,'recipient',recipient,
       'documentId',document_id,'before',stock_before,'after',stock_after,
       'reversed',exists(select 1 from stock_private.documents where reversal_of=document_id))
       ||case when u.role='admin' then jsonb_build_object('cost',cost_price,'totalCost',total_cost) else '{}'::jsonb end as row
     from public.transactions
     where timestamp>=((coalesce(nullif(p_data->>'from',''),'2000-01-01'))::date::timestamp at time zone 'Asia/Bangkok')
       and timestamp<(((coalesce(nullif(p_data->>'to',''),'2100-01-01'))::date+1)::timestamp at time zone 'Asia/Bangkok')
       and timestamp<=coalesce((p_data->>'asOf')::timestamptz,now())
       and (coalesce(p_data->>'productId','')='' or product_id=p_data->>'productId')
     order by timestamp desc,trans_id desc limit 200 offset greatest(0,coalesce((p_data->>'offset')::integer,0))
   ) t; return result;
 end if;
 if p_action='post' then
   if p_data->'document' ? 'reversalOf' or p_data->'document' ? 'cancelled' then raise exception 'ใช้คำสั่งย้อนรายการโดยเฉพาะ'; end if;
   return stock_private.post_document(u,(p_data->>'id')::uuid,p_data->'document');
 end if;
 if p_action='cancel' then
   perform pg_advisory_xact_lock(hashtextextended((p_data->>'id')::uuid::text,0));
   select * into original from stock_private.documents where id=(p_data->>'id')::uuid;
   if found then
     if original.username<>u.username then raise exception 'ไม่มีสิทธิ์ยกเลิกรายการนี้'; end if;
     return jsonb_build_object('posted',not coalesce((original.payload->>'cancelled')::boolean,false));
   end if;
   insert into stock_private.documents(id,username,payload) values((p_data->>'id')::uuid,u.username,'{"cancelled":true}'::jsonb);
   insert into stock_private.audit(username,action,reference,detail) values(u.username,'cancel',p_data->>'id','{}'::jsonb);
   return '{"posted":false}'::jsonb;
 end if;
 if p_action='password' then
   if extensions.crypt(p_data->>'oldPassword',u.password) is distinct from u.password then raise exception 'รหัสผ่านเดิมไม่ถูกต้อง'; end if;
   if length(coalesce(p_data->>'newPassword',''))<8 or octet_length(p_data->>'newPassword')>72 then raise exception 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษรและไม่เกิน 72 ไบต์'; end if;
   update public.users set password=extensions.crypt(p_data->>'newPassword',extensions.gen_salt('bf',10)) where username=u.username;
   delete from stock_private.sessions where username=u.username;
   return '{}'::jsonb;
 end if;
 if u.role<>'admin' then raise exception 'เฉพาะผู้ดูแลระบบ' using errcode='42501'; end if;
 if p_action='productSave' then
   target:=trim(p_data->>'productId');
   perform pg_advisory_xact_lock(hashtextextended('product:'||coalesce(target,''),0));
   if coalesce(target,'')='' or length(target)>100 or length(trim(coalesce(p_data->>'name','')))=0 or length(p_data->>'name')>300
   then raise exception 'กรุณาระบุรหัสและชื่อสินค้าให้ถูกต้อง'; end if;
   if (p_data->>'minAlert')::numeric is null or (p_data->>'minAlert')::numeric<0 or (p_data->>'minAlert')::numeric>100000000
      or (p_data->>'minAlert')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'จุดแจ้งเตือนไม่ถูกต้อง'; end if;
   if length(coalesce(p_data->>'image',''))>400000 or (coalesce(p_data->>'image','')<>'' and p_data->>'image' !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
   then raise exception 'รูปภาพไม่ถูกต้อง'; end if;
   select to_jsonb(x) into row_before from public.products x where product_id=target for update;
   if row_before is not null and (p_data->>'expectedUpdatedAt')::timestamptz is distinct from (row_before->>'last_updated')::timestamptz
   then raise exception 'สินค้าเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนแก้ไข'; end if;
   if row_before is null and nullif(p_data->>'expectedUpdatedAt','') is not null then raise exception 'ไม่พบสินค้าเดิม'; end if;
   if row_before is not null and (p_data->>'active')::boolean=false and (row_before->>'current_stock')::numeric<>0
   then raise exception 'ปิดสินค้าได้เมื่อคงเหลือเป็นศูนย์เท่านั้น'; end if;
   insert into public.products(product_id,product_name,category,unit,min_alert,note,image_url,active)
   values(target,trim(p_data->>'name'),coalesce(nullif(trim(p_data->>'category'),''),'ทั่วไป'),coalesce(nullif(trim(p_data->>'unit'),''),'ชิ้น'),
     (p_data->>'minAlert')::numeric,coalesce(p_data->>'note',''),coalesce(p_data->>'image',''),coalesce((p_data->>'active')::boolean,true))
   on conflict(product_id) do update set product_name=excluded.product_name,category=excluded.category,unit=excluded.unit,
     min_alert=excluded.min_alert,note=excluded.note,image_url=excluded.image_url,active=excluded.active,last_updated=now();
   insert into stock_private.audit(username,action,reference,detail) values(u.username,'product',target,
     jsonb_build_object('before',row_before,'after',p_data)); return '{}'::jsonb;
 end if;
 if p_action='reverse' then
   select * into original from stock_private.documents where id=(p_data->>'originalId')::uuid for update;
   if not found then raise exception 'ย้อนอัตโนมัติได้เฉพาะเอกสารใหม่ กรุณาตรวจนับสำหรับประวัติเก่า'; end if;
   if original.reversal_of is not null or original.payload->>'type'='COUNT' then raise exception 'รายการนี้ให้แก้ด้วยการตรวจนับ'; end if;
   reverse_kind:=case when original.payload->>'type'='IN' then 'OUT' else 'IN' end;
   select jsonb_agg(jsonb_build_object('productId',product_id,'quantity',quantity,'cost',cost_price) order by trans_id)
     into items from public.transactions where document_id=original.id;
   reversal:=jsonb_build_object('type',reverse_kind,'items',items,'reason',p_data->>'reason','recipient','','image','','reversalOf',original.id);
   return stock_private.post_document(u,(p_data->>'id')::uuid,reversal);
 end if;
 if p_action='users' then
   select coalesce(jsonb_agg(to_jsonb(x)-'password' order by username),'[]') into result from public.users x; return result;
 end if;
 if p_action='userSave' then
   target:=lower(trim(p_data->>'username')); new_role:=p_data->>'role';
   if coalesce(target,'') !~ '^[A-Za-z0-9_.-]{1,80}$' or new_role not in ('admin','staff') or new_role is null
     or p_data->>'status' not in ('active','inactive') or p_data->>'status' is null then raise exception 'ข้อมูลผู้ใช้ไม่ถูกต้อง'; end if;
   if target=u.username and (new_role<>'admin' or p_data->>'status'<>'active') then raise exception 'ไม่สามารถระงับหรือลดสิทธิ์บัญชีตนเอง'; end if;
   if target='admin' and (new_role<>'admin' or p_data->>'status'<>'active') then raise exception 'ต้องคงบัญชี admin ไว้'; end if;
   select to_jsonb(x)-'password' into row_before from public.users x where username=target for update;
   if coalesce(p_data->>'password','')<>'' then
     if length(p_data->>'password')<8 or octet_length(p_data->>'password')>72 then raise exception 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษรและไม่เกิน 72 ไบต์'; end if;
   elsif row_before is null then raise exception 'กรุณากำหนดรหัสผ่าน'; end if;
   insert into public.users(username,password,full_name,role,status)
   values(target,extensions.crypt(coalesce(p_data->>'password',''),extensions.gen_salt('bf',10)),p_data->>'fullName',new_role,p_data->>'status')
   on conflict(username) do update set full_name=excluded.full_name,role=excluded.role,status=excluded.status,
     password=case when coalesce(p_data->>'password','')='' then public.users.password else excluded.password end;
   if coalesce(p_data->>'password','')<>'' or p_data->>'status'='inactive' then delete from stock_private.sessions where username=target; end if;
   insert into stock_private.audit(username,action,reference,detail) values(u.username,'user',target,
     jsonb_build_object('before',row_before,'after',p_data-'password')); return '{}'::jsonb;
 end if;
 if p_action='audit' then
   select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') into result from
     (select * from stock_private.audit order by id desc limit 200 offset greatest(0,coalesce((p_data->>'offset')::integer,0))) x;
   return result;
 end if;
 raise exception 'ไม่พบคำสั่ง';
end $$;

create function public.stock_login(p_username text,p_password text) returns jsonb
language sql security invoker set search_path='' as $$ select stock_private.login(p_username,p_password) $$;
create function public.stock_request(p_token text,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select stock_private.request(p_token,p_action,p_data) $$;
revoke all on all functions in schema stock_private from public,anon,authenticated;
revoke all on function public.stock_login(text,text),public.stock_request(text,text,jsonb) from public;
grant usage on schema stock_private to anon,authenticated;
grant execute on function stock_private.login(text,text),stock_private.request(text,text,jsonb) to anon,authenticated;
grant execute on function public.stock_login(text,text),public.stock_request(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';

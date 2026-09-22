import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
let db, adminToken, staffToken;
const migrations = readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort().map(x=>readFileSync('supabase/migrations/'+x,'utf8'));
before(async()=>{
  db = new PGlite();
  // PGlite does not ship pgcrypto. Only the password primitive is replaced here;
  // production uses extensions.crypt/bcrypt and is separately verified on Postgres.
  await db.exec("create role anon; create role authenticated; create schema extensions; "+
    "create function extensions.gen_salt(text,integer) returns text language sql as $$ select 'test-salt'::text $$; "+
    "create function extensions.crypt(text,text) returns text language sql strict as $$ select '$2-test$'||md5($1) $$;");
  for(const migration of migrations) await db.exec(migration.replace('create extension if not exists pgcrypto with schema extensions;',''));
});
beforeEach(async()=>{
  await db.exec("reset role; truncate stock_private.sessions,stock_private.login_attempts,stock_private.documents,stock_private.audit,public.transactions,public.products,public.users cascade;");
  await db.exec("insert into users(username,password,full_name,role,status) values "+
    "('admin',extensions.crypt('password123','salt'),'Admin','admin','active'),"+
    "('staff',extensions.crypt('password123','salt'),'Staff','staff','active');");
  adminToken=(await login('admin','password123')).token;
  staffToken=(await login('staff','password123')).token;
});
after(async()=>{await db?.close();});
async function login(username,password) { return (await db.query('select public.stock_login($1,$2) as result',[username,password])).rows[0].result; }
async function request(token,action,data={}) { return (await db.query('select public.stock_request($1,$2,$3::jsonb) as result',[token,action,JSON.stringify(data)])).rows[0].result; }
async function product(id='A') { return request(adminToken,'productSave',{productId:id,name:'สินค้า '+id,category:'ของเล่น',unit:'ชิ้น',minAlert:5,active:true}); }
function doc(type,items,reason='ทดสอบ') { return {type,items,reason,recipient:'คลัง',image:''}; }
async function post(token,document,id=crypto.randomUUID()) { return request(token,'post',{id,document}); }
async function stock(id='A') { return (await request(adminToken,'products')).find(x=>x.productId===id); }

test('legacy username login; wrong password and fabricated token rejected',async()=>{
  assert.equal((await login(' ADMIN ','password123')).user.username,'admin');
  assert.equal((await login('admin','wrong')).success,false);
  await assert.rejects(request('made-up-token','products'),/เข้าสู่ระบบใหม่/);
});
test('login throttling persists after rejected requests',async()=>{
  for(let i=0;i<5;i++)assert.equal((await login('admin','wrong')).success,false);
  assert.match((await login('admin','password123')).message,/15 นาที/);
});
test('anon can only use session-checked API; cannot read tables or internal mutator',async()=>{
  await product();
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.products'),/permission denied/);
  await assert.rejects(db.query('select * from public.users'),/permission denied/);
  await assert.rejects(db.query("select stock_private.post_document(null,null,null)"),/permission denied/);
  assert.equal((await request(staffToken,'products')).length,1);
  await db.exec('reset role');
});
test('staff cannot see cost or manage users/products/counts',async()=>{
  await product();await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:100}]));
  assert.equal('cost' in (await request(staffToken,'products'))[0],false);
  assert.equal('cost' in (await request(staffToken,'history'))[0],false);
  for(const action of ['users','audit','productSave','userSave','reverse'])
    await assert.rejects(request(staffToken,action,{}),/ผู้ดูแล/);
  await assert.rejects(post(staffToken,doc('COUNT',[{productId:'A',quantity:1,expectedStock:10}])),/ผู้ดูแล/);
  await assert.rejects(post(staffToken,doc('IN',[{productId:'A',quantity:1,cost:1}])),/สิทธิ์กำหนดต้นทุน/);
});
test('weighted average and stock-only issue preserve inventory valuation',async()=>{
  await product();
  await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:100}]));
  await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:200}]));
  await post(staffToken,doc('OUT',[{productId:'A',quantity:4}]));
  assert.equal((await stock()).stock,16);assert.equal((await stock()).cost,150);
  const history=await request(adminToken,'history');
  assert.equal(history[0].operator,'staff');assert.equal(history[0].totalCost,600);
});
test('sale price remains reference data across stock movements',async()=>{
  await request(adminToken,'productSave',{productId:'A',name:'สินค้า A',category:'ของเล่น',unit:'ชิ้น',minAlert:5,active:true,salePrice:890});
  assert.equal((await stock()).salePrice,890);
  assert.equal((await request(staffToken,'products'))[0].salePrice,890);
  await post(staffToken,doc('IN',[{productId:'A',quantity:2}]));
  await post(staffToken,doc('OUT',[{productId:'A',quantity:1}]));
  assert.equal((await stock()).salePrice,890);
  for(const salePrice of [-1,'NaN','100.999',1000000000])
    await assert.rejects(request(adminToken,'productSave',{productId:'B',name:'สินค้า B',minAlert:5,salePrice}));
  await assert.rejects(request(staffToken,'productSave',{productId:'A',name:'สินค้า A',minAlert:5,salePrice:1}),/ผู้ดูแล/);
});
test('zero-cost receipt participates in weighted average',async()=>{
  await product();await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:100}]));
  await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:0}]));
  assert.equal((await stock()).cost,50);
});
test('invalid quantity, duplicate product and missing reason rejected without change',async()=>{
  await product();
  for(const q of [0,-1,'NaN','Infinity',100000001,0.0001,null])
    await assert.rejects(post(adminToken,doc('IN',[{productId:'A',quantity:q}])));
  await assert.rejects(post(adminToken,doc('IN',[{productId:'A',quantity:1},{productId:'A',quantity:1}])),/ซ้ำ/);
  await assert.rejects(post(adminToken,doc('IN',[{productId:'A',quantity:1}],'')));
  assert.equal((await stock()).stock,0);
});
test('batch rolls back all product and ledger changes when any line fails',async()=>{
  await product();
  await assert.rejects(post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:100},{productId:'MISSING',quantity:1}])));
  assert.equal((await stock()).stock,0);
  assert.equal((await request(adminToken,'history')).length,0);
  assert.equal((await db.query('select count(*)::int as n from stock_private.documents')).rows[0].n,0);
});
test('insufficient stock rejected by server',async()=>{
  await product();await post(adminToken,doc('IN',[{productId:'A',quantity:2,cost:100}]));
  await assert.rejects(post(staffToken,doc('OUT',[{productId:'A',quantity:3}])),/ไม่เพียงพอ/);
  assert.equal((await stock()).stock,2);
});
test('same document retry does not change stock twice; changed payload is rejected',async()=>{
  await product();const id=crypto.randomUUID(),document=doc('IN',[{productId:'A',quantity:5,cost:10}]);
  await post(adminToken,document,id);
  assert.equal((await post(adminToken,document,id)).duplicate,true);
  await assert.rejects(post(adminToken,doc('IN',[{productId:'A',quantity:6}]),id),/ข้อมูลอื่น/);
  assert.equal((await stock()).stock,5);
  assert.equal((await request(adminToken,'history')).length,1);
});
test('count checks expected balance to prevent overwriting intervening movement',async()=>{
  await product();await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:100}]));
  await assert.rejects(post(adminToken,doc('COUNT',[{productId:'A',quantity:8,expectedStock:9}])),/สต็อกเปลี่ยน/);
  await post(adminToken,doc('COUNT',[{productId:'A',quantity:8,expectedStock:10}]));
  assert.equal((await stock()).stock,8);assert.equal((await request(adminToken,'history'))[0].quantity,-2);
});
test('reversal retains original, restores value, and cannot be repeated',async()=>{
  await product();await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:100}]));
  const original=await post(adminToken,doc('IN',[{productId:'A',quantity:10,cost:200}]));
  const id=crypto.randomUUID(),data={id,originalId:original.id,reason:'รับผิด'};
  await request(adminToken,'reverse',data);
  assert.equal((await stock()).stock,10);assert.equal((await stock()).cost,100);
  assert.equal((await request(adminToken,'reverse',data)).duplicate,true);
  await assert.rejects(request(adminToken,'reverse',{...data,id:crypto.randomUUID()}),/ย้อนแล้ว/);
  assert.equal((await request(adminToken,'history')).length,3);
});
test('cancel creates a tombstone so a late network request cannot write',async()=>{
  await product();const id=crypto.randomUUID();
  assert.equal((await request(adminToken,'cancel',{id})).posted,false);
  await assert.rejects(post(adminToken,doc('IN',[{productId:'A',quantity:1}]),id));
  assert.equal((await stock()).stock,0);
});
test('cancel after commit reports committed instead of pretending deletion',async()=>{
  await product();const result=await post(adminToken,doc('IN',[{productId:'A',quantity:1}]));
  assert.equal((await request(adminToken,'cancel',{id:result.id})).posted,true);
  await assert.rejects(request(staffToken,'cancel',{id:result.id}),/ไม่มีสิทธิ์/);
  assert.equal((await stock()).stock,1);
});
test('logout, expiry and account suspension invalidate authorization',async()=>{
  await request(staffToken,'logout');await assert.rejects(request(staffToken,'products'));
  staffToken=(await login('staff','password123')).token;
  await db.exec("update stock_private.sessions set expires_at=now()-interval '1 second' where username='staff'");
  await assert.rejects(request(staffToken,'products'));
  staffToken=(await login('staff','password123')).token;
  await request(adminToken,'userSave',{username:'staff',fullName:'Staff',role:'staff',status:'inactive',password:''});
  await assert.rejects(request(staffToken,'products'));
});
test('password update requires old password; invalidates all sessions; audit has no password',async()=>{
  await assert.rejects(request(staffToken,'password',{oldPassword:'wrong',newPassword:'newpassword'}));
  await request(staffToken,'password',{oldPassword:'password123',newPassword:'newpassword'});
  await assert.rejects(request(staffToken,'session'));
  assert.equal((await login('staff','newpassword')).success,true);
  await request(adminToken,'userSave',{username:'newstaff',fullName:'New',role:'staff',status:'active',password:'secret1234'});
  assert.equal(JSON.stringify(await request(adminToken,'audit')).includes('secret1234'),false);
});
test('optimistic product edit conflict and zero-balance archive enforced',async()=>{
  await product();const p=await stock();
  await assert.rejects(request(adminToken,'productSave',{productId:'A',name:'Changed',minAlert:1,active:true}),/เปลี่ยนแล้ว/);
  await post(adminToken,doc('IN',[{productId:'A',quantity:1}]));
  const updated=await stock();
  await assert.rejects(request(adminToken,'productSave',{productId:'A',name:'Changed',minAlert:1,active:false,expectedUpdatedAt:updated.updatedAt}),/ศูนย์/);
  assert.equal(p.name,'สินค้า A');
});
test('history dates use Bangkok boundaries and CSV snapshot timestamp',async()=>{
  await db.exec("insert into transactions(trans_id,timestamp,type,quantity,product_id) values"+
    "('before','2026-09-21 16:59:59Z','IN',1,'A'),('inside','2026-09-21 17:00:00Z','IN',1,'A'),('after','2026-09-22 17:00:00Z','IN',1,'A')");
  const rows=await request(adminToken,'history',{from:'2026-09-22',to:'2026-09-22',asOf:'2026-09-23T00:00:00Z'});
  assert.deepEqual(rows.map(x=>x.id),['inside']);
});


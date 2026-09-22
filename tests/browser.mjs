import { chromium } from 'playwright';
import { createServer } from 'vite';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync,mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec("create role anon;create role authenticated;create schema extensions;"+
 "create function extensions.gen_salt(text,integer) returns text language sql as $$ select 'salt'::text $$;"+
 "create function extensions.crypt(text,text) returns text language sql strict as $$ select '$2-test$'||md5($1) $$;");
for(const name of readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()){
 const sql=readFileSync('supabase/migrations/'+name,'utf8');
 await db.exec(sql.replace('create extension if not exists pgcrypto with schema extensions;',''));
}
await db.exec("insert into users(username,password,full_name,role,status) values"+
 "('admin',extensions.crypt('test123456','salt'),'ผู้ดูแลทดสอบ','admin','active'),"+
 "('staff',extensions.crypt('test123456','salt'),'พนักงานทดสอบ','staff','active');"+
 "insert into products(product_id,product_name,category,unit,cost_price,current_stock,min_alert) values"+
 "('TOY-001','กล่องสุ่ม Art Toy','ของเล่น','กล่อง',100,10,3),"+
 "('TOY-002','ตุ๊กตานุ่ม','ของเล่น','ตัว',50,2,5),('TOY-003','พวงกุญแจ','ของสะสม','ชิ้น',20,0,3);");
const server=await createServer({server:{host:'127.0.0.1',port:4178}});
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
let failNetwork=false, errors=[];
await context.route('https://*.supabase.co/**',async route=>{
 if(failNetwork){await route.abort('internetdisconnected');return;}
 try{
  const data=route.request().postDataJSON(),isLogin=route.request().url().endsWith('/stock_login');
  const result=isLogin?await db.query('select public.stock_login($1,$2) as result',[data.p_username,data.p_password])
   :await db.query('select public.stock_request($1,$2,$3::jsonb) as result',[data.p_token,data.p_action,JSON.stringify(data.p_data||{})]);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result.rows[0].result),headers:{'access-control-allow-origin':'*'}});
 }catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
async function login(user){
 await page.locator('#login-form input[name=username]').fill(user);
 await page.locator('#login-form input[name=password]').fill('test123456');
 await page.locator('#login-form button').click();
 await page.locator('#workspace').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('product-count').textContent.includes('3'));
}
async function addLine(type,quantity){
 await page.locator('[data-page=movement]').click();
 await page.locator('#movement-type').selectOption(type);
 await page.locator('#line-code').fill('TOY-001');await page.locator('#add-line').click();
 await page.locator('#movement-lines input').first().fill(String(quantity));
 await page.locator('#reason').fill('ทดสอบผ่านหน้าจอ');
}
try{
 await page.goto('http://127.0.0.1:4178');
 await login('admin');
 assert.equal(await page.locator('#stat-products').innerText(),'3');
 assert.equal(await page.locator('#product-form input[name=salePrice]').count(),1);
 await page.locator('#product-rows button').filter({hasText:'แก้ไข'}).first().click();
 await page.locator('#product-form input[name=salePrice]').fill('890');
 await page.locator('#product-form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#product-rows')?.textContent.includes('890'));
 assert.equal((await db.query("select sale_price from products where product_id='TOY-001'")).rows[0].sale_price,'890');
 await addLine('IN',5);
 await page.locator('#movement-lines input').nth(1).fill('200');
 await page.locator('#movement-form button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('ฐานข้อมูลยืนยัน'));
 assert.equal((await db.query("select current_stock from products where product_id='TOY-001'")).rows[0].current_stock,'15');
 await addLine('OUT',2);
 await page.locator('#movement-form button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('movement-lines').textContent.includes('เพิ่มสินค้า'));
 await page.waitForFunction(()=>document.getElementById('queue-count').textContent==='0');
 assert.equal((await db.query("select current_stock from products where product_id='TOY-001'")).rows[0].current_stock,'13');
 await page.locator('[data-page=history]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#history-rows tr').length===2);
 assert.ok((await page.locator('#history-rows').innerText()).includes('เบิกออก'));
 // Lost network keeps the same queued id, without changing the confirmed balance.
 await addLine('OUT',1);failNetwork=true;
 await page.locator('#movement-form button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('queue-count').textContent==='1');
 assert.equal((await db.query("select current_stock from products where product_id='TOY-001'")).rows[0].current_stock,'13');
 failNetwork=false;await page.locator('[data-page=queue]').click();await page.locator('#sync').click();
 await page.waitForFunction(()=>document.getElementById('queue-count').textContent==='0');
 assert.equal((await db.query("select current_stock from products where product_id='TOY-001'")).rows[0].current_stock,'12');
 // Admin inventory desktop and mobile layout.
 await page.locator('[data-page=inventory]').click();
 assert.equal(await page.locator('nav button.selected').getAttribute('data-page'),'inventory');
 mkdirSync('test-results',{recursive:true});
 await page.screenshot({path:'test-results/inventory-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:'test-results/inventory-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>{const nav=document.querySelector('nav').getBoundingClientRect(),logout=document.querySelector('#logout').getBoundingClientRect();return nav.top>innerHeight-100&&logout.bottom<nav.top;}));
 assert.equal(await page.locator('#change-password').isVisible(),true);
 await page.locator('#logout').click();await page.locator('#login-view').waitFor({state:'visible'});
 await login('staff');
 assert.equal(await page.locator('[data-page=users]').isVisible(),false);
 assert.equal(await page.locator('#stat-value').isVisible(),false);
 assert.equal(await page.locator('#product-rows').innerText().then(x=>x.includes('฿890')),true);
 assert.equal(await page.locator('th[data-admin]').isVisible(),false);
 await addLine('OUT',1);
 assert.equal(await page.locator('#movement-lines input').count(),1);
 const visible=await page.locator('body').innerText();
 assert.ok(!/Google Sheets|กำไร|POS/.test(visible));
 assert.deepEqual(errors,[]);
 console.log('PASS browser: admin receipt/issue/history, network retry, staff cost hiding, desktop/mobile layout; no page errors.');
}finally{
 await browser.close();await server.close();await db.close();
}


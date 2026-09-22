import {test} from 'node:test';
import assert from 'node:assert/strict';
import { quantity,documentPayload,csv,createRPC,ApiError,bangkokDay } from '../src/core.js';
import {sendQueue} from '../src/queue.js';
test('quantities reject blanks, negatives and invalid numbers but allow three decimals',()=>{
 for(const n of ['',null,-1,NaN,Infinity,'x',0.0001])assert.throws(()=>quantity(n));
 assert.equal(quantity(1.001),1.001);assert.equal(quantity(0,true),0);
});
test('stock documents require reason, distinct products and known type',()=>{
 assert.throws(()=>documentPayload('SALE',[],{}));
 assert.throws(()=>documentPayload('IN',[{productId:'A',quantity:1}],{}));
 assert.throws(()=>documentPayload('IN',[{productId:'A',quantity:1},{productId:'A',quantity:1}],{reason:'test'}));
 const doc=documentPayload('OUT',[{productId:'A',quantity:1,cost:99}],{reason:'เบิกใช้งาน'});
 assert.equal('cost' in doc.items[0],false);assert.equal('salePrice' in doc.items[0],false);
});
test('CSV escapes formulas, commas, quotes and carries Thai BOM',()=>{
 const out=csv([['ชื่อสินค้า','=CMD()', 'a"b,c', 'ภาษาไทย']]);
 assert.ok(out.startsWith('\uFEFF'));assert.ok(out.includes("'=CMD()"));assert.ok(out.includes('"a""b,c"'));
});
test('Bangkok date differs from UTC before midnight',()=>assert.equal(bangkokDay('2026-09-21T18:00:00Z'),'2026-09-22'));
test('API refuses HTTP failures and never reports false success',async()=>{
 const call=createRPC({url:'https://example.test',key:'public'},()=> 'session',async()=>({ok:false,status:500,json:async()=>({message:'db failed'})}));
 await assert.rejects(call('stock_request'),/db failed/);
});
test('API passes server session token without a client role',async()=>{
 let body;const call=createRPC({url:'https://example.test',key:'public'},()=> 'session',async(_,init)=>{body=JSON.parse(init.body);return{ok:true,json:async()=>({})};});
 await call('stock_request',{p_action:'products'});assert.deepEqual(body,{p_token:'session',p_action:'products'});
});
test('offline replay keeps failed and later items, retries with same id',async()=>{
 const docs=[{id:'one',user:'admin',payload:{}},{id:'two',user:'admin',payload:{}}],seen=[];
 const queue={list:async()=>[...docs],remove:async id=>docs.splice(docs.findIndex(x=>x.id===id),1),mark:async(d,e)=>{d.error=e;}};
 await sendQueue(queue,'admin',async d=>{seen.push(d.id);throw new ApiError('network');});
 assert.equal(docs.length,2);assert.deepEqual(seen,['one']);
 await sendQueue(queue,'admin',async d=>seen.push(d.id));
 assert.equal(docs.length,0);assert.deepEqual(seen,['one','one','two']);
});

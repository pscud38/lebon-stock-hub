import './style.css';
import { config } from './config.js';
import { createRPC, documentPayload, csv, thaiDate, bangkokDay } from './core.js';
import { Queue, sendQueue } from './queue.js';

const $ = id => document.getElementById(id);
const el = (tag, text = '', props = {}) => Object.assign(document.createElement(tag), { textContent: text, ...props });
const num = n => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 3 });
const labels = { IN: 'รับเข้า', OUT: 'เบิกออก', COUNT: 'ตรวจนับ', ADJUST: 'ปรับยอด' };
let session = null, products = [], history = [], lines = [], receipt = '', page = 'inventory';
let historyOffset = 0, auditOffset = 0, historyAsOf = new Date().toISOString(), editing = null, scanner = null, syncing = false;
const queue = new Queue();
const rpc = createRPC(config, () => session?.token || '');
const request = (action, data = {}) => rpc('stock_request', { p_action: action, p_data: data });
const admin = () => session?.user?.role === 'admin';

function notice(message, error = false) {
  const dialog = document.querySelector('dialog[open]');
  let target = $('notice');
  if (dialog && error) {
    target = dialog.querySelector('.dialog-error');
    if (!target) { target = el('p', '', { className: 'dialog-error notice error' }); target.setAttribute('role', 'alert'); dialog.prepend(target); }
  }
  target.textContent = message; target.hidden = false; target.className = 'notice' + (error ? ' error' : '');
}
function action(id, event, fn) {
  $(id).addEventListener(event, async e => {
    if (event === 'submit') e.preventDefault();
    const control = event === 'submit' ? e.target.querySelector('button[type="submit"],button:not([type])') : e.currentTarget;
    if (control?.disabled) return;
    if (control?.tagName === 'BUTTON') control.disabled = true;
    try { await fn(e); } catch (error) {
      if (id === 'login-form') $('login-error').textContent = error.message;
      else notice(error.message, true);
      if (error.message.includes('กรุณาเข้าสู่ระบบใหม่')) clearSession();
    } finally { if (control?.tagName === 'BUTTON') control.disabled = false; }
  });
}
function button(text, fn, className = '') {
  const b = el('button', text, { type: 'button', className });
  b.addEventListener('click', async () => {
    if (b.disabled) return; b.disabled = true;
    try { await fn(); } catch (e) { notice(e.message, true); } finally { b.disabled = false; }
  });
  return b;
}
function cell(row, text) { const td = el('td', text); row.append(td); return td; }
function empty(body, text, columns = 8) {
  if (body.children.length) return;
  const row = el('tr'); const td = cell(row, text); td.colSpan = columns; td.className = 'empty'; body.append(row);
}
function roleUI() {
  document.querySelectorAll('[data-admin]').forEach(x => x.hidden = !admin());
  $('account-name').textContent = session?.user?.fullName || session?.user?.username || '';
  $('account-role').textContent = admin() ? 'ผู้ดูแลระบบ' : 'พนักงาน';
}
function clearSession() {
  session = null; products = []; history = []; lines = []; receipt = '';
  sessionStorage.removeItem(config.sessionKey);
  document.querySelectorAll('dialog[open]').forEach(x => x.close());
  ['product-rows','history-rows','queue-list','user-list','audit-list','movement-lines'].forEach(x => $(x).replaceChildren());
  $('movement-form').reset(); $('password-form').reset(); $('user-form').reset();
  $('workspace').hidden = true; $('login-view').hidden = false;
}
async function enter() {
  session.user = await request('session');
  sessionStorage.setItem(config.sessionKey, JSON.stringify(session));
  roleUI(); $('workspace').hidden = false; $('login-view').hidden = true;
  await refresh(); await showPage('inventory');
}
async function refresh() {
  session.user = await request('session');
  const next = await request('products');
  products = next;
  const chosen = $('category').value;
  $('category').replaceChildren(new Option('ทุกหมวดหมู่', ''));
  [...new Set(products.map(p => p.category))].sort().forEach(c => $('category').append(new Option(c, c)));
  $('category').value = chosen;
  $('product-options').replaceChildren(...products.filter(p => p.active).map(p => new Option(p.name, p.productId)));
  renderProducts(); await renderQueue();
}
async function showPage(name) {
  if (['users','audit'].includes(name) && !admin()) return;
  page = name;
  const titles = { inventory:'สินค้าคงเหลือ',movement:'รับเข้า / เบิกออก',history:'ประวัติความเคลื่อนไหว',queue:'รายการรอส่ง',users:'ผู้ใช้งาน',audit:'ประวัติการแก้ไข' };
  document.querySelectorAll('[data-section]').forEach(s => s.hidden = s.dataset.section !== name);
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('selected', b.dataset.page === name));
  $('page-title').textContent = titles[name];
  if (name === 'history') { historyOffset = 0; historyAsOf = new Date().toISOString(); await loadHistory(); }
  if (name === 'queue') await renderQueue();
  if (name === 'users') await renderUsers();
  if (name === 'audit') await renderAudit();
  if (name === 'movement') renderLines();
}
function filteredProducts() {
  const term = $('search').value.trim().toLowerCase(), category = $('category').value, filter = $('stock-filter').value;
  return products.filter(p => (filter === 'all' || p.active) && (!category || p.category === category)
    && (!term || (p.productId + ' ' + p.name).toLowerCase().includes(term))
    && (filter !== 'low' || (p.stock > 0 && p.stock <= p.minAlert))
    && (filter !== 'zero' || Number(p.stock) === 0));
}
function safeImage(src) { return typeof src === 'string' && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) || /^https:\/\//.test(src)); }
function renderProducts() {
  roleUI();
  const active = products.filter(p => p.active);
  $('stat-products').textContent = num(active.length);
  $('stat-low').textContent = num(active.filter(p => p.stock > 0 && p.stock <= p.minAlert).length);
  $('stat-zero').textContent = num(active.filter(p => Number(p.stock) === 0).length);
  $('stat-value').textContent = '฿' + num(active.reduce((s,p) => s + p.stock * (p.cost || 0), 0));
  const selected = filteredProducts(), body = $('product-rows'); body.replaceChildren();
  $('product-count').textContent = 'แสดง ' + num(selected.length) + ' รายการ';
  selected.forEach(p => {
    const row = el('tr'), name = cell(row, ''), wrap = el('div', '', { className:'product-cell' });
    if (safeImage(p.image)) wrap.append(el('img', '', { src:p.image, alt:'', loading:'lazy' }));
    const text = el('div'); text.append(el('strong', p.name),el('small',p.productId)); wrap.append(text); name.append(wrap);
    cell(row,p.category); cell(row,num(p.stock) + ' ' + p.unit); cell(row,num(p.minAlert));
    if (admin()) cell(row,'฿' + num(p.cost));
    const state = cell(row,''); state.append(el('span',!p.active?'ปิดใช้งาน':Number(p.stock)===0?'หมด':p.stock<=p.minAlert?'ใกล้หมด':'พร้อมใช้งาน',
      {className:'badge' + (!p.active || Number(p.stock)===0?' off':p.stock<=p.minAlert?' warn':'')}));
    const actions = cell(row,'');
    if (p.active) actions.append(button('ทำรายการ',async () => { await showPage('movement'); addLine(p.productId); }));
    if (admin()) actions.append(button('แก้ไข',() => openProduct(p)));
    body.append(row);
  });
  empty(body,'ไม่พบสินค้า',admin()?7:6);
}
function addLine(code) {
  const p = products.find(x => x.productId.toLowerCase() === code.trim().toLowerCase() && x.active);
  if (!p) throw new Error('ไม่พบรหัสสินค้า');
  if (lines.some(x => x.productId === p.productId)) throw new Error('มีสินค้านี้ในเอกสารแล้ว กรุณาแก้จำนวนในแถวเดิม');
  if (lines.length >= 100) throw new Error('บันทึกได้ครั้งละไม่เกิน 100 รายการ');
  lines.push({ productId:p.productId, quantity:$('movement-type').value === 'COUNT'?p.stock:1, expectedStock:p.stock, cost:'' });
  $('line-code').value = ''; renderLines();
}
function renderLines() {
  const type = $('movement-type').value, showCost = admin() && type === 'IN';
  $('quantity-label').textContent = type === 'COUNT'?'ยอดที่นับได้':'จำนวน';
  $('line-cost-label').hidden = !showCost;
  const body = $('movement-lines'); body.replaceChildren();
  lines.forEach((line,index) => {
    const p = products.find(x => x.productId === line.productId); const row = el('tr');
    cell(row,p?.name || line.productId); cell(row,num(line.expectedStock) + ' ' + (p?.unit || ''));
    const qty = el('input','',{type:'number',min:type==='COUNT'?'0':'0.001',step:'0.001',max:'100000000',value:line.quantity,required:true});
    qty.setAttribute('aria-label','จำนวน ' + (p?.name || line.productId)); qty.addEventListener('input',() => line.quantity = qty.value); cell(row,'').append(qty);
    if (showCost) {
      const cost = el('input','',{type:'number',min:'0',step:'0.001',placeholder:'ใช้ต้นทุนเดิม',value:line.cost});
      cost.setAttribute('aria-label','ต้นทุน ' + (p?.name || line.productId)); cost.addEventListener('input',() => line.cost = cost.value); cell(row,'').append(cost);
    }
    cell(row,'').append(button('นำออก',() => {lines.splice(index,1);renderLines();})); body.append(row);
  });
  empty(body,'เพิ่มสินค้าเพื่อเริ่มทำรายการ',showCost?5:4);
}
async function sync() {
  if (syncing || !session) return;
  syncing = true;
  const owner = session.user.username;
  try {
    const sent = await sendQueue(queue, owner, doc => {
      if (session?.user.username !== owner) throw new Error('บัญชีผู้ใช้เปลี่ยน กรุณาเข้าสู่ระบบเดิม');
      return request(doc.payload.action,{...doc.payload.data,id:doc.id});
    });
    await renderQueue();
    if (sent) { await refresh(); notice('ฐานข้อมูลยืนยันแล้ว ' + sent + ' เอกสาร'); }
    else if ((await queue.list(owner)).length) notice('ยังมีรายการรอส่ง กรุณาตรวจรายละเอียดในเมนูรายการรอส่ง',true);
  } finally { syncing = false; }
}
async function renderQueue() {
  if (!session) return;
  const docs = await queue.list(session.user.username); $('queue-count').textContent = docs.length;
  const list = $('queue-list'); list.replaceChildren();
  if (!docs.length) list.append(el('p','ไม่มีรายการรอส่ง',{className:'empty'}));
  docs.forEach(doc => {
    const item = el('article','',{className:'list-item'}), info = el('div');
    info.append(el('strong',doc.payload.action==='reverse'?'ย้อนรายการ':labels[doc.payload.data.document.type]),
      el('small',thaiDate(doc.createdAt) + ' · ' + doc.id),el('p',doc.payload.data.document?.reason || doc.payload.data.reason),
      el('p',doc.error || 'รอส่งและยืนยัน',{className:doc.error?'danger':'muted'}));
    item.append(info,button('ยกเลิกรายการรอส่ง',async () => {
      if (!confirm('ยกเลิกรายการนี้? ระบบจะตรวจและป้องกันการส่งซ้ำที่ฐานข้อมูลก่อน')) return;
      const cancel = async () => {
        const result = await request('cancel',{id:doc.id});
        await queue.remove(doc.id);
        notice(result.posted?'รายการนี้บันทึกสำเร็จไปแล้ว กรุณาตรวจประวัติ':'ยกเลิกรายการรอส่งแล้ว');
        await refresh();
      };
      if (navigator.locks) await navigator.locks.request('lebon-sync-' + session.user.username,cancel); else await cancel();
    })); list.append(item);
  });
}
function historyParams(offset = historyOffset) {
  const from = $('history-from').value, to = $('history-to').value;
  if (from && to && from > to) throw new Error('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
  return {from,to,offset,asOf:historyAsOf};
}
async function loadHistory() {
  history = await request('history',historyParams());
  const body = $('history-rows'); body.replaceChildren();
  history.forEach(t => {
    const row = el('tr'); cell(row,thaiDate(t.timestamp)); const product = cell(row,t.name); product.append(el('small',t.productId));
    cell(row,labels[t.type] || t.type); cell(row,num(t.quantity)); cell(row,t.before == null?'ประวัติเดิม':num(t.before) + ' → ' + num(t.after));
    const who = cell(row,t.operator); who.append(el('small',t.recipient)); cell(row,t.reason); const commands = cell(row,'');
    if (safeImage(t.image)) commands.append(button('รูป',() => {$('document-image').src=t.image;openDialog('image-dialog');}));
    if (admin() && t.documentId && !t.reversed && t.type !== 'ADJUST') commands.append(button('ย้อนเอกสาร',async () => {
      const reason = prompt('เหตุผลที่ต้องย้อนทั้งเอกสาร (ทุกสินค้าในเอกสารจะถูกย้อน)');
      if (!reason?.trim()) return;
      await queue.add(session.user.username,{action:'reverse',data:{originalId:t.documentId,reason:reason.trim()}});
      await sync(); await loadHistory();
    }));
    if (t.reversed) commands.append(el('small','ย้อนแล้ว')); body.append(row);
  });
  empty(body,'ไม่มีรายการในช่วงวันที่นี้');
  $('history-page').textContent='หน้า '+(historyOffset/200+1);
  $('history-prev').disabled=historyOffset===0; $('history-next').disabled=history.length<200;
}
function download(name, content, type='text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content],{type})), a = el('a','',{href:url,download:name});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
function openDialog(id) {
  const dialog = $(id); dialog.querySelectorAll('.dialog-error').forEach(x => x.remove()); dialog.showModal();
}
function openProduct(p = null) {
  editing = p;
  const form = $('product-form'); form.reset();
  if (p) for (const key of ['productId','name','category','unit','minAlert','note','active']) form.elements[key].value = p[key];
  form.elements.productId.readOnly=!!p; openDialog('product-dialog');
}
async function compress(file) {
  if (!file) return '';
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>10000000) throw new Error('ใช้รูป JPG, PNG หรือ WebP ไม่เกิน 10 MB');
  const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
  const scale = Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  let data=canvas.toDataURL('image/jpeg',.72);
  if (data.length>400000) data=canvas.toDataURL('image/jpeg',.35);
  if (data.length>400000) throw new Error('รูปยังใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง');
  return data;
}
async function renderUsers() {
  const users = await request('users'), list=$('user-list'); list.replaceChildren();
  users.forEach(u => {
    const row=el('article','',{className:'list-item'}), info=el('div');
    info.append(el('strong',u.full_name || u.username),el('small',u.username+' · '+u.role+' · '+u.status));
    row.append(info,button('แก้ไข',()=>openUser(u)));list.append(row);
  });
}
function openUser(u=null) {
  const form=$('user-form');form.reset();
  if(u){form.elements.username.value=u.username;form.elements.fullName.value=u.full_name;form.elements.role.value=u.role;form.elements.status.value=u.status;}
  form.elements.username.readOnly=!!u;form.elements.password.required=!u;openDialog('user-dialog');
}
async function renderAudit() {
  const data=await request('audit',{offset:auditOffset}),list=$('audit-list');list.replaceChildren();
  data.forEach(a => {
    const item=el('article','',{className:'list-item'}), info=el('div'),details=el('details');
    info.append(el('strong',a.action+' · '+a.reference),el('small',thaiDate(a.created_at)+' · '+a.username));
    details.append(el('summary','ดูรายละเอียด'),el('pre',JSON.stringify(a.detail,null,2)));info.append(details);item.append(info);list.append(item);
  });
  if(!data.length)list.append(el('p','ยังไม่มีประวัติการแก้ไข',{className:'empty'}));
  $('audit-page').textContent='หน้า '+(auditOffset/200+1);
  $('audit-prev').disabled=auditOffset===0;$('audit-next').disabled=data.length<200;
}
async function startScanner(onScan) {
  openDialog('scanner-dialog');
  const { Html5Qrcode } = await import('html5-qrcode');
  scanner=new Html5Qrcode('scanner');
  let scanned=false;
  await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:160}},code=>{
    if(scanned)return;scanned=true;
    $('scanner-dialog').close();
    try{onScan(code.trim());}catch(e){notice(e.message,true);}
  },()=>{});
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page).catch(e=>notice(e.message,true))));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('scanner-dialog').addEventListener('close',async()=>{if(scanner){try{await scanner.stop();scanner.clear();}catch{}scanner=null;}});
action('login-form','submit',async e=>{
  $('login-error').textContent='';
  const form=new FormData(e.target);
  const result=await rpc('stock_login',{p_username:form.get('username').trim(),p_password:form.get('password')},false);
  if(!result.success)throw new Error(result.message);
  session=result;e.target.elements.password.value='';
  await enter();
});
action('logout','click',async()=>{
  if(syncing)throw new Error('กำลังซิงค์ กรุณารอให้เสร็จก่อนออกจากระบบ');
  await request('logout');clearSession();
});
action('refresh','click',async()=>{await refresh();if(page==='history'){historyAsOf=new Date().toISOString();await loadHistory();}notice('โหลดข้อมูลล่าสุดแล้ว');});
['search','category','stock-filter'].forEach(id=>action(id,id==='search'?'input':'change',renderProducts));
action('add-product','click',()=>openProduct());
action('add-line','click',()=>addLine($('line-code').value));
$('line-code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();try{addLine(e.target.value);}catch(err){notice(err.message,true);}}});
action('movement-type','change',()=>{
  lines=lines.map(line=>({...line,quantity:$('movement-type').value==='COUNT'?line.expectedStock:1,cost:''}));renderLines();
});
action('receipt-image','change',async e=>{receipt='';$('receipt-status').textContent='กำลังเตรียมรูป';receipt=await compress(e.target.files[0]);$('receipt-status').textContent=receipt?'แนบรูปพร้อมแล้ว':'';});
action('movement-form','submit',async()=>{
  if($('receipt-status').textContent==='กำลังเตรียมรูป')throw new Error('กรุณารอรูปภาพพร้อมก่อนบันทึก');
  const doc=documentPayload($('movement-type').value,lines,{reason:$('reason').value,recipient:$('recipient').value,image:receipt});
  if(!admin())doc.items.forEach(x=>delete x.cost);
  if(doc.type==='COUNT'&&!navigator.onLine)throw new Error('กรุณาเชื่อมต่อก่อนปรับยอดตรวจนับ');
  await queue.add(session.user.username,{action:'post',data:{document:doc}});
  lines=[];receipt='';$('movement-form').reset();$('receipt-status').textContent='';renderLines();
  notice('เก็บเอกสารในรายการรอส่งแล้ว ยังไม่เปลี่ยนยอดจนกว่าจะยืนยัน');
  await renderQueue();if(navigator.onLine)await sync();
});
action('sync','click',sync);
action('load-history','click',async()=>{historyOffset=0;historyAsOf=new Date().toISOString();await loadHistory();});
action('history-prev','click',async()=>{historyOffset=Math.max(0,historyOffset-200);await loadHistory();});
action('history-next','click',async()=>{historyOffset+=200;await loadHistory();});
action('audit-prev','click',async()=>{auditOffset=Math.max(0,auditOffset-200);await renderAudit();});
action('audit-next','click',async()=>{auditOffset+=200;await renderAudit();});
action('product-form','submit',async e=>{
  const form=e.target,data=Object.fromEntries(new FormData(form));delete data.photo;
  data.active=data.active==='true';data.expectedUpdatedAt=editing?.updatedAt||null;
  data.image=form.elements.photo.files[0]?await compress(form.elements.photo.files[0]):editing?.image||'';
  await request('productSave',data);$('product-dialog').close();await refresh();notice('บันทึกสินค้าแล้ว');
});
action('add-user','click',()=>openUser());
action('user-form','submit',async e=>{
  await request('userSave',Object.fromEntries(new FormData(e.target)));
  $('user-dialog').close();e.target.reset();await renderUsers();notice('บันทึกผู้ใช้แล้ว');
});
action('change-password','click',()=>{$('password-form').reset();openDialog('password-dialog');});
action('password-form','submit',async e=>{await request('password',Object.fromEntries(new FormData(e.target)));clearSession();$('login-error').textContent='เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่';});
action('scan-search','click',()=>startScanner(code=>{$('search').value=code;renderProducts();}));
action('scan-line','click',()=>startScanner(addLine));
action('export-stock','click',()=>{
  const headings=['รหัสสินค้า','ชื่อสินค้า','หมวดหมู่','หน่วย','คงเหลือ','จุดแจ้งเตือน','สถานะ'];
  if(admin())headings.push('ต้นทุนเฉลี่ย','มูลค่าสต็อก');
  const rows=filteredProducts().map(p=>{const row=[p.productId,p.name,p.category,p.unit,p.stock,p.minAlert,p.active?'ใช้งาน':'ปิดใช้งาน'];if(admin())row.push(p.cost,p.cost*p.stock);return row;});
  download('stock-'+bangkokDay()+'.csv',csv([headings,...rows]));
});
action('export-history','click',async()=>{
  const headings=['วันเวลา','เลขรายการ','สินค้า','รหัส','ประเภท','จำนวน','ก่อน','หลัง','ผู้ดำเนินการ','ปลายทาง','เหตุผล'];
  if(admin())headings.push('ต้นทุนต่อหน่วย','ต้นทุนรวม');
  let offset=0,rows=[],batch;
  historyAsOf=new Date().toISOString();
  do{batch=await request('history',historyParams(offset));rows.push(...batch);offset+=200;}while(batch.length===200);
  download('stock-movements-'+bangkokDay()+'.csv',csv([headings,...rows.map(t=>{
    const row=[thaiDate(t.timestamp),t.id,t.name,t.productId,labels[t.type],t.quantity,t.before,t.after,t.operator,t.recipient,t.reason];
    if(admin())row.push(t.cost,t.totalCost);return row;
  })]));
});
function connection(){$('connection').textContent=navigator.onLine?'ออนไลน์':'ออฟไลน์ · รอส่ง';$('connection').className='badge'+(navigator.onLine?'':' warn');}
window.addEventListener('offline',connection);
window.addEventListener('online',()=>{connection();if(session)sync().catch(e=>notice(e.message,true));});
window.addEventListener('beforeunload',e=>{if(lines.length){e.preventDefault();e.returnValue='';}});
$('history-to').value=bangkokDay();$('history-from').value=bangkokDay().slice(0,7)+'-01';
connection();
// Retire old cached credentials/data; preserve the old unsent queue for manual reconciliation.
['stock_auth_user','stock_local_users','stock_local_products','stock_local_transactions','stock_sheets_api_url'].forEach(k=>localStorage.removeItem(k));
if(localStorage.getItem('stock_offline_sync_queue') && localStorage.getItem('stock_offline_sync_queue')!=='[]'){
  $('login-error').textContent='พบรายการรอส่งจากระบบเดิม กรุณาให้ผู้ดูแลตรวจและกระทบยอดก่อนทำรายการใหม่';
}
try{session=JSON.parse(sessionStorage.getItem(config.sessionKey));if(session){await enter();}}catch(e){clearSession();$('login-error').textContent=e.message;}
// Replace the legacy worker so old pages cannot remain cached after cutover.
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});

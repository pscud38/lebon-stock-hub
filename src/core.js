export function quantity(value, allowZero = false) {
  if (value === '' || value == null) throw new Error('กรุณาระบุจำนวน');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > 100000000 || Math.abs(Math.round(n * 1000) - n * 1000) > 0.00001) {
    throw new Error('จำนวนต้องถูกต้องและมีทศนิยมไม่เกิน 3 ตำแหน่ง');
  }
  return n;
}

export function documentPayload(type, lines, details = {}) {
  if (!['IN', 'OUT', 'COUNT'].includes(type)) throw new Error('ประเภทรายการไม่ถูกต้อง');
  if (!lines.length || lines.length > 100) throw new Error('กรุณาระบุสินค้า 1–100 รายการ');
  if (!details.reason?.trim()) throw new Error('กรุณาระบุเหตุผลหรือเอกสารอ้างอิง');
  const seen = new Set();
  const items = lines.map(line => {
    const id = String(line.productId || '').trim();
    if (!id || seen.has(id)) throw new Error('รหัสสินค้าว่างหรือซ้ำในเอกสาร');
    seen.add(id);
    const item = { productId: id, quantity: quantity(line.quantity, type === 'COUNT') };
    if (type === 'COUNT') item.expectedStock = quantity(line.expectedStock, true);
    if (type === 'IN' && line.cost !== '' && line.cost != null) item.cost = quantity(line.cost, true);
    return item;
  });
  return { type, items, reason: details.reason.trim(), recipient: (details.recipient || '').trim(), image: details.image || '' };
}

export function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}

export function thaiDate(value) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

export function bangkokDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

export function createRPC({ url, key }, getToken, transport = fetch) {
  return async (name, args = {}, authenticated = true) => {
    let response;
    try {
      response = await transport(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(authenticated ? { ...args, p_token: getToken() } : args),
        signal: AbortSignal.timeout(20000),
      });
    } catch { throw new ApiError('เชื่อมต่อไม่ได้ รายการยังไม่ยืนยัน กรุณาลองซิงค์อีกครั้ง'); }
    let data;
    try { data = await response.json(); } catch { throw new ApiError('ไม่สามารถอ่านผลยืนยันจากฐานข้อมูล', response.status); }
    if (!response.ok) throw new ApiError(data.message || 'บันทึกไม่สำเร็จ', response.status);
    return data;
  };
}

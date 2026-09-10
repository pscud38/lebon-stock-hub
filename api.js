/**
 * API Service for communicating with Supabase PostgreSQL (Primary ~150ms)
 * with Google Apps Script Web App and Local Storage Offline Fallbacks.
 */

if (typeof globalThis.CONFIG === 'undefined' && typeof require !== 'undefined') {
  try {
    const _cfg = require('./config.js');
    globalThis.CONFIG = _cfg.CONFIG;
    if (typeof globalThis.getApiUrl === 'undefined') {
      globalThis.getApiUrl = _cfg.getApiUrl;
    }
    if (typeof globalThis.getSupabaseConfig === 'undefined') {
      globalThis.getSupabaseConfig = _cfg.getSupabaseConfig;
    }
    if (typeof globalThis.isSupabaseConfigured === 'undefined') {
      globalThis.isSupabaseConfigured = _cfg.isSupabaseConfigured;
    }
  } catch (e) {
    // Non-fatal: running in browser or bundler environment without Node.js filesystem require
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('CJS environment bootstrap skipped in browser mode:', e?.message);
    }
  }
}

/**
 * คำนวณต้นทุนเฉลี่ยถ่วงน้ำหนัก (Weighted Average Cost: WAC)
 * Formula: ((currentStock * oldCost) + (inQty * inCost)) / (currentStock + inQty)
 */
function calculateWAC(currentStock, currentCost, inQty, inCost) {
  const sOld = Math.max(0, Number(currentStock) || 0);
  const cOld = Number(currentCost) || 0;
  const qIn = Math.max(0, Number(inQty) || 0);
  const cIn = (inCost !== undefined && inCost !== null && inCost !== '') ? Math.max(0, Number(inCost)) : 0;

  if (qIn <= 0) return cOld;
  if (sOld <= 0) return Number(cIn.toFixed(2));

  const newWac = ((sOld * cOld) + (qIn * cIn)) / (sOld + qIn);
  return Number(newWac.toFixed(2));
}

/**
 * ตัดข้อมูลต้นทุนและกำไรออกสำหรับผู้ใช้ระดับ Staff (หรือ non-admin)
 */
function redactDataForRole(data, role) {
  if (!data) return data;
  const isAdmin = (role && String(role).toLowerCase().trim() === 'admin');
  if (isAdmin) return data;

  const cloned = JSON.parse(JSON.stringify(data));

  if (cloned.products && Array.isArray(cloned.products)) {
    cloned.products.forEach(p => {
      delete p.costPrice;
      delete p.profitPerUnit;
      delete p.marginPercent;
    });
  }

  if (cloned.transactions && Array.isArray(cloned.transactions)) {
    cloned.transactions.forEach(t => {
      delete t.costPrice;
      delete t.totalCost;
      delete t.profit;
    });
  }

  if (cloned.summary) {
    delete cloned.summary.totalStockValue;
    delete cloned.summary.todayCost;
    delete cloned.summary.todayProfit;
    delete cloned.summary.todayMargin;
    delete cloned.summary.totalCost;
    delete cloned.summary.totalProfit;
    delete cloned.summary.overallMargin;
  }

  return cloned;
}

/**
 * ดึง Role ของผู้ใช้ปัจจุบัน
 */
function getCurrentUserRole() {
  try {
    if (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser) {
      const user = AuthManager.getCurrentUser();
      if (user && user.role) return String(user.role).toLowerCase().trim();
    }
  } catch (e) {
    console.warn('Failed to resolve current user role, defaulting to staff:', e);
  }
  return 'staff'; // Fail-closed default (least privilege principle)
}

// ---------------------------------------------------------------------------
// Supabase REST Helper Functions & Mappers
// ---------------------------------------------------------------------------

function getSupabaseHeaders(extraHeaders = {}) {
  const { key } = getSupabaseConfig();
  return {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
}

function parseMinAlert(val) {
  if (val === null || val === undefined || val === '') return 5;
  const n = Number(val);
  return isNaN(n) ? 5 : n;
}

function isProductLowStock(p) {
  if (!p) return false;
  if (p.minAlert === -1 || p.minAlert === '-1' || p.isAlertEnabled === false) return false;
  const threshold = parseMinAlert(p.minAlert);
  if (threshold < 0) return false;
  return (Number(p.currentStock) || 0) <= threshold;
}

function mapProductFromDb(row) {
  if (!row) return null;
  return {
    productId: row.product_id,
    productName: row.product_name,
    category: row.category || 'ทั่วไป',
    unit: row.unit || 'ชิ้น',
    costPrice: Number(row.cost_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    profitPerUnit: Number(row.profit_per_unit) || 0,
    marginPercent: Number(row.margin_percent) || 0,
    currentStock: Number(row.current_stock) || 0,
    minAlert: parseMinAlert(row.min_alert),
    lastUpdated: row.last_updated || new Date().toISOString(),
    imageUrl: row.image_url || '',
    note: row.note || ''
  };
}

function mapTransactionFromDb(row) {
  if (!row) return null;
  return {
    transId: row.trans_id,
    timestamp: row.timestamp,
    productId: row.product_id,
    productName: row.product_name,
    type: row.type,
    quantity: Number(row.quantity) || 0,
    costPrice: Number(row.cost_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    totalCost: Number(row.total_cost) || 0,
    totalRevenue: Number(row.total_revenue) || 0,
    profit: Number(row.profit) || 0,
    operator: row.operator || '',
    note: row.note || '',
    imageUrl: row.image_url || ''
  };
}

function mapUserFromDb(row) {
  if (!row) return null;
  return {
    username: row.username,
    fullName: row.full_name || row.username,
    role: row.role || 'staff',
    status: row.status || 'active',
    createdAt: row.created_at || ''
  };
}

const ApiService = {
  /**
   * ดึงข้อมูลทั้งหมดสำหรับแดชบอร์ด (Supabase ~150ms -> Google Sheets -> LocalStorage)
   */
  async getDashboardData() {
    const role = getCurrentUserRole();

    // 1. Supabase Fast Path (~100-180ms)
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        const [prodRes, transRes, catRes, userRes] = await Promise.all([
          fetch(`${url}/rest/v1/products?select=*&order=product_id.asc`, { headers, cache: 'no-store' }),
          fetch(`${url}/rest/v1/transactions?select=*&order=timestamp.desc&limit=150`, { headers, cache: 'no-store' }),
          fetch(`${url}/rest/v1/categories?select=*&order=name.asc`, { headers, cache: 'no-store' }),
          fetch(`${url}/rest/v1/safe_users?select=*&order=username.asc`, { headers, cache: 'no-store' })
            .then(r => r.ok ? r : fetch(`${url}/rest/v1/users?select=username,full_name,role,status,created_at&order=username.asc`, { headers, cache: 'no-store' }))
        ]);

        if (prodRes.ok && transRes.ok) {
          const prodData = await prodRes.json();
          const transData = await transRes.json();
          const catData = catRes.ok ? await catRes.json() : [];
          const userData = userRes.ok ? await userRes.json() : [];

          const products = prodData.map(mapProductFromDb);
          const transactions = transData.map(mapTransactionFromDb);
          const categories = catData.length > 0 ? catData.map(c => c.name) : CONFIG.DEFAULT_CATEGORIES;
          const users = userData.length > 0 ? userData.map(mapUserFromDb) : [
            { username: 'admin', fullName: 'ผู้ดูแลระบบ (Admin)', role: 'admin', status: 'active' },
            { username: 'staff', fullName: 'พนักงานหน้าร้าน (Staff)', role: 'staff', status: 'active' }
          ];

          // Save to LocalStorage cache
          if (role === 'admin') {
            if (products.length > 0) localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
            if (transactions.length > 0) localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
            if (categories.length > 0) localStorage.setItem(CONFIG.STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
            if (users.length > 0) localStorage.setItem('stock_local_users', JSON.stringify(users));
          }

          const summary = this.calculateSummaryMetrics(products, transactions);
          const fullData = {
            success: true,
            products: products,
            transactions: transactions,
            categories: categories,
            users: users,
            summary: summary
          };

          return redactDataForRole(fullData, role);
        }
      } catch (sbErr) {
        console.warn('Supabase fetch failed, falling back to Google Sheets / Local:', sbErr);
      }
    }

    // 2. Google Apps Script Fallback
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(`${apiUrl}?action=getDashboardData&role=${encodeURIComponent(role)}`);
        const json = await response.json();
        if (json.success) {
          if (role === 'admin') {
            if (json.products) localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(json.products));
            if (json.transactions) localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(json.transactions));
            if (json.categories) localStorage.setItem(CONFIG.STORAGE_KEYS.CATEGORIES, JSON.stringify(json.categories));
            if (json.users) localStorage.setItem('stock_local_users', JSON.stringify(json.users));
          }
          return redactDataForRole(json, role);
        }
      } catch (err) {
        console.warn('Google Sheets API fetch failed, falling back to local cache:', err);
      }
    }

    // 3. Local Storage Fallback (Offline)
    return this.getLocalDashboardData(role);
  },

  async getProducts() {
    const data = await this.getDashboardData();
    return data.products || [];
  },

  async getTransactions(limit = 100) {
    const data = await this.getDashboardData();
    return (data.transactions || []).slice(0, limit);
  },

  async getCategories() {
    const data = await this.getDashboardData();
    return data.categories || CONFIG.DEFAULT_CATEGORIES;
  },

  async getUsers() {
    const data = await this.getDashboardData();
    return data.users || [
      { username: 'admin', fullName: 'ผู้ดูแลระบบ (Admin)', role: 'admin', status: 'active' },
      { username: 'staff', fullName: 'พนักงานหน้าร้าน (Staff)', role: 'staff', status: 'active' }
    ];
  },

  OFFLINE_QUEUE_KEY: 'stock_offline_sync_queue',

  getPendingQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.OFFLINE_QUEUE_KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  getPendingQueueCount() {
    return this.getPendingQueue().length;
  },

  queueOfflineAction(actionType, payload) {
    const queue = this.getPendingQueue();
    queue.push({
      id: 'QUEUE-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      action: actionType,
      payload: payload,
      queuedAt: new Date().toISOString()
    });
    localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  async syncOfflineQueue() {
    const queue = this.getPendingQueue();
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    let successCount = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        if (item.action === 'addTransaction') {
          await this.addTransaction(item.payload);
          successCount++;
        } else if (item.action === 'batchTransaction') {
          await this.batchAddTransactions(item.payload);
          successCount++;
        } else {
          remaining.push(item);
        }
      } catch (err) {
        remaining.push(item);
      }
    }

    localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return { synced: successCount, remaining: remaining.length };
  },

  /**
   * ดึงข้อมูลแคชทันที 0ms (Stale Cache)
   */
  getCachedDashboardData() {
    const role = getCurrentUserRole();
    return this.getLocalDashboardData(role);
  },

  /**
   * บันทึก Transaction รับเข้า / เบิกจ่าย / ปรับยอด (Supabase Fast Path ~100ms)
   */
  async addTransaction(transactionData) {
    const role = (transactionData && transactionData.role) ? transactionData.role : getCurrentUserRole();

    // กรณีออฟไลน์ บันทึกคิวออฟไลน์ทันที
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.queueOfflineAction('addTransaction', { role, ...transactionData });
      const localResult = this.addLocalTransaction({ role, ...transactionData });
      localResult.isOfflineQueued = true;
      localResult.message = '📶 บันทึกออฟไลน์แล้ว (จะซิงค์ขึ้นระบบเมื่อต่อเน็ต)';
      return localResult;
    }

    // 1. Supabase Transaction Path
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        const productId = String(transactionData.productId).trim();
        const type = String(transactionData.type).toUpperCase();
        const qty = Number(transactionData.quantity);

        if (!productId) throw new Error('กรุณาระบุรหัสสินค้า');
        if (type === 'ADJUST') {
          if (isNaN(qty) || qty < 0) {
            throw new Error('จำนวนสต็อกที่ปรับต้องไม่ติดลบ (ต้องเป็น 0 หรือมากกว่า)');
          }
        } else {
          if (isNaN(qty) || qty <= 0) {
            throw new Error('จำนวนต้องมากกว่า 0');
          }
        }

        const isSalePriceProvided = (transactionData.salePrice !== undefined && transactionData.salePrice !== null && transactionData.salePrice !== '' && !isNaN(Number(transactionData.salePrice)) && Number(transactionData.salePrice) >= 0);
        const inCostParam = (transactionData.costPrice !== undefined && transactionData.costPrice !== null && transactionData.costPrice !== '') ? Math.max(0, Number(transactionData.costPrice)) : null;
        const effectivePrice = isSalePriceProvided ? Number(transactionData.salePrice) : (type === 'IN' ? inCostParam : null);
        const imageUrl = transactionData.imageUrl || transactionData.imageBase64 || '';

        // 1. เรียกใช้ Stored Procedure: execute_stock_transaction (Atomic 100% พร้อม Row-level Lock)
        try {
          const rpcRes = await fetch(`${url}/rest/v1/rpc/execute_stock_transaction`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              p_product_id: productId,
              p_type: type,
              p_quantity: qty,
              p_price: effectivePrice,
              p_operator: transactionData.operator || 'Staff',
              p_note: transactionData.note || '',
              p_image_url: imageUrl
            })
          });

          if (rpcRes.ok) {
            const rpcJson = await rpcRes.json();
            if (rpcJson && rpcJson.success) {
              const newStock = Number(rpcJson.newStock);
              const transId = rpcJson.transId;
              const profit = Number(rpcJson.profit) || 0;

              // อัปเดต LocalStorage แคชคู่ขนาน
              this.addLocalTransaction({ role, ...transactionData, transId, newStock });

              const roleClean = (role || '').toLowerCase().trim();
              const isExplicitStaff = (roleClean === 'staff' || (roleClean && roleClean !== 'admin'));

              const result = {
                success: true,
                message: `บันทึกรายการ ${type} สำเร็จ! สต็อกคงเหลือ: ${newStock}`,
                transId: transId,
                newStock: newStock,
                imageUrl: imageUrl
              };

              if (!isExplicitStaff) {
                result.profit = profit;
                result.newCost = Number(rpcJson.newCost) || 0;
              }

              return result;
            }
          } else {
            const errTxt = await rpcRes.text();
            if (errTxt.includes('สต็อกไม่พอ') || errTxt.includes('ไม่พบสินค้า') || errTxt.includes('P0001')) {
              let cleanMsg = errTxt;
              try {
                const parsed = JSON.parse(errTxt);
                if (parsed.message) cleanMsg = parsed.message;
              } catch (_) {}
              throw new Error(cleanMsg);
            }
            console.warn('RPC execute_stock_transaction unavailable, proceeding to direct query fallback:', errTxt);
          }
        } catch (rpcErr) {
          if (rpcErr.message && (rpcErr.message.includes('สต็อกไม่พอ') || rpcErr.message.includes('ไม่พบสินค้า'))) {
            throw rpcErr;
          }
          console.warn('RPC execution exception, falling back to direct query:', rpcErr);
        }

        // 2. Direct Query Fallback (กรณีฐานข้อมูลยังไม่ได้ลง Patch RPC)
        const prodRes = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}&select=*`, { headers });
        if (!prodRes.ok) throw new Error('ไม่สามารถดึงข้อมูลสินค้าจากฐานข้อมูลได้');
        const prods = await prodRes.json();
        if (!prods || prods.length === 0) throw new Error('ไม่พบสินค้ารหัส: ' + productId);

        const dbProduct = prods[0];
        let newStock = Number(dbProduct.current_stock) || 0;
        const oldCost = Number(dbProduct.cost_price) || 0;
        const dbSalePrice = Number(dbProduct.sale_price) || 0;
        const salePrice = isSalePriceProvided ? Number(transactionData.salePrice) : dbSalePrice;

        let costPrice = oldCost;
        let totalCost = 0;
        let totalRevenue = 0;
        let profit = 0;
        let newWac = oldCost;

        if (type === 'IN') {
          const inCost = (transactionData.costPrice !== undefined && transactionData.costPrice !== null && transactionData.costPrice !== '') ? Math.max(0, Number(transactionData.costPrice)) : oldCost;
          const actualInCost = inCost;
          newWac = calculateWAC(newStock, oldCost, qty, inCost);

          newStock += qty;
          costPrice = actualInCost;
          totalCost = qty * actualInCost;
          totalRevenue = 0;
          profit = 0;
        } else if (type === 'OUT') {
          if (newStock < qty) {
            throw new Error(`สต็อกคงเหลือไม่พอ! มีอยู่ ${newStock} ${dbProduct.unit || 'ชิ้น'} แต่ต้องการเบิก ${qty}`);
          }
          newStock -= qty;
          costPrice = oldCost;
          totalCost = qty * costPrice;
          totalRevenue = qty * salePrice;
          profit = totalRevenue - totalCost;
        } else if (type === 'ADJUST') {
          newStock = qty;
          costPrice = oldCost;
          totalCost = 0;
          totalRevenue = 0;
          profit = 0;
        } else {
          throw new Error('ประเภทรายการไม่ถูกต้อง (ต้องเป็น IN, OUT, หรือ ADJUST)');
        }

        const rand4 = Math.floor(1000 + Math.random() * 9000);
        const transId = 'TRX-' + Date.now() + '-' + rand4;
        const nowIso = new Date().toISOString();

        const profitPerUnit = Number((dbSalePrice - newWac).toFixed(2));
        const marginPercent = dbSalePrice > 0 ? Number(((profitPerUnit / dbSalePrice) * 100).toFixed(2)) : 0;

        // อัปเดตสินค้า (Stock, WAC, Profit)
        const updateProductPayload = {
          current_stock: newStock,
          cost_price: newWac,
          profit_per_unit: profitPerUnit,
          margin_percent: marginPercent,
          last_updated: nowIso
        };

        const patchPromise = fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}`, {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify(updateProductPayload)
        });

        // เพิ่มบันทึก Transactions
        const insertTransPayload = {
          trans_id: transId,
          timestamp: nowIso,
          product_id: dbProduct.product_id,
          product_name: dbProduct.product_name,
          type: type,
          quantity: qty,
          cost_price: costPrice,
          sale_price: salePrice,
          total_cost: totalCost,
          total_revenue: totalRevenue,
          profit: profit,
          operator: transactionData.operator || 'Staff',
          note: transactionData.note || '',
          image_url: imageUrl
        };

        const transPromise = fetch(`${url}/rest/v1/transactions`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(insertTransPayload)
        });

        const [patchRes, insRes] = await Promise.all([patchPromise, transPromise]);
        if (!patchRes.ok) {
          const pErr = await patchRes.text();
          throw new Error('Failed to update product: ' + pErr);
        }
        if (!insRes.ok) {
          const iErr = await insRes.text();
          throw new Error('Failed to insert transaction: ' + iErr);
        }

        // อัปเดต LocalStorage แคชคู่ขนาน
        this.addLocalTransaction({ role, ...transactionData });

        const roleClean = (role || '').toLowerCase().trim();
        const isExplicitStaff = (roleClean === 'staff' || (roleClean && roleClean !== 'admin'));

        const result = {
          success: true,
          message: `บันทึกรายการ ${type} สำเร็จ! สต็อกคงเหลือ: ${newStock}`,
          transId: transId,
          newStock: newStock,
          imageUrl: imageUrl
        };

        if (!isExplicitStaff) {
          result.profit = profit;
          result.totalCost = totalCost;
          result.costPrice = costPrice;
        }

        return result;
      } catch (sbErr) {
        if (sbErr.message && (sbErr.message.includes('fetch') || sbErr.message.includes('Network') || (typeof navigator !== 'undefined' && !navigator.onLine))) {
          this.queueOfflineAction('addTransaction', { role, ...transactionData });
          const localResult = this.addLocalTransaction({ role, ...transactionData });
          localResult.isOfflineQueued = true;
          localResult.message = '📶 บันทึกออฟไลน์แล้ว (เน็ตขัดข้อง - จะซิงค์เมื่อต่อเน็ต)';
          return localResult;
        }
        console.error('Supabase addTransaction failed:', sbErr);
        throw sbErr;
      }
    }

    // 2. Google Apps Script Fallback
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'addTransaction',
            role,
            ...transactionData
          })
        });
        const json = await response.json();
        if (json.success) {
          return json;
        } else {
          throw new Error(json.error || 'Failed to save transaction');
        }
      } catch (err) {
        if (err.message && (err.message.includes('fetch') || err.message.includes('Network') || (typeof navigator !== 'undefined' && !navigator.onLine))) {
          this.queueOfflineAction('addTransaction', { role, ...transactionData });
          const localResult = this.addLocalTransaction({ role, ...transactionData });
          localResult.isOfflineQueued = true;
          localResult.message = '📶 บันทึกออฟไลน์แล้ว (เน็ตขัดข้อง - จะซิงค์เมื่อต่อเน็ต)';
          return localResult;
        }
        console.error('API save failed:', err);
        throw err;
      }
    }

    return this.addLocalTransaction({ role, ...transactionData });
  },

  /**
   * บันทึก Transaction รับเข้าล็อตใหญ่ (Batch In)
   */
  async batchAddTransactions(batchData) {
    const role = (batchData && batchData.role) ? batchData.role : getCurrentUserRole();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.queueOfflineAction('batchTransaction', { role, ...batchData });
      const localResult = this.batchAddLocalTransactions({ role, ...batchData });
      localResult.isOfflineQueued = true;
      localResult.message = '📶 บันทึกออฟไลน์แล้ว (จะซิงค์ขึ้นระบบเมื่อต่อเน็ต)';
      return localResult;
    }

    // 1. Supabase Fast Batch Path
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        const items = batchData.items || [];
        const operator = batchData.operator || 'Staff';
        const batchNote = batchData.note || 'รับเข้าล็อตใหญ่ (Batch In)';
        const now = new Date();
        const nowIso = now.toISOString();
        const batchId = 'BATCH-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
        const imageUrl = batchData.imageUrl || batchData.imageBase64 || '';

        const prodRes = await fetch(`${url}/rest/v1/products?select=*`, { headers });
        if (!prodRes.ok) throw new Error('ไม่สามารถดึงข้อมูลสินค้าได้');
        const allProds = await prodRes.json();
        const prodMap = new Map();
        allProds.forEach(p => prodMap.set(String(p.product_id).toLowerCase(), p));

        const transInserts = [];
        const productUpdates = [];

        // Pre-validation: ตรวจสอบความถูกต้องของทุกรายการในบิลก่อนลงมือทำรายการจริง (Strict Validation)
        const missingProducts = [];
        const invalidQuantities = [];
        const insufficientStock = [];

        items.forEach((item, idx) => {
          const pId = String(item.productId || '').trim().toLowerCase();
          const dbProduct = prodMap.get(pId);
          const qty = Number(item.quantity) || 0;
          const lineNum = idx + 1;

          if (!dbProduct) {
            missingProducts.push(`รายการที่ ${lineNum} (รหัส: ${item.productId || 'ไม่ระบุ'})`);
          } else if (qty <= 0) {
            invalidQuantities.push(`รายการที่ ${lineNum} (${dbProduct.product_name})`);
          } else if (String(item.type || 'IN').toUpperCase() === 'OUT') {
            const curStock = Number(dbProduct.current_stock) || 0;
            if (curStock < qty) {
              insufficientStock.push(`${dbProduct.product_name} (คงเหลือ ${curStock} ${dbProduct.unit || 'ชิ้น'}, ต้องการตัด ${qty})`);
            }
          }
        });

        if (missingProducts.length > 0) {
          throw new Error('ไม่สามารถบันทึกบิลได้: ไม่พบสินค้าในระบบ: ' + missingProducts.join(', '));
        }
        if (invalidQuantities.length > 0) {
          throw new Error('จำนวนสินค้าต้องมากกว่า 0: ' + invalidQuantities.join(', '));
        }
        if (insufficientStock.length > 0) {
          throw new Error('สต็อกไม่เพียงพอสำหรับการเบิกขาย: ' + insufficientStock.join(', '));
        }

        items.forEach((item, idx) => {
          const pId = String(item.productId || '').trim().toLowerCase();
          const dbProduct = prodMap.get(pId);
          const qty = Number(item.quantity) || 0;

          const type = String(item.type || 'IN').toUpperCase();
          const oldCost = Number(dbProduct.cost_price) || 0;
          const inCost = (item.costPrice !== undefined && item.costPrice !== null && item.costPrice !== '') ? Math.max(0, Number(item.costPrice)) : oldCost;
          const itemSalePrice = (item.salePrice !== undefined && item.salePrice !== null && item.salePrice !== '') ? Number(item.salePrice) : (Number(dbProduct.sale_price) || 0);
          const transId = `${batchId}-${idx + 1}`;

          let newStock = Number(dbProduct.current_stock) || 0;
          let costPrice = oldCost;
          let totalCost = 0;
          let totalRevenue = 0;
          let profit = 0;
          let newWac = oldCost;

          if (type === 'IN') {
            newWac = calculateWAC(newStock, oldCost, qty, inCost);
            newStock += qty;
            costPrice = inCost;
            totalCost = qty * inCost;
          } else if (type === 'OUT') {
            if (newStock < qty) {
              throw new Error(`สต็อกสินค้า "${dbProduct.product_name}" ไม่พอตัด (คงเหลือ ${newStock}, ต้องการตัด ${qty})`);
            }
            newStock -= qty;
            totalCost = qty * oldCost;
            totalRevenue = qty * itemSalePrice;
            profit = totalRevenue - totalCost;
          }

          const profitPerUnit = Number((itemSalePrice - newWac).toFixed(2));
          const marginPercent = itemSalePrice > 0 ? Number(((profitPerUnit / itemSalePrice) * 100).toFixed(2)) : 0;

          dbProduct.current_stock = newStock;
          dbProduct.cost_price = newWac;
          dbProduct.profit_per_unit = profitPerUnit;
          dbProduct.margin_percent = marginPercent;
          dbProduct.last_updated = nowIso;

          productUpdates.push(
            fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(dbProduct.product_id)}`, {
              method: 'PATCH',
              headers: headers,
              body: JSON.stringify({
                current_stock: newStock,
                cost_price: newWac,
                profit_per_unit: profitPerUnit,
                margin_percent: marginPercent,
                last_updated: nowIso
              })
            })
          );

          transInserts.push({
            trans_id: transId,
            timestamp: nowIso,
            product_id: dbProduct.product_id,
            product_name: dbProduct.product_name,
            type: type,
            quantity: qty,
            cost_price: costPrice,
            sale_price: itemSalePrice,
            total_cost: totalCost,
            total_revenue: totalRevenue,
            profit: profit,
            operator: operator,
            note: item.note ? `${batchNote} (${item.note})` : batchNote,
            image_url: imageUrl
          });
        });

        if (transInserts.length > 0) {
          const transBatchPromise = fetch(`${url}/rest/v1/transactions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(transInserts)
          });

          await Promise.all([...productUpdates, transBatchPromise]);
        }

        this.batchAddLocalTransactions({ role, ...batchData });

        return {
          success: true,
          message: `บันทึกรายการล็อตใหญ่สำเร็จ ${transInserts.length} รายการ!`,
          batchId: batchId,
          itemCount: transInserts.length,
          imageUrl: imageUrl
        };
      } catch (sbErr) {
        if (sbErr.message && (sbErr.message.includes('fetch') || sbErr.message.includes('Network') || (typeof navigator !== 'undefined' && !navigator.onLine))) {
          this.queueOfflineAction('batchTransaction', { role, ...batchData });
          const localResult = this.batchAddLocalTransactions({ role, ...batchData });
          localResult.isOfflineQueued = true;
          localResult.message = '📶 บันทึกออฟไลน์แล้ว (เน็ตขัดข้อง - จะซิงค์เมื่อต่อเน็ต)';
          return localResult;
        }
        console.error('Batch Supabase save failed:', sbErr);
        throw sbErr;
      }
    }

    // 2. Google Apps Script Fallback
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'batchTransaction',
            role,
            ...batchData
          })
        });
        const json = await response.json();
        if (json.success) {
          return json;
        } else {
          throw new Error(json.error || 'Failed to save batch transaction');
        }
      } catch (err) {
        if (err.message && (err.message.includes('fetch') || err.message.includes('Network') || (typeof navigator !== 'undefined' && !navigator.onLine))) {
          this.queueOfflineAction('batchTransaction', { role, ...batchData });
          const localResult = this.batchAddLocalTransactions({ role, ...batchData });
          localResult.isOfflineQueued = true;
          localResult.message = '📶 บันทึกออฟไลน์แล้ว (เน็ตขัดข้อง - จะซิงค์เมื่อต่อเน็ต)';
          return localResult;
        }
        console.error('Batch API save failed:', err);
        throw err;
      }
    }

    return this.batchAddLocalTransactions({ role, ...batchData });
  },

  /**
   * บันทึกเพิ่ม/แก้ไขสินค้า
   */
  async saveProduct(productData) {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders({
          'Prefer': 'resolution=merge-duplicates'
        });

        const productId = String(productData.productId).trim();
        const cost = Number(productData.costPrice) || 0;
        const sale = Number(productData.salePrice) || 0;
        const profit = Number((sale - cost).toFixed(2));
        const margin = sale > 0 ? Number(((profit / sale) * 100).toFixed(2)) : 0;
        const category = productData.category || 'ทั่วไป';

        const payload = {
          product_id: productId,
          product_name: productData.productName,
          category: category,
          unit: productData.unit || 'ชิ้น',
          cost_price: cost,
          sale_price: sale,
          profit_per_unit: profit,
          margin_percent: margin,
          min_alert: parseMinAlert(productData.minAlert),
          last_updated: new Date().toISOString()
        };

        if (productData.note) {
          payload.note = productData.note;
        }

        if (productData.updateStock || productData.initialStock !== undefined) {
          payload.current_stock = Number(productData.initialStock) || 0;
        }

        let res = await fetch(`${url}/rest/v1/products`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errTxt = await res.text();
          // ถ้าตาราง products ยังไม่มีคอลัมน์ note ให้ตัดออกแล้วลองใหม่ ป้องกัน Error 42703
          if (errTxt.includes('note') && (errTxt.includes('does not exist') || errTxt.includes('42703'))) {
            delete payload.note;
            res = await fetch(`${url}/rest/v1/products`, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload)
            });
          }
          if (!res.ok) {
            throw new Error('Supabase saveProduct failed: ' + (await res.text()));
          }
        }

        // หากเป็นสินค้าใหม่ และมีสต็อกเริ่มต้น > 0 ให้บันทึก Transaction รับเข้ารองรับการ Audit ย้อนหลัง
        if (!productData.isEdit && Number(productData.initialStock) > 0) {
          try {
            const initQty = Number(productData.initialStock);
            const initTransPayload = {
              trans_id: 'TRX-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
              timestamp: new Date().toISOString(),
              product_id: productId,
              product_name: productData.productName,
              type: 'IN',
              quantity: initQty,
              cost_price: cost,
              sale_price: sale,
              total_cost: cost * initQty,
              total_revenue: 0,
              profit: 0,
              operator: (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser()?.fullName) || 'Admin',
              note: productData.note ? `[สต็อกเริ่มต้น] ${productData.note}` : 'เพิ่มสินค้าใหม่พร้อมสต็อกเริ่มต้น',
              image_url: ''
            };
            await fetch(`${url}/rest/v1/transactions`, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(initTransPayload)
            });
          } catch (initErr) {
            console.warn('Initial transaction recording error (non-fatal):', initErr);
          }
        }

        if (category) {
          this.addCategory(category).catch(() => {});
        }

        this.saveLocalProduct(productData);
        return { success: true, message: `บันทึกข้อมูลสินค้า ${productData.productName} สำเร็จ!` };
      } catch (sbErr) {
        console.error('Supabase saveProduct error:', sbErr);
        throw sbErr;
      }
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'saveProduct',
            ...productData
          })
        });
        const json = await response.json();
        if (json.success) return json;
        throw new Error(json.error || 'Failed to save product');
      } catch (err) {
        console.error('API save product failed:', err);
        throw err;
      }
    }

    return this.saveLocalProduct(productData);
  },

  /**
   * ลบสินค้า
   */
  async deleteProduct(productId) {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        const res = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}`, {
          method: 'DELETE',
          headers: headers
        });

        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error('Supabase deleteProduct failed: ' + errTxt);
        }

        this.deleteLocalProduct(productId);
        return { success: true, message: `ลบสินค้า ${productId} เรียบร้อยแล้ว` };
      } catch (sbErr) {
        console.error('Supabase deleteProduct error:', sbErr);
        throw sbErr;
      }
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'deleteProduct',
            productId: productId
          })
        });
        const json = await response.json();
        if (json.success) return json;
        throw new Error(json.error || 'Failed to delete product');
      } catch (err) {
        console.error('API delete product failed:', err);
        throw err;
      }
    }

    return this.deleteLocalProduct(productId);
  },

  /**
   * ลบรายการประวัติธุรกรรม (Audit Trail) พร้อมคืนค่าสต็อกสินค้า
   */
  async deleteTransaction(transId) {
    // 1. Supabase Path
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        // ดึงข้อมูล transaction เดิม เพื่อคำนวณคืนค่าสต็อก
        const tRes = await fetch(`${url}/rest/v1/transactions?trans_id=eq.${encodeURIComponent(transId)}&select=*`, { headers });
        if (!tRes.ok) throw new Error('ไม่สามารถดึงข้อมูลรายการเพื่อลบได้');
        const tList = await tRes.json();
        if (!tList || tList.length === 0) throw new Error('ไม่พบรายการรหัส: ' + transId);
        const oldTrans = tList[0];
        const productId = oldTrans.product_id;
        const type = (oldTrans.type || '').toUpperCase();
        const qty = Number(oldTrans.quantity) || 0;

        // ดึงข้อมูลสินค้าเพื่อปรับปรุงสต็อก
        const pRes = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}&select=*`, { headers });
        if (!pRes.ok) throw new Error('ไม่พบสินค้าที่เชื่อมโยงกับรายการนี้');
        const pList = await pRes.json();
        if (!pList || pList.length === 0) throw new Error('ไม่พบสินค้ารหัส: ' + productId);
        const product = pList[0];
        let currentStock = Number(product.current_stock) || 0;

        // คำนวณสต็อกหลังลบรายการ
        // OUT: คืนสินค้าเข้าสต็อก (+qty)
        // IN: หักสินค้าออกจากสต็อก (-qty)
        let newStock = currentStock;
        if (type === 'OUT') {
          newStock = currentStock + qty;
        } else if (type === 'IN') {
          if (currentStock - qty < 0) {
            throw new Error(`ไม่สามารถลบรายการรับเข้านี้ได้ เนื่องจากจะทำให้สต็อกติดลบ (คงเหลือปัจจุบัน: ${currentStock}, จะถูกลดลง: ${qty})`);
          }
          newStock = currentStock - qty;
        }

        // Step 1: ลบ Transaction
        const delRes = await fetch(`${url}/rest/v1/transactions?trans_id=eq.${encodeURIComponent(transId)}`, {
          method: 'DELETE',
          headers: headers
        });
        if (!delRes.ok) {
          throw new Error('Supabase deleteTransaction failed: ' + (await delRes.text()));
        }

        // Step 2: ปรับปรุงสต็อกสินค้า
        if (newStock !== currentStock) {
          const patchRes = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}`, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({
              current_stock: newStock,
              last_updated: new Date().toISOString()
            })
          });
          if (!patchRes.ok) {
            console.warn('Failed to update product stock after deleting transaction:', await patchRes.text());
          }
        }

        this.deleteLocalTransaction(transId, { productId, newStock });
        return {
          success: true,
          message: `ลบรายการ ${transId} เรียบร้อยแล้ว สต็อกสินค้าคงเหลือ: ${newStock}`,
          productId: productId,
          newStock: newStock
        };
      } catch (sbErr) {
        console.error('Supabase deleteTransaction error:', sbErr);
        throw sbErr;
      }
    }

    // 2. Google Apps Script Fallback
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'deleteTransaction',
            transId: transId
          })
        });
        const json = await response.json();
        if (json.success) {
          this.deleteLocalTransaction(transId, json);
          return json;
        }
        throw new Error(json.error || 'Failed to delete transaction');
      } catch (err) {
        console.error('API delete transaction failed:', err);
        throw err;
      }
    }

    // 3. LocalStorage Fallback
    return this.deleteLocalTransaction(transId);
  },

  /**
   * แก้ไขรายการประวัติธุรกรรม (Audit Trail) พร้อมปรับสต็อกและกำไรตามความแตกต่าง
   */
  async updateTransaction(transData) {
    const transId = String(transData.transId).trim();
    const newQty = Number(transData.quantity) || 0;
    const newType = String(transData.type).toUpperCase();
    const newTimestamp = transData.timestamp || new Date().toISOString();
    const operator = transData.operator || 'Admin';
    const note = transData.note || '';

    if (!transId) throw new Error('กรุณาระบุรหัสรายการ');
    if (newQty <= 0) throw new Error('จำนวนต้องมากกว่า 0');

    // 1. Supabase Path
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        // ดึง transaction เดิม
        const tRes = await fetch(`${url}/rest/v1/transactions?trans_id=eq.${encodeURIComponent(transId)}&select=*`, { headers });
        if (!tRes.ok) throw new Error('ไม่สามารถดึงข้อมูลรายการเดิมได้');
        const tList = await tRes.json();
        if (!tList || tList.length === 0) throw new Error('ไม่พบรายการรหัส: ' + transId);
        const oldTrans = tList[0];
        const productId = oldTrans.product_id;
        const oldType = (oldTrans.type || '').toUpperCase();
        const oldQty = Number(oldTrans.quantity) || 0;

        // ดึงข้อมูลสินค้า
        const pRes = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}&select=*`, { headers });
        if (!pRes.ok) throw new Error('ไม่พบสินค้าที่เชื่อมโยงกับรายการนี้');
        const pList = await pRes.json();
        if (!pList || pList.length === 0) throw new Error('ไม่พบสินค้ารหัส: ' + productId);
        const product = pList[0];
        let currentStock = Number(product.current_stock) || 0;
        const dbCostPrice = Number(product.cost_price) || 0;
        const dbSalePrice = Number(product.sale_price) || 0;

        // คำนวณการคืนสต็อกของรายการเดิม (Base Stock)
        let baseStock = currentStock;
        if (oldType === 'OUT') baseStock += oldQty;
        else if (oldType === 'IN') baseStock -= oldQty;

        // คำนวณผลกระทบของรายการใหม่
        let newStock = baseStock;
        if (newType === 'OUT') {
          if (baseStock < newQty) {
            throw new Error(`สต็อกคงเหลือไม่พอ! (ต้องการเบิก ${newQty} ชิ้น แต่มีอยู่ ${baseStock} ชิ้น)`);
          }
          newStock = baseStock - newQty;
        } else if (newType === 'IN') {
          newStock = baseStock + newQty;
          if (newStock < 0) {
            throw new Error(`การแก้ไขนี้ทำให้สต็อกติดลบ (${newStock} ชิ้น) ไม่สามารถบันทึกได้`);
          }
        } else if (newType === 'ADJUST') {
          newStock = newQty;
        }

        // คำนวณการเงิน
        const costPrice = (transData.costPrice !== undefined && transData.costPrice !== null && transData.costPrice !== '') 
          ? Number(transData.costPrice) 
          : (Number(oldTrans.cost_price) || dbCostPrice);
        const salePrice = (transData.salePrice !== undefined && transData.salePrice !== null && transData.salePrice !== '') 
          ? Number(transData.salePrice) 
          : (Number(oldTrans.sale_price) || dbSalePrice);

        let totalCost = 0;
        let totalRevenue = 0;
        let profit = 0;

        if (newType === 'OUT') {
          totalCost = Number((newQty * costPrice).toFixed(2));
          totalRevenue = Number((newQty * salePrice).toFixed(2));
          profit = Number((totalRevenue - totalCost).toFixed(2));
        } else if (newType === 'IN') {
          totalCost = Number((newQty * costPrice).toFixed(2));
          totalRevenue = 0;
          profit = 0;
        }

        // PATCH transactions
        const updateTransPayload = {
          type: newType,
          quantity: newQty,
          cost_price: costPrice,
          sale_price: salePrice,
          total_cost: totalCost,
          total_revenue: totalRevenue,
          profit: profit,
          operator: operator,
          note: note,
          timestamp: newTimestamp
        };

        const patchTransRes = await fetch(`${url}/rest/v1/transactions?trans_id=eq.${encodeURIComponent(transId)}`, {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify(updateTransPayload)
        });

        if (!patchTransRes.ok) {
          throw new Error('Supabase updateTransaction failed: ' + (await patchTransRes.text()));
        }

        // PATCH products stock
        if (newStock !== currentStock) {
          const patchProdRes = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}`, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({
              current_stock: newStock,
              last_updated: new Date().toISOString()
            })
          });
          if (!patchProdRes.ok) {
            console.warn('Failed to update product stock after updating transaction:', await patchProdRes.text());
          }
        }

        const updatedTx = {
          transId,
          productId,
          productName: product.product_name,
          ...updateTransPayload,
          imageUrl: oldTrans.image_url || ''
        };

        this.updateLocalTransaction(updatedTx, { productId, newStock });

        return {
          success: true,
          message: `แก้ไขรายการ ${transId} สำเร็จ! สต็อกคงเหลือ: ${newStock}`,
          transaction: updatedTx,
          newStock: newStock,
          productId: productId
        };
      } catch (sbErr) {
        console.error('Supabase updateTransaction error:', sbErr);
        throw sbErr;
      }
    }

    // 2. Google Apps Script Fallback
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'updateTransaction',
            ...transData
          })
        });
        const json = await response.json();
        if (json.success) {
          this.updateLocalTransaction(json.transaction || transData, json);
          return json;
        }
        throw new Error(json.error || 'Failed to update transaction');
      } catch (err) {
        console.error('API update transaction failed:', err);
        throw err;
      }
    }

    // 3. LocalStorage Fallback
    return this.updateLocalTransaction(transData);
  },

  /**
   * ปิดการแจ้งเตือนสต็อกใกล้หมด (Targeted PATCH - ป้องกัน BUG-01 ไม่ลบต้นทุน)
   */
  async muteProductAlert(productId) {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();
        const res = await fetch(`${url}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}`, {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify({
            min_alert: -1,
            last_updated: new Date().toISOString()
          })
        });

        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error('Supabase muteProductAlert failed: ' + errTxt);
        }

        return { success: true, message: 'ปิดการแจ้งเตือนสำเร็จ' };
      } catch (sbErr) {
        console.error('Supabase mute alert error:', sbErr);
        throw sbErr;
      }
    }

    const products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || [];
    const p = products.find(x => x.productId === productId);
    if (p) {
      p.minAlert = -1;
      localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    }
    return { success: true, message: 'ปิดการแจ้งเตือนสำเร็จ' };
  },

  /**
   * บันทึกเพิ่ม/แก้ไขผู้ใช้งาน
   */
  async saveUser(userData) {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        // 1. เรียกใช้ Stored Procedure: admin_save_user (Security Definer + Bcrypt)
        try {
          const rpcRes = await fetch(`${url}/rest/v1/rpc/admin_save_user`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              p_username: userData.username.trim(),
              p_full_name: userData.fullName || userData.username,
              p_role: userData.role || 'staff',
              p_status: userData.status || 'active',
              p_password: userData.password ? userData.password.trim() : ''
            })
          });

          if (rpcRes.ok) {
            const rpcJson = await rpcRes.json();
            if (rpcJson && rpcJson.success) {
              return { success: true, message: rpcJson.message || `บันทึกข้อมูลผู้ใช้ ${userData.username} สำเร็จ` };
            }
            throw new Error(rpcJson?.message || 'บันทึกข้อมูลผู้ใช้ไม่สำเร็จ');
          }
        } catch (rpcErr) {
          if (rpcErr.message && !rpcErr.message.includes('404')) throw rpcErr;
        }

        // Direct table fallback
        const payload = {
          username: userData.username.trim(),
          full_name: userData.fullName || userData.username,
          role: userData.role || 'staff',
          status: userData.status || 'active'
        };
        if (userData.password) {
          payload.password = userData.password.trim();
        }

        const res = await fetch(`${url}/rest/v1/users`, {
          method: 'POST',
          headers: getSupabaseHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error('Supabase saveUser failed: ' + errTxt);
        }

        return { success: true, message: `บันทึกข้อมูลผู้ใช้ ${userData.username} สำเร็จ` };
      } catch (sbErr) {
        console.error('Supabase saveUser error:', sbErr);
        throw sbErr;
      }
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'saveUser',
            ...userData
          })
        });
        const json = await response.json();
        if (json.success) return json;
        throw new Error(json.error || 'Failed to save user');
      } catch (err) {
        console.error('API save user failed:', err);
        throw err;
      }
    }

    let users = JSON.parse(localStorage.getItem('stock_local_users')) || [
      { username: 'admin', fullName: 'ผู้ดูแลระบบ (Admin)', role: 'admin', status: 'active' },
      { username: 'staff', fullName: 'พนักงานหน้าร้าน (Staff)', role: 'staff', status: 'active' }
    ];
    const u = userData.username.toLowerCase();
    const idx = users.findIndex(x => x.username.toLowerCase() === u);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...userData };
    } else {
      users.push({ ...userData, createdAt: new Date().toISOString() });
    }
    localStorage.setItem('stock_local_users', JSON.stringify(users));
    return { success: true, message: `บันทึกข้อมูลผู้ใช้ ${userData.username} สำเร็จ` };
  },

  /**
   * ลบผู้ใช้งาน
   */
  async deleteUser(username) {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        // 1. เรียกใช้ Stored Procedure: admin_delete_user
        try {
          const rpcRes = await fetch(`${url}/rest/v1/rpc/admin_delete_user`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              p_username: username
            })
          });

          if (rpcRes.ok) {
            const rpcJson = await rpcRes.json();
            if (rpcJson && rpcJson.success) {
              return { success: true, message: rpcJson.message || `ลบผู้ใช้ ${username} สำเร็จ` };
            }
            throw new Error(rpcJson?.message || 'ลบผู้ใช้ไม่สำเร็จ');
          }
        } catch (rpcErr) {
          if (rpcErr.message && !rpcErr.message.includes('404')) throw rpcErr;
        }

        const res = await fetch(`${url}/rest/v1/users?username=eq.${encodeURIComponent(username)}`, {
          method: 'DELETE',
          headers: headers
        });

        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error('Supabase deleteUser failed: ' + errTxt);
        }

        return { success: true, message: `ลบผู้ใช้ ${username} สำเร็จ` };
      } catch (sbErr) {
        console.error('Supabase deleteUser error:', sbErr);
        throw sbErr;
      }
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'deleteUser',
            username: username
          })
        });
        const json = await response.json();
        if (json.success) return json;
        throw new Error(json.error || 'Failed to delete user');
      } catch (err) {
        console.error('API delete user failed:', err);
        throw err;
      }
    }

    let users = JSON.parse(localStorage.getItem('stock_local_users')) || [];
    users = users.filter(x => x.username.toLowerCase() !== username.toLowerCase());
    localStorage.setItem('stock_local_users', JSON.stringify(users));
    return { success: true, message: `ลบผู้ใช้ ${username} สำเร็จ` };
  },

  /**
   * เปลี่ยนรหัสผ่าน
   */
  async changePassword(data) {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders();

        // 1. เรียกใช้ Stored Procedure: change_password (Server-Side Verification & Bcrypt Hashing)
        try {
          const rpcRes = await fetch(`${url}/rest/v1/rpc/change_password`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              p_username: data.username,
              p_new_password: data.newPassword,
              p_old_password: data.oldPassword || '',
              p_is_admin_reset: !!data.isAdminReset
            })
          });

          if (rpcRes.ok) {
            const rpcJson = await rpcRes.json();
            if (rpcJson && rpcJson.success) {
              return { success: true, message: rpcJson.message || `เปลี่ยนรหัสผ่านสำหรับ ${data.username} สำเร็จ!` };
            }
            throw new Error(rpcJson?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
          } else {
            const errTxt = await rpcRes.text();
            let cleanMsg = errTxt;
            try {
              const parsed = JSON.parse(errTxt);
              if (parsed.message) cleanMsg = parsed.message;
            } catch (_) {}
            throw new Error(cleanMsg);
          }
        } catch (rpcErr) {
          if (rpcErr.message && !rpcErr.message.includes('404')) throw rpcErr;
        }

        // Direct table fallback
        if (data.oldPassword) {
          const checkRes = await fetch(`${url}/rest/v1/users?username=eq.${encodeURIComponent(data.username)}&select=*`, { headers });
          if (checkRes.ok) {
            const rows = await checkRes.json();
            if (rows.length > 0 && rows[0].password !== data.oldPassword) {
              throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
            }
          }
        }

        const res = await fetch(`${url}/rest/v1/users?username=eq.${encodeURIComponent(data.username)}`, {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify({ password: data.newPassword })
        });

        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error('Supabase changePassword failed: ' + errTxt);
        }

        return { success: true, message: `เปลี่ยนรหัสผ่านสำหรับ ${data.username} สำเร็จ!` };
      } catch (sbErr) {
        console.error('Supabase changePassword error:', sbErr);
        throw sbErr;
      }
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'changePassword',
            ...data
          })
        });
        const json = await response.json();
        if (json.success) return json;
        throw new Error(json.error || 'Failed to change password');
      } catch (err) {
        console.error('API change password failed:', err);
        throw err;
      }
    }

    return { success: true, message: `เปลี่ยนรหัสผ่านสำหรับ ${data.username} สำเร็จ!` };
  },

  /**
   * เพิ่มหมวดหมู่ใหม่
   */
  async addCategory(categoryName) {
    const trimmed = String(categoryName || '').trim();
    if (!trimmed) return;

    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url } = getSupabaseConfig();
        const headers = getSupabaseHeaders({
          'Prefer': 'resolution=ignore-duplicates'
        });
        await fetch(`${url}/rest/v1/categories`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ name: trimmed })
        });
      } catch (e) {
        console.warn('Supabase addCategory warn:', e);
      }
    }
  },

  async initGoogleSheet() {
    const apiUrl = getApiUrl();
    if (!apiUrl) throw new Error('กรุณาระบุ Web App URL ก่อน');
    const response = await fetch(`${apiUrl}?action=init`);
    return await response.json();
  },

  // =========================================================================
  // LOCAL STORAGE FALLBACK LOGIC
  // =========================================================================
  
  getLocalDashboardData(role) {
    if (!role) role = getCurrentUserRole();

    let products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS));
    let transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS));
    let categories = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CATEGORIES));
    let users = JSON.parse(localStorage.getItem('stock_local_users')) || [
      { username: 'admin', fullName: 'ผู้ดูแลระบบ (Admin)', role: 'admin', status: 'active' },
      { username: 'staff', fullName: 'พนักงานหน้าร้าน (Staff)', role: 'staff', status: 'active' }
    ];

    if (!products) {
      products = JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));
      localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    }
    if (!transactions) {
      transactions = JSON.parse(JSON.stringify(CONFIG.DEFAULT_TRANSACTIONS));
      localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    }
    if (!categories) {
      categories = JSON.parse(JSON.stringify(CONFIG.DEFAULT_CATEGORIES));
      localStorage.setItem(CONFIG.STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    }

    const summary = this.calculateSummaryMetrics(products, transactions);

    const fullData = {
      success: true,
      products: JSON.parse(JSON.stringify(products)),
      transactions: JSON.parse(JSON.stringify(transactions)),
      categories: JSON.parse(JSON.stringify(categories)),
      users: JSON.parse(JSON.stringify(users)),
      summary: summary
    };

    return redactDataForRole(fullData, role);
  },

  calculateSummaryMetrics(products, transactions) {
    let totalStockValue = 0;
    let lowStockCount = 0;

    (products || []).forEach(p => {
      totalStockValue += ((p.currentStock || 0) * (p.costPrice || 0));
      if (isProductLowStock(p)) {
        lowStockCount++;
      }
    });

    const todayStr = new Date().toDateString();
    let todayRevenue = 0;
    let todayCost = 0;
    let todayProfit = 0;
    let todaySalesCount = 0;

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;

    (transactions || []).forEach(t => {
      if (t.type === 'OUT') {
        const rev = Number(t.totalRevenue) || 0;
        const cst = Number(t.totalCost) || 0;
        const prf = Number(t.profit) || (rev - cst);

        totalRevenue += rev;
        totalCost += cst;
        totalProfit += prf;

        const tDateStr = t.timestamp ? new Date(t.timestamp).toDateString() : '';
        if (tDateStr === todayStr) {
          todayRevenue += rev;
          todayCost += cst;
          todayProfit += prf;
          todaySalesCount += (Number(t.quantity) || 0);
        }
      }
    });

    const overallMargin = totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0;
    const todayMargin = todayRevenue > 0 ? Number(((todayProfit / todayRevenue) * 100).toFixed(2)) : 0;

    return {
      totalProducts: (products || []).length,
      lowStockCount: lowStockCount,
      totalStockValue: Number(totalStockValue.toFixed(2)),
      todayRevenue: Number(todayRevenue.toFixed(2)),
      todayCost: Number(todayCost.toFixed(2)),
      todayProfit: Number(todayProfit.toFixed(2)),
      todayMargin: todayMargin,
      todaySalesCount: todaySalesCount,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      overallMargin: overallMargin
    };
  },

  addLocalTransaction(data) {
    const products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));
    const transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_TRANSACTIONS));

    const productId = String(data.productId).trim();
    const type = String(data.type).toUpperCase();
    const qty = Number(data.quantity);

    if (!productId) throw new Error('กรุณาระบุรหัสสินค้า');
    if (type === 'ADJUST') {
      if (isNaN(qty) || qty < 0) {
        throw new Error('จำนวนสต็อกที่ปรับต้องไม่ติดลบ (ต้องเป็น 0 หรือมากกว่า)');
      }
    } else {
      if (isNaN(qty) || qty <= 0) {
        throw new Error('จำนวนต้องมากกว่า 0');
      }
    }

    const productIndex = products.findIndex(p => p.productId.toLowerCase() === productId.toLowerCase());
    if (productIndex === -1) throw new Error('ไม่พบสินค้ารหัส: ' + productId);

    const product = products[productIndex];
    let newStock = Number(product.currentStock) || 0;
    const oldCost = Number(product.costPrice) || 0;
    const isSalePriceProvided = (data.salePrice !== undefined && data.salePrice !== null && data.salePrice !== '' && !isNaN(Number(data.salePrice)) && Number(data.salePrice) >= 0);
    const salePrice = isSalePriceProvided ? Number(data.salePrice) : (Number(product.salePrice) || 0);

    let costPrice = oldCost;
    let totalCost = 0;
    let totalRevenue = 0;
    let profit = 0;

    if (type === 'IN') {
      const inCost = (data.costPrice !== undefined && data.costPrice !== null && data.costPrice !== '') ? Number(data.costPrice) : 0;
      const actualInCost = inCost > 0 ? inCost : oldCost;
      const newWac = calculateWAC(newStock, oldCost, qty, inCost);

      newStock += qty;
      costPrice = actualInCost;
      totalCost = qty * actualInCost;
      totalRevenue = 0;
      profit = 0;

      product.costPrice = newWac;
      product.profitPerUnit = Number(((Number(product.salePrice) || 0) - newWac).toFixed(2));
      product.marginPercent = (Number(product.salePrice) || 0) > 0 ? Number(((product.profitPerUnit / product.salePrice) * 100).toFixed(2)) : 0;
    } else if (type === 'OUT') {
      if (newStock < qty) {
        throw new Error(`สต็อกคงเหลือไม่พอ! มีอยู่ ${newStock} ${product.unit || 'ชิ้น'} แต่ต้องการเบิก ${qty}`);
      }
      newStock -= qty;
      costPrice = oldCost;
      totalCost = qty * costPrice;
      totalRevenue = qty * salePrice;
      profit = totalRevenue - totalCost;
    } else if (type === 'ADJUST') {
      newStock = qty;
      costPrice = oldCost;
      totalCost = 0;
      totalRevenue = 0;
      profit = 0;
    } else {
      throw new Error('ประเภทรายการไม่ถูกต้อง (ต้องเป็น IN, OUT, หรือ ADJUST)');
    }

    product.currentStock = newStock;
    product.lastUpdated = new Date().toISOString();
    products[productIndex] = product;

    const rand4 = Math.floor(1000 + Math.random() * 9000);
    const transId = 'TRX-' + Date.now() + '-' + rand4;
    const imageUrl = data.imageUrl || data.imageBase64 || '';

    const newTrans = {
      transId: transId,
      timestamp: new Date().toISOString(),
      productId: product.productId,
      productName: product.productName,
      type: type,
      quantity: qty,
      costPrice: costPrice,
      salePrice: salePrice,
      totalCost: totalCost,
      totalRevenue: totalRevenue,
      profit: profit,
      operator: data.operator || 'Staff',
      note: data.note || '',
      imageUrl: imageUrl
    };

    transactions.unshift(newTrans);

    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));

    const role = (data.role || data.userRole || '').toLowerCase().trim();
    const isExplicitStaff = (role === 'staff' || (role && role !== 'admin'));

    const result = {
      success: true,
      message: `บันทึกรายการ ${type} สำเร็จ! สต็อกคงเหลือ: ${newStock}`,
      transId: transId,
      newStock: newStock,
      imageUrl: imageUrl
    };

    if (!isExplicitStaff) {
      result.profit = profit;
      result.totalCost = totalCost;
      result.costPrice = costPrice;
    }

    return result;
  },

  batchAddLocalTransactions(data) {
    const products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));
    const transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_TRANSACTIONS));

    const items = data.items || [];
    const operator = data.operator || 'Staff';
    const batchNote = data.note || 'รับเข้าล็อตใหญ่ (Batch In)';
    const now = new Date();
    const batchId = 'BATCH-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
    const imageUrl = data.imageUrl || data.imageBase64 || '';
    const processed = [];

    items.forEach((item, idx) => {
      const pId = String(item.productId || '').trim().toLowerCase();
      const pIdx = products.findIndex(p => p.productId.toLowerCase() === pId);
      if (pIdx === -1) return;

      const product = products[pIdx];
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) return;

      const type = String(item.type || 'IN').toUpperCase();
      const oldCost = Number(product.costPrice) || 0;
      const inCost = (item.costPrice !== undefined && item.costPrice !== null && item.costPrice !== '') ? Number(item.costPrice) : oldCost;
      const itemSalePrice = (item.salePrice !== undefined && item.salePrice !== null && item.salePrice !== '') ? Number(item.salePrice) : (Number(product.salePrice) || 0);
      const transId = `${batchId}-${idx + 1}`;

      let newStock = Number(product.currentStock) || 0;
      let costPrice = oldCost;
      let totalCost = 0;
      let totalRevenue = 0;
      let profit = 0;

      if (type === 'IN') {
        const newWac = calculateWAC(newStock, oldCost, qty, inCost);
        newStock += qty;
        costPrice = inCost;
        totalCost = qty * inCost;

        product.costPrice = newWac;
        product.profitPerUnit = Number(((Number(product.salePrice) || 0) - newWac).toFixed(2));
        product.marginPercent = (Number(product.salePrice) || 0) > 0 ? Number(((product.profitPerUnit / product.salePrice) * 100).toFixed(2)) : 0;
      } else if (type === 'OUT') {
        newStock = Math.max(0, newStock - qty);
        totalCost = qty * oldCost;
        totalRevenue = qty * itemSalePrice;
        profit = totalRevenue - totalCost;
      }

      product.currentStock = newStock;
      product.lastUpdated = now.toISOString();
      products[pIdx] = product;

      transactions.unshift({
        transId: transId,
        timestamp: now.toISOString(),
        productId: product.productId,
        productName: product.productName,
        type: type,
        quantity: qty,
        costPrice: costPrice,
        salePrice: itemSalePrice,
        totalCost: totalCost,
        totalRevenue: totalRevenue,
        profit: profit,
        operator: operator,
        note: item.note ? `${batchNote} (${item.note})` : batchNote,
        imageUrl: imageUrl
      });

      processed.push({ productId: product.productId, newStock: newStock, qty: qty });
    });

    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));

    return {
      success: true,
      message: `บันทึกรายการล็อตใหญ่สำเร็จ ${processed.length} รายการ!`,
      batchId: batchId,
      itemCount: processed.length,
      imageUrl: imageUrl
    };
  },

  saveLocalProduct(data) {
    const products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));
    const productId = String(data.productId).trim();
    const cost = Number(data.costPrice) || 0;
    const sale = Number(data.salePrice) || 0;
    const profit = Number((sale - cost).toFixed(2));
    const margin = sale > 0 ? Number(((profit / sale) * 100).toFixed(2)) : 0;

    const index = products.findIndex(p => p.productId.toLowerCase() === productId.toLowerCase());
    
    if (index >= 0) {
      products[index] = {
        ...products[index],
        productName: data.productName,
        category: data.category,
        unit: data.unit,
        costPrice: cost,
        salePrice: sale,
        profitPerUnit: profit,
        marginPercent: margin,
        minAlert: parseMinAlert(data.minAlert),
        note: data.note !== undefined ? data.note : (products[index].note || ''),
        currentStock: data.updateStock ? Number(data.initialStock) : products[index].currentStock,
        lastUpdated: new Date().toISOString()
      };
    } else {
      const newProd = {
        productId: productId,
        productName: data.productName,
        category: data.category || 'ทั่วไป',
        unit: data.unit || 'ชิ้น',
        costPrice: cost,
        salePrice: sale,
        profitPerUnit: profit,
        marginPercent: margin,
        currentStock: Number(data.initialStock) || 0,
        minAlert: parseMinAlert(data.minAlert),
        note: data.note || '',
        lastUpdated: new Date().toISOString()
      };
      products.push(newProd);
    }

    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    return { success: true, message: `บันทึกข้อมูลสินค้า ${data.productName} สำเร็จ!` };
  },

  deleteLocalProduct(productId) {
    let products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));
    products = products.filter(p => p.productId.toLowerCase() !== String(productId).toLowerCase());
    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    return { success: true, message: `ลบสินค้า ${productId} เรียบร้อยแล้ว` };
  },

  deleteLocalTransaction(transId, meta = {}) {
    let transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_TRANSACTIONS));
    let products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));

    const txIndex = transactions.findIndex(t => t.transId === transId);
    if (txIndex !== -1) {
      const oldTrans = transactions[txIndex];
      const productId = oldTrans.productId;
      const type = (oldTrans.type || '').toUpperCase();
      const qty = Number(oldTrans.quantity) || 0;

      const pIdx = products.findIndex(p => p.productId.toLowerCase() === productId.toLowerCase());
      if (pIdx !== -1) {
        if (meta.newStock !== undefined) {
          products[pIdx].currentStock = meta.newStock;
        } else {
          if (type === 'OUT') {
            products[pIdx].currentStock = (Number(products[pIdx].currentStock) || 0) + qty;
          } else if (type === 'IN') {
            products[pIdx].currentStock = Math.max(0, (Number(products[pIdx].currentStock) || 0) - qty);
          }
        }
        products[pIdx].lastUpdated = new Date().toISOString();
      }

      transactions.splice(txIndex, 1);
      localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
      localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));

      return {
        success: true,
        message: `ลบรายการ ${transId} เรียบร้อยแล้ว`,
        productId: productId,
        newStock: pIdx !== -1 ? products[pIdx].currentStock : 0
      };
    }

    return { success: true, message: `ลบรายการ ${transId} เรียบร้อยแล้ว` };
  },

  updateLocalTransaction(transData, meta = {}) {
    let transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_TRANSACTIONS));
    let products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_PRODUCTS));

    const transId = String(transData.transId).trim();
    const txIndex = transactions.findIndex(t => t.transId === transId);
    if (txIndex === -1) {
      throw new Error('ไม่พบรายการที่ต้องการแก้ไข: ' + transId);
    }

    const oldTrans = transactions[txIndex];
    const productId = oldTrans.productId;
    const pIdx = products.findIndex(p => p.productId.toLowerCase() === productId.toLowerCase());

    const newQty = Number(transData.quantity) || oldTrans.quantity;
    const newType = String(transData.type || oldTrans.type).toUpperCase();
    const costPrice = transData.costPrice !== undefined ? Number(transData.costPrice) : (oldTrans.costPrice || 0);
    const salePrice = transData.salePrice !== undefined ? Number(transData.salePrice) : (oldTrans.salePrice || 0);

    let totalCost = 0;
    let totalRevenue = 0;
    let profit = 0;

    if (newType === 'OUT') {
      totalCost = Number((newQty * costPrice).toFixed(2));
      totalRevenue = Number((newQty * salePrice).toFixed(2));
      profit = Number((totalRevenue - totalCost).toFixed(2));
    } else if (newType === 'IN') {
      totalCost = Number((newQty * costPrice).toFixed(2));
      totalRevenue = 0;
      profit = 0;
    }

    if (pIdx !== -1) {
      if (meta.newStock !== undefined) {
        products[pIdx].currentStock = meta.newStock;
      } else {
        let baseStock = Number(products[pIdx].currentStock) || 0;
        if (oldTrans.type === 'OUT') baseStock += Number(oldTrans.quantity) || 0;
        else if (oldTrans.type === 'IN') baseStock -= Number(oldTrans.quantity) || 0;

        let newStock = baseStock;
        if (newType === 'OUT') newStock = baseStock - newQty;
        else if (newType === 'IN') newStock = baseStock + newQty;
        else if (newType === 'ADJUST') newStock = newQty;

        products[pIdx].currentStock = Math.max(0, newStock);
      }
      products[pIdx].lastUpdated = new Date().toISOString();
    }

    const updated = {
      ...oldTrans,
      ...transData,
      type: newType,
      quantity: newQty,
      costPrice: costPrice,
      salePrice: salePrice,
      totalCost: totalCost,
      totalRevenue: totalRevenue,
      profit: profit,
      timestamp: transData.timestamp || oldTrans.timestamp,
      operator: transData.operator || oldTrans.operator,
      note: transData.note !== undefined ? transData.note : oldTrans.note
    };

    transactions[txIndex] = updated;
    localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));

    return {
      success: true,
      message: `แก้ไขรายการ ${transId} สำเร็จ!`,
      transaction: updated,
      productId: productId,
      newStock: pIdx !== -1 ? products[pIdx].currentStock : 0
    };
  }
};

if (typeof window !== 'undefined') {
  window.ApiService = ApiService;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ApiService = ApiService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ApiService,
    calculateWAC,
    redactDataForRole,
    getCurrentUserRole
  };
}

/**
 * Lebon Toy Stock Management - Reactive In-Memory Store & Cross-Tab Sync
 * Single Source of Truth with 0ms Reactivity and BroadcastChannel
 */

function isProductLowStock(product) {
  if (!product) return false;
  const minAlert = Number(product.minAlert);
  if (minAlert === -1 || product.minAlert === '-1' || product.isAlertEnabled === false) return false;
  const threshold = minAlert >= 0 ? minAlert : 5;
  return Number(product.currentStock || 0) <= threshold;
}

class ReactiveStore {
  constructor(initialState = {}) {
    this.state = {
      products: [],
      transactions: [],
      categories: [],
      users: [],
      summary: {
        totalProducts: 0,
        totalStock: 0,
        totalStockValue: 0,
        lowStockCount: 0,
        todayRevenue: 0,
        todayProfit: 0,
        todayMargin: 0
      },
      ...initialState
    };
    this.subscribers = new Map();
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lebon_stock_sync') : null;
    this.setupInterTabSync();
  }

  getState(slice) {
    return slice ? this.state[slice] : this.state;
  }

  subscribe(slice, callback) {
    if (!this.subscribers.has(slice)) {
      this.subscribers.set(slice, new Set());
    }
    this.subscribers.get(slice).add(callback);
    return () => this.subscribers.get(slice).delete(callback);
  }

  notify(slice, meta = {}) {
    if (this.subscribers.has(slice)) {
      this.subscribers.get(slice).forEach((cb) => cb(this.state[slice], meta));
    }
  }

  setupInterTabSync() {
    if (!this.channel) return;
    this.channel.onmessage = (event) => {
      const { type, payload } = event.data || {};
      switch (type) {
        case 'PRODUCT_UPDATED':
          this.applyRemoteProductUpdate(payload);
          break;
        case 'TRANSACTION_ADDED':
          this.applyRemoteTransaction(payload);
          break;
        case 'TRANSACTION_RECONCILED':
          this.applyRemoteTransactionReconciliation(payload);
          break;
        case 'TRANSACTION_ROLLBACK':
          this.applyRemoteRollback(payload);
          break;
      }
    };
  }

  broadcast(type, payload) {
    if (this.channel) {
      try {
        this.channel.postMessage({ type, payload });
      } catch (e) {
        console.warn('[Store] Broadcast error:', e);
      }
    }
  }

  applyRemoteProductUpdate(updatedProduct) {
    const idx = this.state.products.findIndex((p) => p.productId === updatedProduct.productId);
    if (idx !== -1) {
      this.state.products[idx] = { ...this.state.products[idx], ...updatedProduct };
      patchProductRowDOM(this.state.products[idx]);
      this.recalculateSummary();
      updateSummaryBadgesDOM(this.state.summary);
      if (typeof App !== 'undefined' && App.renderPosSearchResults) {
        App.renderPosSearchResults();
      }
    }
  }

  applyRemoteTransaction(newTx) {
    if (!this.state.transactions.some((t) => t.transId === newTx.transId)) {
      this.state.transactions.unshift(newTx);
      prependTransactionRowDOM(newTx);
    }
  }

  applyRemoteTransactionReconciliation({ tempTransId, realTransId, productId }) {
    const tx = this.state.transactions.find((t) => t.transId === tempTransId);
    if (tx) {
      tx.transId = realTransId;
      tx.isOptimistic = false;
      updateTransactionDOMId(tempTransId, realTransId);
    }
  }

  applyRemoteRollback({ productId, restoredStock, tempTransId }) {
    const product = this.state.products.find((p) => p.productId === productId);
    if (product) {
      product.currentStock = restoredStock;
      patchProductRowDOM(product);
    }
    const txIndex = this.state.transactions.findIndex((t) => t.transId === tempTransId);
    if (txIndex !== -1) {
      this.state.transactions.splice(txIndex, 1);
      removeTransactionRowDOM(tempTransId);
    }
    this.recalculateSummary();
    updateSummaryBadgesDOM(this.state.summary);
  }

  recalculateSummary() {
    let totalStock = 0;
    let totalStockValue = 0;
    let lowStockCount = 0;
    const totalProducts = this.state.products.length;

    this.state.products.forEach((p) => {
      const stock = Number(p.currentStock) || 0;
      const cost = Number(p.costPrice) || 0;
      totalStock += stock;
      totalStockValue += stock * cost;
      if (isProductLowStock(p)) {
        lowStockCount++;
      }
    });

    // Calculate today revenue and profit from transactions
    const today = new Date().toDateString();
    let todayRevenue = 0;
    let todayProfit = 0;

    (this.state.transactions || []).forEach((t) => {
      if (t.type === 'OUT' && t.timestamp && new Date(t.timestamp).toDateString() === today) {
        todayRevenue += Number(t.totalRevenue) || 0;
        todayProfit += Number(t.profit) || 0;
      }
    });

    const todayMargin = todayRevenue > 0 ? Number(((todayProfit / todayRevenue) * 100).toFixed(1)) : 0;

    this.state.summary = {
      ...this.state.summary,
      totalProducts,
      totalStock,
      totalStockValue,
      lowStockCount,
      todayRevenue,
      todayProfit,
      todayMargin
    };
    this.notify('summary', { action: 'recalculate' });
  }
}

// ---------------------------------------------------------------------
// Targeted DOM Helper Functions (0ms surgical updates without page wipe)
// ---------------------------------------------------------------------

function renderStockBadgeHtml(p) {
  const isLow = isProductLowStock(p);
  const isAlertDisabled = (p.minAlert === -1 || p.minAlert === '-1' || p.isAlertEnabled === false);
  let alertInfo = '';
  if (isAlertDisabled) {
    alertInfo = '<span class="text-[10px] text-slate-400 block font-normal">🔕 ปิดเตือน</span>';
  } else if (Number(p.minAlert) === 0) {
    alertInfo = '<span class="text-[10px] text-amber-600 block font-normal">เตือนเมื่อหมด (0)</span>';
  } else if (Number(p.minAlert) > 0) {
    alertInfo = `<span class="text-[10px] text-slate-400 block font-normal">เตือน &le; ${p.minAlert}</span>`;
  }

  return isLow 
    ? `<div><span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${p.currentStock <= 0 ? 'bg-rose-50 text-rose-700 border border-rose-200/60' : 'bg-amber-50 text-amber-800 border border-amber-200/60'}"><span class="w-1.5 h-1.5 rounded-full ${p.currentStock <= 0 ? 'bg-rose-500' : 'bg-amber-500'}"></span>${p.currentStock <= 0 ? 'หมดเกลี้ยง (0)' : `ใกล้หมด (${p.currentStock} ${p.unit})`}</span>${alertInfo}</div>`
    : `<div><span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>${p.currentStock} ${p.unit}</span>${alertInfo}</div>`;
}

function patchProductRowDOM(product) {
  const row = document.querySelector(`tr[data-product-id="${product.productId}"]`);
  if (!row) return;

  const stockCell = row.querySelector('.col-stock');
  if (stockCell) {
    stockCell.innerHTML = renderStockBadgeHtml(product);
  }

  const profitCell = row.querySelector('.col-profit');
  if (profitCell && product.salePrice !== undefined && product.costPrice !== undefined) {
    const profit = Number(product.salePrice) - Number(product.costPrice);
    const margin = product.salePrice > 0 ? ((profit / product.salePrice) * 100).toFixed(1) : '0.0';
    profitCell.innerHTML = profit >= 0 
      ? `<div class="text-emerald-600 font-semibold">+฿${profit.toLocaleString()} <span class="text-xs text-slate-400 font-normal">(${margin}%)</span></div>`
      : `<div class="text-rose-600 font-semibold">-฿${Math.abs(profit).toLocaleString()} <span class="text-xs text-slate-400 font-normal">(${margin}%)</span></div>`;
  }

  row.classList.add('bg-indigo-50/80');
  setTimeout(() => row.classList.remove('bg-indigo-50/80'), 700);
}

function prependTransactionRowDOM(tx) {
  const tbody = document.getElementById('history-table-tbody');
  if (!tbody) return;

  const isOut = tx.type === 'OUT';
  const isIn = tx.type === 'IN';
  const typeBadge = isOut 
    ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60"><i data-lucide="arrow-up-right" class="w-3 h-3"></i> เบิก/ขาย OUT</span>'
    : isIn 
    ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60"><i data-lucide="arrow-down-left" class="w-3 h-3"></i> รับเข้า IN</span>'
    : '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60"><i data-lucide="sliders" class="w-3 h-3"></i> ปรับยอด ADJUST</span>';

  const timeStr = new Date(tx.timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  const isAdmin = typeof AuthManager !== 'undefined' && AuthManager.isAdmin();
  const profitDisplay = isOut 
    ? `<span class="${tx.profit >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}">฿${(tx.profit || 0).toLocaleString()}</span>` 
    : '-';
  const profitCell = isAdmin ? `<td class="px-4 py-3 text-right font-medium">${profitDisplay}</td>` : '';

  const photoButton = tx.imageUrl ? `
    <button onclick="App.openImageViewerModal('${tx.imageUrl}', '${tx.productName}', '${timeStr}')" 
      class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition">
      <i data-lucide="image" class="w-3.5 h-3.5"></i> ดูรูป
    </button>
  ` : '<span class="text-slate-300 text-xs">-</span>';

  const tr = document.createElement('tr');
  tr.id = `tx-row-${tx.transId}`;
  tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 transition text-sm bg-indigo-50/40';
  tr.innerHTML = `
    <td class="px-4 py-3 font-mono text-xs text-slate-400">
      <span class="tx-id-badge">${tx.transId}</span>
      ${tx.isOptimistic ? '<span class="ml-1 text-[10px] text-amber-600 font-bold animate-pulse">⏳ ซิงค์...</span>' : ''}
    </td>
    <td class="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">${timeStr}</td>
    <td class="px-4 py-3">${typeBadge}</td>
    <td class="px-4 py-3 font-medium text-slate-800">${tx.productName} <span class="text-xs text-slate-400 font-mono">(${tx.productId})</span></td>
    <td class="px-4 py-3 text-right font-semibold text-slate-700">${(tx.quantity || 0).toLocaleString()}</td>
    <td class="px-4 py-3 text-right font-medium text-slate-700">${tx.totalRevenue ? '฿' + Number(tx.totalRevenue).toLocaleString() : '-'}</td>
    ${profitCell}
    <td class="px-4 py-3 text-center">${photoButton}</td>
    <td class="px-4 py-3 text-slate-500 text-xs">${tx.operator || 'Staff'} ${tx.note ? `<br><span class="text-slate-400">(${tx.note})</span>` : ''}</td>
  `;

  tbody.prepend(tr);
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
  setTimeout(() => tr.classList.remove('bg-indigo-50/40'), 1000);
}

function removeTransactionRowDOM(transId) {
  const el = document.getElementById(`tx-row-${transId}`);
  if (el) el.remove();
}

function updateTransactionDOMId(tempId, realId) {
  const el = document.getElementById(`tx-row-${tempId}`);
  if (el) {
    el.id = `tx-row-${realId}`;
    const badge = el.querySelector('.tx-id-badge');
    if (badge) badge.textContent = realId;
    const pulse = el.querySelector('.animate-pulse');
    if (pulse) pulse.remove();
  }
}

function updateSummaryBadgesDOM(summary) {
  const totalProdEl = document.getElementById('dash-total-products');
  const lowStockEl = document.getElementById('dash-low-stock');
  const stockValEl = document.getElementById('dash-stock-value');
  const todayRevEl = document.getElementById('dash-today-revenue');
  const todayProfitEl = document.getElementById('dash-today-profit');
  const todayMarginEl = document.getElementById('dash-today-margin');

  if (totalProdEl && summary.totalProducts !== undefined) totalProdEl.textContent = summary.totalProducts.toLocaleString();
  if (lowStockEl && summary.lowStockCount !== undefined) lowStockEl.textContent = summary.lowStockCount.toLocaleString();
  if (stockValEl && summary.totalStockValue !== undefined) stockValEl.textContent = '฿' + summary.totalStockValue.toLocaleString();
  if (todayRevEl && summary.todayRevenue !== undefined) todayRevEl.textContent = '฿' + summary.todayRevenue.toLocaleString();
  if (todayProfitEl && summary.todayProfit !== undefined) {
    const p = summary.todayProfit;
    todayProfitEl.textContent = (p >= 0 ? '+' : '') + '฿' + p.toLocaleString();
    todayProfitEl.className = p >= 0 ? 'text-2xl font-bold text-emerald-600' : 'text-2xl font-bold text-rose-600';
  }
  if (todayMarginEl && summary.todayMargin !== undefined) todayMarginEl.textContent = (summary.todayMargin || 0) + '%';
}

function showFlashNotice(message, type = 'info') {
  if (typeof App !== 'undefined' && App.showToast) {
    App.showToast(message, type);
  }
}

// Global Singleton Store
window.appStore = new ReactiveStore();

/**
 * Main Application Logic & UI Interactions
 * รองรับการบันทึกภาพถ่ายหลักฐานรับเข้า-เบิกจ่าย (Google Drive Photo Integration)
 */

const App = {
  activeTab: 'dashboard',
  products: [],
  transactions: [],
  categories: [],
  users: [],
  summary: {},
  selectedCategory: 'ALL',
  searchQuery: '',
  posSelectedCategory: 'all', // หมวดหมู่ที่เลือกในหน้ารับเข้า-เบิกจ่าย
  posSearchKeyword: '', // คำค้นหาในหน้ารับเข้า-เบิกจ่าย
  currentAttachedPhotoBase64: null, // เก็บรูปภาพ Base64 ที่ถ่าย/แนบมา
  deferredPrompt: null, // PWA Install prompt event
  batchRows: [], // รายการในโมดอลรับเข้าล็อตใหญ่
  batchReceiptBase64: null, // รูปใบเสร็จบิลรวม

  async init() {
    this.bindAuth();
    this.bindNavigation();
    this.bindModals();
    this.bindUserManagement();
    this.bindPosActions();
    this.bindSettings();
    this.bindSearchAndFilter();
    this.bindPwaAndSync();

    // ตอบสนองทันที 0 วินาทีด้วย Local Database Cache (Stale-While-Revalidate)
    this.renderCachedDataFirst();
    this.updateSyncUI();
    
    // ตรวจสอบการ Login
    if (!AuthManager.checkAuthAndApplyUI()) {
      return;
    }

    // โหลดข้อมูลล่าสุดจาก Google Sheets ใน Background
    await this.refreshData();
    ReportsManager.init();
    this.updateConnectionStatus();
  },

  /**
   * โหลดและแสดงผลข้อมูลจาก Cache ในเครื่องทันที (0 วินาที)
   */
  renderCachedDataFirst() {
    try {
      const cached = ApiService.getCachedDashboardData();
      if (cached && cached.products && cached.products.length > 0) {
        this.products = cached.products || [];
        this.transactions = cached.transactions || [];
        this.categories = cached.categories || [];
        this.users = cached.users || [];
        this.summary = cached.summary || {};

        if (window.appStore) {
          window.appStore.state.products = this.products;
          window.appStore.state.transactions = this.transactions;
          window.appStore.state.categories = this.categories;
          window.appStore.state.users = this.users;
          window.appStore.state.summary = this.summary;
        }

        this.renderDashboard();
        this.renderProducts();
        this.renderHistory();
        this.renderUsersTable();
        this.populateCategoryDropdowns();
        this.updateMyAccountInfo();
        AuthManager.checkAuthAndApplyUI();
      }
    } catch (e) {
      console.warn('Cached data render error:', e);
    }
  },

  /**
   * จัดการระบบ Authentication ใน UI
   */
  bindAuth() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error-msg');
        const submitBtn = document.getElementById('btn-submit-login');

        try {
          if (errEl) errEl.classList.add('hidden');
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>⏳</span> กำลังตรวจสอบ...';

          const user = await AuthManager.login(u, p);
          this.showToast(`ยินดีต้อนรับ ${user.fullName || user.username}!`, 'success');
          AuthManager.checkAuthAndApplyUI();
          
          await this.refreshData();
          ReportsManager.init();
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'เข้าสู่ระบบไม่สำเร็จ';
            errEl.classList.remove('hidden');
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🔐</span> เข้าสู่ระบบ';
        }
      });
    }
  },

  fillDemoLogin(u, p) {
    document.getElementById('login-username').value = u;
    document.getElementById('login-password').value = p;
  },

  /**
   * สลับหน้าแท็บเมนู
   */
  bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
  },

  switchTab(tab) {
    this.activeTab = tab;

    document.querySelectorAll('.nav-btn').forEach(btn => {
      const isCurrent = btn.dataset.tab === tab;
      if (isCurrent) {
        btn.classList.add('bg-indigo-700', 'text-white', 'font-medium');
        btn.classList.remove('text-indigo-100', 'hover:bg-indigo-800');
      } else {
        btn.classList.remove('bg-indigo-700', 'text-white', 'font-medium');
        btn.classList.add('text-indigo-100', 'hover:bg-indigo-800');
      }
    });

    document.querySelectorAll('.tab-page').forEach(page => {
      page.classList.add('hidden');
    });
    const activePage = document.getElementById(`page-${tab}`);
    if (activePage) {
      activePage.classList.remove('hidden');
    }

    if (tab !== 'pos') {
      scannerManager.stopScanner();
      const btnScan = document.getElementById('btn-toggle-camera');
      if (btnScan) btnScan.textContent = '📷 เปิดกล้องสแกน';
    }

    if (tab === 'reports') {
      ReportsManager.renderReport();
    }

    if (tab === 'settings') {
      this.renderUsersTable();
      this.updateMyAccountInfo();
    }
  },

  /**
   * ดึงข้อมูลและอัปเดตหน้าจอทั้งหมด
   */
  async refreshData() {
    this.showLoading(true);
    try {
      const data = await ApiService.getDashboardData();
      this.products = data.products || [];
      this.transactions = data.transactions || [];
      this.categories = data.categories || [];
      this.users = data.users || [];
      this.summary = data.summary || {};

      if (window.appStore) {
        window.appStore.state.products = this.products;
        window.appStore.state.transactions = this.transactions;
        window.appStore.state.categories = this.categories;
        window.appStore.state.users = this.users;
        window.appStore.state.summary = this.summary;
      }

      this.renderDashboard();
      this.renderProducts();
      this.renderHistory();
      this.renderUsersTable();
      this.populateCategoryDropdowns();
      this.updateMyAccountInfo();
      AuthManager.checkAuthAndApplyUI();
    } catch (err) {
      this.showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  /**
   * แสดงข้อมูล Dashboard
   */
  renderDashboard() {
    const totalProdEl = document.getElementById('dash-total-products');
    const lowStockEl = document.getElementById('dash-low-stock');
    const stockValEl = document.getElementById('dash-stock-value');
    const todayRevEl = document.getElementById('dash-today-revenue');
    const todayProfitEl = document.getElementById('dash-today-profit');
    const todayMarginEl = document.getElementById('dash-today-margin');

    if (totalProdEl) totalProdEl.textContent = (this.summary.totalProducts || 0).toLocaleString();
    if (lowStockEl) lowStockEl.textContent = (this.summary.lowStockCount || 0).toLocaleString();
    if (stockValEl) stockValEl.textContent = '฿' + (this.summary.totalStockValue || 0).toLocaleString();
    if (todayRevEl) todayRevEl.textContent = '฿' + (this.summary.todayRevenue || 0).toLocaleString();
    if (todayProfitEl) {
      const profit = this.summary.todayProfit || 0;
      todayProfitEl.textContent = (profit >= 0 ? '+' : '') + '฿' + profit.toLocaleString();
      todayProfitEl.className = profit >= 0 ? 'text-2xl font-bold text-emerald-600' : 'text-2xl font-bold text-rose-600';
    }
    if (todayMarginEl) todayMarginEl.textContent = (this.summary.todayMargin || 0) + '%';

    const lowStockContainer = document.getElementById('dash-low-stock-list');
    if (lowStockContainer) {
      const lowList = this.products.filter(p => this.isProductLowStock(p));
      if (lowList.length === 0) {
        lowStockContainer.innerHTML = `
          <div class="py-6 text-center text-emerald-600 bg-emerald-50 rounded-xl">
            <span class="text-lg">🎉</span> สต็อกสินค้าทุกรายการอยู่ในเกณฑ์ปกติ (ไม่มีรายการใกล้หมด)
          </div>
        `;
      } else {
        lowStockContainer.innerHTML = lowList.map(p => {
          const threshold = (p.minAlert !== undefined && p.minAlert !== null && p.minAlert !== '') ? Number(p.minAlert) : 5;
          const isZeroAlert = threshold === 0;
          const alertText = isZeroAlert ? 'เตือนเมื่อ: หมด (0 ชิ้น)' : `เตือนเมื่อ &le; ${threshold} ${p.unit}`;
          return `
          <div class="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div>
              <div class="font-medium text-slate-800">${p.productName}</div>
              <div class="text-xs text-slate-500 font-mono">รหัส: ${p.productId} | หมวด: ${p.category}</div>
            </div>
            <div class="text-right flex items-center gap-2">
              <div>
                <span class="px-2 py-1 ${p.currentStock <= 0 ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'} font-bold rounded-lg text-sm">
                  ${p.currentStock <= 0 ? 'หมดเกลี้ยง (0)' : `เหลือ ${p.currentStock} ${p.unit}`}
                </span>
                <div class="text-xs text-amber-700 mt-1">${alertText}</div>
              </div>
              <button type="button" onclick="App.muteProductAlert('${p.productId}')" class="px-2 py-1 text-xs bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition font-medium" title="ปิดการแจ้งเตือนสำหรับสินค้านี้">🔕 ปิดเตือน</button>
            </div>
          </div>
        `;
        }).join('');
      }
    }

    const recentTbody = document.getElementById('dash-recent-transactions');
    const isAdmin = AuthManager.isAdmin();

    if (recentTbody) {
      const recent = this.transactions.slice(0, 5);
      if (recent.length === 0) {
        recentTbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">ยังไม่มีรายการ</td></tr>`;
      } else {
        recentTbody.innerHTML = recent.map(t => {
          const isOut = t.type === 'OUT';
          const typeBadge = isOut 
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">เบิก/ขาย</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">รับเข้า</span>';
          
          const profitCell = isAdmin ? `
            <td class="py-2.5 text-right font-medium ${isOut ? 'text-emerald-600' : 'text-slate-600'}">
              ${isOut ? `+฿${t.profit.toLocaleString()}` : '-'}
            </td>
          ` : '';

          const photoBtn = t.imageUrl ? `
            <button onclick="App.openImageViewerModal('${t.imageUrl}', '${t.productName}', '${t.type}')" class="ml-1 text-indigo-600 hover:text-indigo-800 text-xs" title="ดูรูปถ่าย">📸</button>
          ` : '';

          return `
            <tr class="border-b border-slate-100 text-sm">
              <td class="py-2.5 text-slate-500">${new Date(t.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
              <td class="py-2.5">${typeBadge}</td>
              <td class="py-2.5 font-medium text-slate-800">${t.productName} ${photoBtn}</td>
              <td class="py-2.5 text-right">${t.quantity}</td>
              ${profitCell}
            </tr>
          `;
        }).join('');
      }
    }
  },

  bindSearchAndFilter() {
    const searchInput = document.getElementById('product-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderProducts();
      });
    }
  },

  setCategoryFilter(cat) {
    this.selectedCategory = cat;
    document.querySelectorAll('.cat-pill-btn').forEach(btn => {
      if (btn.dataset.category === cat) {
        btn.classList.add('bg-indigo-600', 'text-white');
        btn.classList.remove('bg-slate-100', 'text-slate-700');
      } else {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-slate-100', 'text-slate-700');
      }
    });
    this.renderProducts();
  },

  renderProducts() {
    const tbody = document.getElementById('products-table-tbody');
    if (!tbody) return;

    const isAdmin = AuthManager.isAdmin();

    let filtered = this.products.filter(p => {
      const matchCat = (this.selectedCategory === 'ALL' || p.category === this.selectedCategory);
      const matchSearch = (
        (p.productId || '').toLowerCase().includes(this.searchQuery) ||
        (p.productName || '').toLowerCase().includes(this.searchQuery) ||
        (p.category || '').toLowerCase().includes(this.searchQuery)
      );
      return matchCat && matchSearch;
    });

    const pillsContainer = document.getElementById('category-pills-container');
    if (pillsContainer && this.categories.length > 0) {
      const allCats = ['ALL', ...this.categories];
      pillsContainer.innerHTML = allCats.map(c => `
        <button onclick="App.setCategoryFilter('${c}')" data-category="${c}"
          class="cat-pill-btn px-3 py-1 rounded-full text-xs font-medium transition ${this.selectedCategory === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
          ${c === 'ALL' ? 'ทั้งหมด' : c}
        </button>
      `).join('');
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">ไม่พบรายการสินค้าที่ตรงกับเงื่อนไข</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const isLow = this.isProductLowStock(p);
      const isAlertDisabled = (p.minAlert === -1 || p.minAlert === '-1' || p.isAlertEnabled === false);
      let alertInfo = '';
      if (isAlertDisabled) {
        alertInfo = '<span class="text-[10px] text-slate-400 block font-normal">🔕 ปิดเตือน</span>';
      } else if (Number(p.minAlert) === 0) {
        alertInfo = '<span class="text-[10px] text-amber-600 block font-normal">เตือนเมื่อหมด (0)</span>';
      } else if (Number(p.minAlert) > 0) {
        alertInfo = `<span class="text-[10px] text-slate-400 block font-normal">เตือน &le; ${p.minAlert}</span>`;
      }

      const stockBadge = isLow 
        ? `<div><span class="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-700">${p.currentStock <= 0 ? 'หมดเกลี้ยง (0)' : `ใกล้หมด (${p.currentStock} ${p.unit})`}</span>${alertInfo}</div>`
        : `<div><span class="px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">${p.currentStock} ${p.unit}</span>${alertInfo}</div>`;

      const profit = (p.salePrice || 0) - (p.costPrice || 0);
      const margin = p.salePrice > 0 ? ((profit / p.salePrice) * 100).toFixed(1) : '0.0';
      const profitBadge = profit >= 0 
        ? `<div class="text-emerald-600 font-semibold">+฿${profit.toLocaleString()} <span class="text-xs text-slate-400 font-normal">(${margin}%)</span></div>`
        : `<div class="text-rose-600 font-semibold">-฿${Math.abs(profit).toLocaleString()} <span class="text-xs text-slate-400 font-normal">(${margin}%)</span></div>`;

      const adminCols = isAdmin ? `
        <td class="px-4 py-3 text-right text-slate-600">฿${(p.costPrice || 0).toLocaleString()}</td>
      ` : '';

      const profitCol = isAdmin ? `
        <td class="px-4 py-3 text-right">${profitBadge}</td>
      ` : '';

      const adminButtons = isAdmin ? `
        <button onclick="App.openEditProductModal('${p.productId}')" class="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-xs mr-1">✏️</button>
        <button onclick="App.confirmDeleteProduct('${p.productId}')" class="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded text-xs">🗑️</button>
      ` : '';

      return `
        <tr data-product-id="${p.productId}" class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
          <td class="px-4 py-3 font-mono text-xs text-slate-600 font-semibold">${p.productId}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-slate-800">${p.productName}</div>
            <span class="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600">${p.category}</span>
          </td>
          ${adminCols}
          <td class="px-4 py-3 text-right font-medium text-slate-800">฿${(p.salePrice || 0).toLocaleString()}</td>
          <td class="px-4 py-3 text-right col-profit">${isAdmin ? profitBadge : ''}</td>
          <td class="px-4 py-3 text-center col-stock">${stockBadge}</td>
          <td class="px-4 py-3 text-center whitespace-nowrap">
            <button onclick="App.openQuickTransModal('${p.productId}', 'OUT')" class="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs mr-1 font-medium">เบิกขาย</button>
            <button onclick="App.openQuickTransModal('${p.productId}', 'IN')" class="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs mr-1 font-medium">รับเข้า</button>
            ${adminButtons}
          </td>
        </tr>
      `;
    }).join('');
  },

  renderHistory() {
    const tbody = document.getElementById('history-table-tbody');
    if (!tbody) return;

    const isAdmin = AuthManager.isAdmin();

    if (this.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">ยังไม่มีประวัติการทำรายการ</td></tr>`;
      return;
    }

    tbody.innerHTML = this.transactions.map(t => {
      const isOut = t.type === 'OUT';
      const isIn = t.type === 'IN';
      const typeBadge = isOut 
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">เบิก/ขาย OUT</span>'
        : isIn 
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">รับเข้า IN</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">ปรับยอด ADJUST</span>';

      const timeStr = new Date(t.timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
      const profitDisplay = isOut 
        ? `<span class="${t.profit >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}">฿${(t.profit || 0).toLocaleString()}</span>` 
        : '-';

      const profitCell = isAdmin ? `<td class="px-4 py-3 text-right">${profitDisplay}</td>` : '';

      const photoButton = t.imageUrl ? `
        <button onclick="App.openImageViewerModal('${t.imageUrl}', '${t.productName}', '${timeStr}')" 
          class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition">
          <span>📸</span> ดูรูป
        </button>
      ` : '<span class="text-slate-300 text-xs">-</span>';

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
          <td class="px-4 py-3 font-mono text-xs text-slate-400">${t.transId}</td>
          <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${timeStr}</td>
          <td class="px-4 py-3">${typeBadge}</td>
          <td class="px-4 py-3 font-medium text-slate-800">${t.productName} <span class="text-xs text-slate-400 font-mono">(${t.productId})</span></td>
          <td class="px-4 py-3 text-right font-medium text-slate-700">${t.quantity.toLocaleString()}</td>
          <td class="px-4 py-3 text-right text-slate-700">${t.totalRevenue ? '฿' + t.totalRevenue.toLocaleString() : '-'}</td>
          ${profitCell}
          <td class="px-4 py-3 text-center">${photoButton}</td>
          <td class="px-4 py-3 text-slate-500 text-xs">${t.operator || 'Staff'} ${t.note ? `<br><span class="text-slate-400">(${t.note})</span>` : ''}</td>
        </tr>
      `;
    }).join('');
  },

  // =========================================================================
  // IMAGE VIEWER MODAL & PHOTO CAPTURE
  // =========================================================================

  openImageViewerModal(imageUrl, title, subtitle) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    const titleEl = document.getElementById('image-viewer-title');
    const subEl = document.getElementById('image-viewer-subtitle');
    const linkEl = document.getElementById('image-viewer-link');

    if (img) img.src = imageUrl;
    if (titleEl) titleEl.innerHTML = `<span>📸</span> รูปถ่าย: ${title}`;
    if (subEl) subEl.textContent = subtitle ? `บันทึกเมื่อ: ${subtitle}` : '';
    if (linkEl) linkEl.href = imageUrl;

    modal?.classList.remove('hidden');
  },

  closeImageViewerModal() {
    document.getElementById('image-viewer-modal')?.classList.add('hidden');
  },

  // บีบอัดรูปภาพผ่าน Canvas (ลดขนาดเหลือ ~100-200KB เพื่ออัปโหลดได้รวดเร็ว)
  compressImage(file, maxWidth = 1000, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
      };
      reader.onerror = error => reject(error);
    });
  },

  // =========================================================================
  // USER MANAGEMENT & PASSWORD SETTINGS
  // =========================================================================
  
  bindUserManagement() {
    document.getElementById('form-user')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveUserFromModal();
    });

    document.getElementById('form-change-my-password')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitChangeMyPassword();
    });

    document.getElementById('form-admin-reset-pass')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitAdminResetPassword();
    });
  },

  renderUsersTable() {
    const tbody = document.getElementById('settings-users-tbody');
    if (!tbody) return;

    if (!this.users || this.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">ยังไม่มีรายชื่อผู้ใช้งาน</td></tr>`;
      return;
    }

    const currentLoggedIn = AuthManager.getCurrentUser();

    tbody.innerHTML = this.users.map(u => {
      const isMe = currentLoggedIn && currentLoggedIn.username.toLowerCase() === u.username.toLowerCase();
      const isAdminRole = u.role === 'admin';
      const isActive = u.status === 'active';

      const roleBadge = isAdminRole
        ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">🛡️ Admin</span>'
        : '<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">👤 Staff</span>';

      const statusBadge = isActive
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">🟢 ปกติ</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">🔴 ระงับ</span>';

      const deleteBtn = (u.username.toLowerCase() !== 'admin' && !isMe)
        ? `<button onclick="App.confirmDeleteUser('${u.username}')" class="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded text-xs">🗑️ ลบ</button>`
        : '';

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
          <td class="py-3 font-mono font-bold text-slate-800">${u.username} ${isMe ? '<span class="text-xs text-indigo-600 font-sans font-normal">(คุณ)</span>' : ''}</td>
          <td class="py-3 text-slate-700">${u.fullName}</td>
          <td class="py-3 text-center">${roleBadge}</td>
          <td class="py-3 text-center">${statusBadge}</td>
          <td class="py-3 text-center whitespace-nowrap">
            <button onclick="App.openEditUserModal('${u.username}')" class="px-2.5 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-xs mr-1">✏️ แก้ไข</button>
            <button onclick="App.openAdminResetPassModal('${u.username}')" class="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded text-xs mr-1">🔑 รีเซ็ตรหัส</button>
            ${deleteBtn}
          </td>
        </tr>
      `;
    }).join('');
  },

  updateMyAccountInfo() {
    const user = AuthManager.getCurrentUser();
    if (!user) return;
    const uEl = document.getElementById('settings-my-username');
    const fEl = document.getElementById('settings-my-fullname');
    const rEl = document.getElementById('settings-my-role');

    if (uEl) uEl.textContent = user.username;
    if (fEl) fEl.textContent = user.fullName;
    if (rEl) rEl.textContent = user.role === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'พนักงาน (Staff)';
  },

  openAddUserModal() {
    document.getElementById('modal-user-title').textContent = '➕ เพิ่มผู้ใช้งานใหม่';
    document.getElementById('modal-user-username').value = '';
    document.getElementById('modal-user-username').readOnly = false;
    document.getElementById('modal-user-fullname').value = '';
    document.getElementById('modal-user-password').value = '';
    document.getElementById('modal-user-password').required = true;
    document.getElementById('modal-user-pass-hint').textContent = '* สำหรับผู้ใช้ใหม่ กรุณากำหนดรหัสผ่าน';
    document.getElementById('modal-user-role').value = 'staff';
    document.getElementById('modal-user-status').value = 'active';

    document.getElementById('user-modal')?.classList.remove('hidden');
  },

  openEditUserModal(username) {
    const user = this.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return;

    document.getElementById('modal-user-title').textContent = `✏️ แก้ไขผู้ใช้: ${user.username}`;
    document.getElementById('modal-user-username').value = user.username;
    document.getElementById('modal-user-username').readOnly = true;
    document.getElementById('modal-user-fullname').value = user.fullName;
    document.getElementById('modal-user-password').value = '';
    document.getElementById('modal-user-password').required = false;
    document.getElementById('modal-user-pass-hint').textContent = '* เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน';
    document.getElementById('modal-user-role').value = user.role;
    document.getElementById('modal-user-status').value = user.status;

    document.getElementById('user-modal')?.classList.remove('hidden');
  },

  closeUserModal() {
    document.getElementById('user-modal')?.classList.add('hidden');
  },

  async saveUserFromModal() {
    const username = document.getElementById('modal-user-username').value.trim();
    const fullName = document.getElementById('modal-user-fullname').value.trim();
    const password = document.getElementById('modal-user-password').value.trim();
    const role = document.getElementById('modal-user-role').value;
    const status = document.getElementById('modal-user-status').value;

    if (!username || !fullName) {
      this.showToast('กรุณากรอกชื่อผู้ใช้และชื่อ-นามสกุล', 'warning');
      return;
    }

    try {
      this.showLoading(true);
      const res = await ApiService.saveUser({
        username,
        fullName,
        password,
        role,
        status
      });

      this.showToast(res.message || 'บันทึกข้อมูลผู้ใช้สำเร็จ', 'success');
      this.closeUserModal();
      await this.refreshData();
    } catch (err) {
      this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  async confirmDeleteUser(username) {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${username}" ?`)) return;
    try {
      this.showLoading(true);
      const res = await ApiService.deleteUser(username);
      this.showToast(res.message || 'ลบผู้ใช้สำเร็จ', 'success');
      await this.refreshData();
    } catch (err) {
      this.showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  openAdminResetPassModal(username) {
    document.getElementById('reset-pass-target-username').value = username;
    document.getElementById('reset-pass-target-display').textContent = username;
    document.getElementById('reset-pass-new-password').value = '';
    document.getElementById('admin-reset-pass-modal')?.classList.remove('hidden');
  },

  closeAdminResetPassModal() {
    document.getElementById('admin-reset-pass-modal')?.classList.add('hidden');
  },

  async submitAdminResetPassword() {
    const username = document.getElementById('reset-pass-target-username').value;
    const newPassword = document.getElementById('reset-pass-new-password').value.trim();

    if (!newPassword || newPassword.length < 4) {
      this.showToast('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 'warning');
      return;
    }

    try {
      this.showLoading(true);
      const res = await ApiService.changePassword({
        username: username,
        newPassword: newPassword,
        isAdminReset: true
      });

      this.showToast(res.message || `รีเซ็ตรหัสผ่านสำหรับ ${username} สำเร็จ!`, 'success');
      this.closeAdminResetPassModal();
    } catch (err) {
      const msg = (err.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ').replace(/^Error:\s*/i, '');
      this.showToast(msg, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  async submitChangeMyPassword() {
    const user = AuthManager.getCurrentUser();
    if (!user || !user.username) {
      this.showToast('กรุณาเข้าสู่ระบบก่อนเปลี่ยนรหัสผ่าน', 'warning');
      return;
    }

    const oldPassword = document.getElementById('change-old-password').value.trim();
    const newPassword = document.getElementById('change-new-password').value.trim();
    const confirmPassword = document.getElementById('change-confirm-password').value.trim();

    if (!oldPassword) {
      this.showToast('กรุณากรอกรหัสผ่านเดิม', 'warning');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      this.showToast('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showToast('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-change-pass');

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳</span> กำลังบันทึก...';
      }
      this.showLoading(true);

      const res = await ApiService.changePassword({
        username: user.username,
        oldPassword: oldPassword,
        newPassword: newPassword,
        isAdminReset: false
      });

      this.showToast(res.message || 'เปลี่ยนรหัสผ่านสำเร็จ!', 'success');
      document.getElementById('change-old-password').value = '';
      document.getElementById('change-new-password').value = '';
      document.getElementById('change-confirm-password').value = '';
    } catch (err) {
      const msg = (err.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ').replace(/^Error:\s*/i, '');
      this.showToast(msg, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🔐</span> บันทึกรหัสผ่านใหม่';
      }
      this.showLoading(false);
    }
  },

  // =========================================================================
  // POS & PRODUCT ACTIONS (พร้อมระบบถ่ายรูป)
  // =========================================================================

  bindPosActions() {
    const user = AuthManager.getCurrentUser();
    if (user && document.getElementById('pos-operator-input')) {
      document.getElementById('pos-operator-input').value = user.fullName || user.username;
    }

    // จัดการการอัปโหลด/ถ่ายรูปหลักฐาน
    const photoInput = document.getElementById('pos-photo-input');
    const photoPreviewContainer = document.getElementById('pos-photo-preview-container');
    const photoPreviewImg = document.getElementById('pos-photo-preview-img');
    const btnRemovePhoto = document.getElementById('btn-remove-photo');

    if (photoInput) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          this.showLoading(true);
          const base64 = await this.compressImage(file);
          this.currentAttachedPhotoBase64 = base64;
          
          if (photoPreviewImg) photoPreviewImg.src = base64;
          photoPreviewContainer?.classList.remove('hidden');
          btnRemovePhoto?.classList.remove('hidden');
          this.showToast('แนบรูปภาพเรียบร้อยแล้ว', 'success');
        } catch (err) {
          this.showToast('ไม่สามารถประมวลผลรูปภาพได้', 'error');
        } finally {
          this.showLoading(false);
        }
      });
    }

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', () => {
        this.currentAttachedPhotoBase64 = null;
        if (photoInput) photoInput.value = '';
        photoPreviewContainer?.classList.add('hidden');
        btnRemovePhoto.classList.add('hidden');
      });
    }

    // กล้องสแกนเนอร์บาร์โค้ด
    const btnToggleCam = document.getElementById('btn-toggle-camera');
    if (btnToggleCam) {
      btnToggleCam.addEventListener('click', async () => {
        const camContainer = document.getElementById('pos-camera-container');
        if (scannerManager.isScanning) {
          await scannerManager.stopScanner();
          camContainer?.classList.add('hidden');
          btnToggleCam.innerHTML = '<span>📷</span> เปิดกล้องสแกน';
          btnToggleCam.classList.remove('bg-rose-600');
          btnToggleCam.classList.add('bg-indigo-600');
        } else {
          camContainer?.classList.remove('hidden');
          btnToggleCam.innerHTML = '<span>⏹️</span> ปิดกล้องสแกน';
          btnToggleCam.classList.remove('bg-indigo-600');
          btnToggleCam.classList.add('bg-rose-600');
          
          await scannerManager.startScanner('pos-qr-reader', (decodedCode) => {
            this.handleScannedCode(decodedCode);
          });
        }
      });
    }

    const posProductSelect = document.getElementById('pos-product-select');
    if (posProductSelect) {
      posProductSelect.addEventListener('change', (e) => {
        this.updatePosProductInfo(e.target.value);
      });
    }

    // ระบบค้นหาสินค้าความเร็วสูงในหน้ารับเข้า-เบิกจ่าย (Fast Product Search)
    const searchInput = document.getElementById('pos-search-input');
    const clearBtn = document.getElementById('pos-search-clear-btn');
    const dropdown = document.getElementById('pos-search-dropdown');
    const btnChangeProduct = document.getElementById('pos-btn-change-product');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.posSearchKeyword = e.target.value;
        this.renderPosSearchResults();
        if (dropdown) dropdown.classList.remove('hidden');
        if (clearBtn) {
          if (e.target.value.trim().length > 0) {
            clearBtn.classList.remove('hidden');
          } else {
            clearBtn.classList.add('hidden');
          }
        }
      });

      searchInput.addEventListener('focus', () => {
        this.renderPosSearchResults();
        if (dropdown) dropdown.classList.remove('hidden');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearPosSearch(true);
      });
    }

    if (btnChangeProduct) {
      btnChangeProduct.addEventListener('click', () => {
        this.clearPosSearch(true);
      });
    }

    // ปิดดรอปดาวน์ค้นหาเมื่อคลิกนอกพื้นที่
    document.addEventListener('click', (e) => {
      const searchBoxContainer = document.getElementById('pos-search-input')?.closest('.space-y-2');
      if (searchBoxContainer && !searchBoxContainer.contains(e.target)) {
        dropdown?.classList.add('hidden');
      }
    });

    const posTypeSelect = document.getElementById('pos-type-select');
    if (posTypeSelect) {
      posTypeSelect.addEventListener('change', () => {
        const productId = document.getElementById('pos-product-select')?.value;
        const product = this.products.find(p => p.productId === productId);
        const type = posTypeSelect.value;
        const labelEl = document.getElementById('pos-unit-price-label');
        const priceInput = document.getElementById('pos-unit-price-input');
        const priceContainer = document.getElementById('pos-unit-price-container');
        const qtyLabel = document.getElementById('pos-qty-label');
        const qtyInput = document.getElementById('pos-qty-input');

        if (type === 'OUT') {
          if (qtyLabel) qtyLabel.textContent = 'จำนวนขาย';
          if (qtyInput) qtyInput.min = '1';
          if (priceContainer) priceContainer.classList.remove('hidden');
          if (labelEl) labelEl.innerHTML = '<span>ราคาขายจริง/ชิ้น (฿)</span> <span class="text-[10px] text-indigo-600 font-normal">แก้ไขได้</span>';
          if (priceInput && product) priceInput.value = product.salePrice || 0;
        } else if (type === 'IN') {
          if (qtyLabel) qtyLabel.textContent = 'จำนวนรับเข้า';
          if (qtyInput) qtyInput.min = '1';
          if (priceContainer) priceContainer.classList.remove('hidden');
          if (labelEl) labelEl.innerHTML = '<span>ต้นทุนรับเข้า/ชิ้น (฿)</span> <span class="text-[10px] text-emerald-600 font-normal">แก้ไขได้</span>';
          if (priceInput && product) priceInput.value = product.costPrice || 0;
        } else if (type === 'ADJUST') {
          if (qtyLabel) qtyLabel.textContent = 'สต็อกจริงหลังปรับ (ชิ้น)';
          if (qtyInput) {
            qtyInput.min = '0';
            if (product) qtyInput.value = product.currentStock;
          }
          if (priceContainer) priceContainer.classList.add('hidden');
        }
        this.calculatePosLiveProfit();
      });
    }

    ['pos-qty-input', 'pos-unit-price-input'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.calculatePosLiveProfit());
    });

    // ปุ่มเลือกเหตุผลการตัดสต็อกด่วน (ตัวโชว์, ชำรุด/กล่องบุบ, ของแถม, ขายหน้าร้าน, ออนไลน์)
    document.querySelectorAll('.pos-reason-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const reason = pill.dataset.reason;
        const isZeroPrice = pill.dataset.zeroPrice === 'true';

        const noteInput = document.getElementById('pos-note-input');
        if (noteInput) noteInput.value = reason;

        // ไฮไลต์ปุ่มที่เลือก
        document.querySelectorAll('.pos-reason-pill').forEach(p => {
          p.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-100', 'text-indigo-800', 'font-bold');
        });
        pill.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-100', 'text-indigo-800', 'font-bold');

        const priceInput = document.getElementById('pos-unit-price-input');
        const typeSelect = document.getElementById('pos-type-select');
        const prodId = document.getElementById('pos-product-select')?.value;
        const prod = this.products.find(p => p.productId === prodId);

        if (isZeroPrice) {
          if (typeSelect && typeSelect.value !== 'OUT') {
            typeSelect.value = 'OUT';
            typeSelect.dispatchEvent(new Event('change'));
          }
          if (priceInput) priceInput.value = '0';
          this.showToast(`ตัดสต็อก: "${reason}" (ราคา ฿0 ตัดสต็อกเป็นต้นทุน/ค่าใช้จ่ายร้าน)`, 'info');
        } else {
          if (priceInput && prod && (priceInput.value === '0' || !priceInput.value)) {
            priceInput.value = prod.salePrice || 0;
          }
        }
        this.calculatePosLiveProfit();
      });
    });

    document.getElementById('pos-submit-btn')?.addEventListener('click', () => this.submitPosTransaction());
  },

  selectPosProduct(productId) {
    // ซ่อนแบนเนอร์แจ้งเตือนสำเร็จเมื่อเริ่มเลือกสินค้าชิ้นใหม่
    document.getElementById('pos-success-banner')?.classList.add('hidden');

    const select = document.getElementById('pos-product-select');
    const searchInput = document.getElementById('pos-search-input');
    const dropdown = document.getElementById('pos-search-dropdown');
    const clearBtn = document.getElementById('pos-search-clear-btn');

    const product = this.products.find(p => p.productId === productId);
    if (!product) return;

    if (select) {
      select.value = productId;
    }

    if (searchInput) {
      searchInput.value = `[${product.productId}] ${product.productName}`;
    }

    if (clearBtn) {
      clearBtn.classList.remove('hidden');
    }

    if (dropdown) {
      dropdown.classList.add('hidden');
    }

    this.updatePosProductInfo(productId);
  },

  /**
   * ส่งเสียงแจ้งเตือนบันทึกสำเร็จสั้นๆ สไตล์เครื่องสแกนบาร์โค้ด (Web Audio API)
   */
  playSuccessSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.07); // A5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  },

  /**
   * เคลียร์ค่าที่กรอกไว้ในหน้ารับเข้า-เบิกขายทั้งหมด (Clear All POS Fields)
   * เพื่อให้ผู้ใช้ทราบว่าบันทึกแล้ว และเคอร์เซอร์พร้อมสแกน/พิมพ์ชิ้นถัดไปทันที
   */
  clearPosForm(showSuccessAlert = false, summaryText = '') {
    // 1. เคลียร์การเลือกสินค้า
    const searchInput = document.getElementById('pos-search-input');
    const clearBtn = document.getElementById('pos-search-clear-btn');
    const select = document.getElementById('pos-product-select');
    const dropdown = document.getElementById('pos-search-dropdown');
    const infoCard = document.getElementById('pos-product-info-card');
    const liveProfitCard = document.getElementById('pos-live-profit-card');

    if (searchInput) searchInput.value = '';
    this.posSearchKeyword = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (select) select.value = '';
    if (infoCard) infoCard.classList.add('hidden');
    if (liveProfitCard) liveProfitCard.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');

    // 2. เคลียร์จำนวนและราคา
    const qtyInput = document.getElementById('pos-qty-input');
    if (qtyInput) qtyInput.value = '1';

    const priceInput = document.getElementById('pos-unit-price-input');
    if (priceInput) priceInput.value = '';

    // 3. เคลียร์หมายเหตุและปุ่มเหตุผลด่วน
    const noteInput = document.getElementById('pos-note-input');
    if (noteInput) noteInput.value = '';

    document.querySelectorAll('.pos-reason-pill').forEach(p => {
      p.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-100', 'text-indigo-800', 'font-bold');
    });

    // 4. เคลียร์รูปถ่ายหลักฐาน
    this.currentAttachedPhotoBase64 = null;
    const photoInput = document.getElementById('pos-photo-input');
    if (photoInput) photoInput.value = '';
    document.getElementById('pos-photo-preview-container')?.classList.add('hidden');
    document.getElementById('btn-remove-photo')?.classList.add('hidden');

    // 5. แสดงแบนเนอร์ยืนยันบันทึกสำเร็จ (Success Confirmation Banner)
    const banner = document.getElementById('pos-success-banner');
    const bannerDetail = document.getElementById('pos-success-banner-detail');
    if (showSuccessAlert && banner) {
      if (bannerDetail && summaryText) {
        bannerDetail.textContent = summaryText;
      }
      banner.classList.remove('hidden');

      if (this.posSuccessTimeout) clearTimeout(this.posSuccessTimeout);
      this.posSuccessTimeout = setTimeout(() => {
        banner.classList.add('hidden');
      }, 5000);
    }

    // 6. อัปเดตรายการค้นหาให้พร้อม
    this.renderPosSearchResults();

    // 7. นำเคอร์เซอร์ไปโฟกัสที่ช่องค้นหาทันที เพื่อพร้อมสแกน/พิมพ์ชิ้นถัดไป
    setTimeout(() => {
      if (searchInput && this.activeTab === 'pos') {
        searchInput.focus();
      }
    }, 80);
  },

  clearPosSearch(focusInput = true) {
    const searchInput = document.getElementById('pos-search-input');
    const clearBtn = document.getElementById('pos-search-clear-btn');
    const select = document.getElementById('pos-product-select');
    const dropdown = document.getElementById('pos-search-dropdown');
    const infoCard = document.getElementById('pos-product-info-card');
    const liveProfitCard = document.getElementById('pos-live-profit-card');

    if (searchInput) searchInput.value = '';
    this.posSearchKeyword = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (select) select.value = '';
    if (infoCard) infoCard.classList.add('hidden');
    if (liveProfitCard) liveProfitCard.classList.add('hidden');

    this.renderPosSearchResults();
    if (dropdown) dropdown.classList.remove('hidden');
    if (focusInput && searchInput) searchInput.focus();
  },

  renderPosCategoryPills() {
    const container = document.getElementById('pos-category-pills');
    if (!container) return;

    const allCats = ['all', ...(this.categories || [])];
    container.innerHTML = allCats.map(cat => {
      const isSelected = (this.posSelectedCategory || 'all').toLowerCase() === cat.toLowerCase();
      const label = cat === 'all' ? '🌟 ทั้งหมด' : cat;
      const activeClass = isSelected
        ? 'bg-indigo-600 text-white shadow-xs font-bold'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium';
      return `
        <button type="button" 
          onclick="App.setPosCategory('${cat}')" 
          class="px-2.5 py-1 rounded-full whitespace-nowrap transition text-xs ${activeClass}">
          ${label}
        </button>
      `;
    }).join('');
  },

  setPosCategory(cat) {
    this.posSelectedCategory = cat;
    this.renderPosCategoryPills();
    this.renderPosSearchResults();
    const dropdown = document.getElementById('pos-search-dropdown');
    if (dropdown) dropdown.classList.remove('hidden');
  },

  renderPosSearchResults() {
    const dropdown = document.getElementById('pos-search-dropdown');
    const countBadge = document.getElementById('pos-search-count-badge');
    if (!dropdown) return;

    let list = this.products || [];

    // กรองตามหมวดหมู่
    if (this.posSelectedCategory && this.posSelectedCategory.toLowerCase() !== 'all') {
      list = list.filter(p => (p.category || '').toLowerCase() === this.posSelectedCategory.toLowerCase());
    }

    // กรองตามคำค้นหา (ชื่อสินค้า, รหัส, บาร์โค้ด, หมวด)
    const kw = (this.posSearchKeyword || '').trim().toLowerCase();
    if (kw) {
      list = list.filter(p => 
        (p.productName && p.productName.toLowerCase().includes(kw)) ||
        (p.productId && p.productId.toLowerCase().includes(kw)) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(kw)) ||
        (p.category && p.category.toLowerCase().includes(kw))
      );
    }

    if (countBadge) {
      countBadge.textContent = `พบ ${list.length} จาก ${this.products.length} รายการ`;
    }

    if (list.length === 0) {
      dropdown.innerHTML = `
        <div class="p-4 text-center text-slate-400 text-xs">
          <span>🔍 ไม่พบสินค้าที่ตรงกับคำค้นหา</span>
          ${kw ? `<div class="mt-1 text-slate-500 font-mono">"${kw}"</div>` : ''}
        </div>
      `;
      return;
    }

    dropdown.innerHTML = list.map(p => {
      const isLow = this.isProductLowStock(p);
      const stockColor = p.currentStock <= 0 
        ? 'text-rose-600 font-bold' 
        : isLow 
        ? 'text-amber-600 font-bold' 
        : 'text-slate-600 font-medium';
      
      const stockBadge = p.currentStock <= 0
        ? '<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">หมด (0)</span>'
        : isLow
        ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">ใกล้หมด</span>`
        : '';

      const isAdmin = AuthManager.isAdmin();
      const costBadge = (isAdmin && p.costPrice !== undefined)
        ? `<span class="text-slate-400 text-[11px]">(ทุน ฿${Number(p.costPrice).toLocaleString()})</span>`
        : '';

      return `
        <div onclick="App.selectPosProduct('${p.productId}')"
          class="p-2.5 hover:bg-indigo-50 cursor-pointer flex items-center justify-between transition group">
          <div class="flex-1 min-w-0 pr-2">
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-xs font-bold text-indigo-600 group-hover:text-indigo-800">${p.productId}</span>
              <span class="font-medium text-xs text-slate-800 truncate group-hover:text-indigo-950">${p.productName}</span>
              ${stockBadge}
            </div>
            <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
              <span class="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">${p.category || 'ทั่วไป'}</span>
              <span>ราคาขาย <b>฿${Number(p.salePrice || 0).toLocaleString()}</b></span>
              ${costBadge}
            </div>
          </div>
          <div class="text-right whitespace-nowrap">
            <div class="text-xs ${stockColor}">
              ${p.currentStock} ${p.unit || 'ชิ้น'}
            </div>
            <button type="button" class="mt-0.5 px-2 py-0.5 bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-700 rounded text-[10px] font-semibold transition">
              เลือก
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  handleScannedCode(code) {
    if (!code) return;
    const cleanCode = String(code).trim().toLowerCase();
    const found = this.products.find(p => 
      (p.productId && p.productId.toLowerCase() === cleanCode) ||
      (p.barcode && String(p.barcode).trim().toLowerCase() === cleanCode)
    );
    if (found) {
      this.selectPosProduct(found.productId);
      this.showToast(`สแกนพบ: ${found.productName}`, 'success');
    } else {
      this.showToast(`ไม่พบรหัสสินค้าหรือบาร์โค้ด: ${code}`, 'warning');
    }
  },

  updatePosProductInfo(productId) {
    const product = this.products.find(p => p.productId === productId);
    const infoCard = document.getElementById('pos-product-info-card');
    if (!product || !infoCard) {
      infoCard?.classList.add('hidden');
      return;
    }

    infoCard.classList.remove('hidden');
    document.getElementById('pos-info-name').textContent = product.productName;
    document.getElementById('pos-info-stock').textContent = `${product.currentStock} ${product.unit}`;
    document.getElementById('pos-info-cost').textContent = `฿${(product.costPrice || 0).toLocaleString()}`;
    document.getElementById('pos-info-sale').textContent = `฿${(product.salePrice || 0).toLocaleString()}`;

    // ใส่ราคาตามประเภทรายการอัตโนมัติ (แต่ผู้ใช้แก้ได้)
    const type = document.getElementById('pos-type-select')?.value || 'OUT';
    const priceInput = document.getElementById('pos-unit-price-input');
    const labelEl = document.getElementById('pos-unit-price-label');
    const priceContainer = document.getElementById('pos-unit-price-container');
    const qtyLabel = document.getElementById('pos-qty-label');
    const qtyInput = document.getElementById('pos-qty-input');

    if (type === 'OUT') {
      if (qtyLabel) qtyLabel.textContent = 'จำนวนขาย';
      if (qtyInput) qtyInput.min = '1';
      if (priceContainer) priceContainer.classList.remove('hidden');
      if (priceInput) priceInput.value = product.salePrice || 0;
      if (labelEl) labelEl.innerHTML = '<span>ราคาขายจริง/ชิ้น (฿)</span> <span class="text-[10px] text-indigo-600 font-normal">แก้ไขได้</span>';
    } else if (type === 'IN') {
      if (qtyLabel) qtyLabel.textContent = 'จำนวนรับเข้า';
      if (qtyInput) qtyInput.min = '1';
      if (priceContainer) priceContainer.classList.remove('hidden');
      if (priceInput) priceInput.value = product.costPrice || 0;
      if (labelEl) labelEl.innerHTML = '<span>ต้นทุนรับเข้า/ชิ้น (฿)</span> <span class="text-[10px] text-emerald-600 font-normal">แก้ไขได้</span>';
    } else if (type === 'ADJUST') {
      if (qtyLabel) qtyLabel.textContent = 'สต็อกจริงหลังปรับ (ชิ้น)';
      if (qtyInput) {
        qtyInput.min = '0';
        qtyInput.value = product.currentStock;
      }
      if (priceContainer) priceContainer.classList.add('hidden');
    }

    this.calculatePosLiveProfit();
  },

  calculatePosLiveProfit() {
    const productId = document.getElementById('pos-product-select')?.value;
    const type = document.getElementById('pos-type-select')?.value;
    const qty = Number(document.getElementById('pos-qty-input')?.value) || 0;
    const priceInputVal = document.getElementById('pos-unit-price-input')?.value;
    const hasCustomPrice = priceInputVal !== undefined && priceInputVal !== null && priceInputVal.trim() !== '' && !isNaN(Number(priceInputVal));
    const customPrice = hasCustomPrice ? Number(priceInputVal) : null;
    const liveProfitCard = document.getElementById('pos-live-profit-card');

    if (!liveProfitCard || !AuthManager.isAdmin()) return;

    const product = this.products.find(p => p.productId === productId);
    if (!product || qty <= 0 || type !== 'OUT') {
      liveProfitCard.classList.add('hidden');
      return;
    }

    liveProfitCard.classList.remove('hidden');
    
    // ใช้ราคาขายจริงที่กรอกในฟอร์ม (รองรับราคา 0 บาท สำหรับของตัวโชว์/ชำรุด)
    const actualSalePrice = (customPrice !== null && customPrice >= 0) ? customPrice : (product.salePrice || 0);
    const revenue = qty * actualSalePrice;
    const cost = qty * (product.costPrice || 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

    document.getElementById('pos-live-rev').textContent = `฿${revenue.toLocaleString()}`;
    document.getElementById('pos-live-cost').textContent = `฿${cost.toLocaleString()}`;
    const elProfit = document.getElementById('pos-live-profit');
    elProfit.textContent = `${profit >= 0 ? '+' : ''}฿${profit.toLocaleString()} (${margin}%)`;
    elProfit.className = profit >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold';
  },

  async submitPosTransaction() {
    const user = AuthManager.getCurrentUser();
    const productId = document.getElementById('pos-product-select')?.value;
    const type = document.getElementById('pos-type-select')?.value;
    const qty = Number(document.getElementById('pos-qty-input')?.value) || 0;
    const priceInputVal = document.getElementById('pos-unit-price-input')?.value;
    const hasCustomPrice = priceInputVal !== undefined && priceInputVal !== null && priceInputVal.trim() !== '' && !isNaN(Number(priceInputVal));
    const customPrice = hasCustomPrice ? Number(priceInputVal) : null;
    const operator = document.getElementById('pos-operator-input')?.value || (user ? user.fullName : 'Staff');
    const note = document.getElementById('pos-note-input')?.value || '';

    if (!productId) {
      this.showToast('กรุณาเลือกสินค้า', 'warning');
      return;
    }
    if (type === 'ADJUST') {
      if (isNaN(qty) || qty < 0) {
        this.showToast('กรุณาระบุจำนวนสต็อกที่ปรับเป็น 0 หรือมากกว่า', 'warning');
        return;
      }
    } else {
      if (isNaN(qty) || qty <= 0) {
        this.showToast('กรุณาระบุจำนวนที่มากกว่า 0', 'warning');
        return;
      }
    }

    const product = this.products.find(p => p.productId === productId);

    try {
      if (type === 'OUT' && typeof OptimisticEngine !== 'undefined') {
        await OptimisticEngine.executeStockOut({
          productId,
          quantity: qty,
          customPrice,
          operator,
          note,
          imageBase64: this.currentAttachedPhotoBase64
        });
      } else if (type === 'IN' && typeof OptimisticEngine !== 'undefined') {
        await OptimisticEngine.executeStockIn({
          productId,
          quantity: qty,
          costPrice: (customPrice !== null && customPrice >= 0) ? customPrice : (product ? product.costPrice : undefined),
          operator,
          note,
          imageBase64: this.currentAttachedPhotoBase64
        });
      } else {
        // Fallback or ADJUST
        this.showLoading(true);
        const res = await ApiService.addTransaction({
          productId,
          type,
          quantity: qty,
          salePrice: (type === 'OUT' && customPrice !== null && customPrice >= 0) ? customPrice : (product ? product.salePrice : undefined),
          costPrice: (type === 'IN' && customPrice !== null && customPrice >= 0) ? customPrice : (product ? product.costPrice : undefined),
          operator,
          note,
          role: (user && user.role) ? user.role : 'staff',
          imageBase64: this.currentAttachedPhotoBase64
        });
        this.showToast(res.message || 'บันทึกรายการสำเร็จ!', 'success');
        await this.refreshData();
      }

      // Synchronize this.products reference with window.appStore
      if (window.appStore) {
        this.products = window.appStore.state.products;
        this.transactions = window.appStore.state.transactions;
        this.summary = window.appStore.state.summary;
      }

      const prodName = product ? product.productName : productId;
      const prodId = product ? product.productId : productId;
      const typeLabel = type === 'OUT' ? '📤 เบิกขาย' : (type === 'IN' ? '📥 รับเข้า' : '⚙️ ปรับยอด');
      const summaryText = `${typeLabel} ${qty} ชิ้น: [${prodId}] ${prodName} เรียบร้อยแล้ว`;

      // แสดงการตอบรับทางสายตาที่ปุ่มบันทึก (Button Visual Feedback)
      const submitBtn = document.getElementById('pos-submit-btn');
      if (submitBtn) {
        const originalHtml = submitBtn.innerHTML;
        submitBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        submitBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
        submitBtn.innerHTML = '<span>🎉</span> บันทึกสำเร็จเรียบร้อย!';
        setTimeout(() => {
          submitBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
          submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
          submitBtn.innerHTML = originalHtml;
        }, 1200);
      }

      // เล่นเสียงยืนยันสั้นๆ สไตล์เครื่องสแกนบาร์โค้ด (Web Audio API)
      this.playSuccessSound();

      // เคลียร์ค่าที่กรอกไว้ทั้งหมดทันที และแสดงแบนเนอร์ยืนยันสีเขียวด้านบน
      this.clearPosForm(true, summaryText);
      this.updateSyncUI();
    } catch (err) {
      this.showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  isProductLowStock(p) {
    if (!p) return false;
    if (p.minAlert === -1 || p.minAlert === '-1' || p.isAlertEnabled === false) return false;
    const threshold = (p.minAlert !== undefined && p.minAlert !== null && p.minAlert !== '') ? Number(p.minAlert) : 5;
    if (isNaN(threshold) || threshold < 0) return false;
    return (Number(p.currentStock) || 0) <= threshold;
  },

  getNextProductId() {
    let maxNum = 0;
    (this.products || []).forEach(p => {
      const match = String(p.productId || '').trim().match(/^TOY-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
    let nextNum = maxNum + 1;
    const existingIds = new Set((this.products || []).map(p => String(p.productId || '').toLowerCase().trim()));
    while (existingIds.has(('TOY-' + String(nextNum).padStart(3, '0')).toLowerCase())) {
      nextNum++;
    }
    return 'TOY-' + String(nextNum).padStart(3, '0');
  },

  bindModals() {
    ['modal-product-cost', 'modal-product-sale'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const cost = Number(document.getElementById('modal-product-cost')?.value) || 0;
        const sale = Number(document.getElementById('modal-product-sale')?.value) || 0;
        const profit = sale - cost;
        const margin = sale > 0 ? ((profit / sale) * 100).toFixed(1) : '0.0';

        const previewEl = document.getElementById('modal-profit-preview');
        if (previewEl) {
          previewEl.textContent = `กำไร: ฿${profit.toLocaleString()} (${margin}%)`;
          previewEl.className = profit >= 0 ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-rose-600';
        }
      });
    });

    const idInput = document.getElementById('modal-product-id');
    const idWarning = document.getElementById('modal-product-id-warning');
    if (idInput && idWarning) {
      idInput.addEventListener('input', (e) => {
        if (idInput.readOnly) {
          idWarning.classList.add('hidden');
          return;
        }
        const val = e.target.value.trim().toLowerCase();
        if (!val) {
          idWarning.classList.add('hidden');
          idInput.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
          return;
        }
        const dup = this.products.find(p => p.productId.toLowerCase() === val);
        if (dup) {
          idWarning.textContent = `⚠️ รหัสนี้ถูกใช้งานแล้วโดย: ${dup.productName}`;
          idWarning.classList.remove('hidden');
          idInput.classList.add('border-rose-500', 'ring-1', 'ring-rose-500');
        } else {
          idWarning.classList.add('hidden');
          idInput.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
        }
      });
    }

    const alertToggle = document.getElementById('modal-product-alert-toggle');
    const minAlertInput = document.getElementById('modal-product-minalert');
    if (alertToggle && minAlertInput) {
      alertToggle.addEventListener('change', () => {
        if (alertToggle.checked) {
          minAlertInput.disabled = false;
          if (Number(minAlertInput.value) < 0) minAlertInput.value = '5';
          minAlertInput.classList.remove('opacity-50', 'bg-slate-100');
        } else {
          minAlertInput.disabled = true;
          minAlertInput.classList.add('opacity-50', 'bg-slate-100');
        }
      });
    }

    document.getElementById('product-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveProductFromModal();
    });
  },

  openAddProductModal() {
    document.getElementById('modal-product-title').textContent = '➕ เพิ่มสินค้าใหม่';
    const idInput = document.getElementById('modal-product-id');
    idInput.value = this.getNextProductId();
    idInput.readOnly = false;
    idInput.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
    document.getElementById('modal-product-id-warning')?.classList.add('hidden');
    document.getElementById('modal-product-name').value = '';
    document.getElementById('modal-product-category').value = this.categories[0] || 'Art Toy / กล่องสุ่ม';
    document.getElementById('modal-product-unit').value = 'ชิ้น';
    document.getElementById('modal-product-cost').value = '0';
    document.getElementById('modal-product-sale').value = '0';
    document.getElementById('modal-product-stock').value = '0';
    
    const alertToggle = document.getElementById('modal-product-alert-toggle');
    if (alertToggle) alertToggle.checked = true;
    const alertInput = document.getElementById('modal-product-minalert');
    if (alertInput) {
      alertInput.value = '5';
      alertInput.disabled = false;
      alertInput.classList.remove('opacity-50', 'bg-slate-100');
    }

    document.getElementById('modal-profit-preview').textContent = 'กำไร: ฿0 (0.0%)';
    document.getElementById('product-modal')?.classList.remove('hidden');
  },

  openEditProductModal(productId) {
    const product = this.products.find(p => p.productId === productId);
    if (!product) return;

    document.getElementById('modal-product-title').textContent = '✏️ แก้ไขสินค้า';
    const idInput = document.getElementById('modal-product-id');
    idInput.value = product.productId;
    idInput.readOnly = true;
    idInput.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500');
    document.getElementById('modal-product-id-warning')?.classList.add('hidden');
    document.getElementById('modal-product-name').value = product.productName;
    document.getElementById('modal-product-category').value = product.category;
    document.getElementById('modal-product-unit').value = product.unit;
    document.getElementById('modal-product-cost').value = product.costPrice;
    document.getElementById('modal-product-sale').value = product.salePrice;
    document.getElementById('modal-product-stock').value = product.currentStock;

    const isAlertDisabled = (product.minAlert === -1 || product.minAlert === '-1' || product.isAlertEnabled === false);
    const alertToggle = document.getElementById('modal-product-alert-toggle');
    if (alertToggle) alertToggle.checked = !isAlertDisabled;
    const alertInput = document.getElementById('modal-product-minalert');
    if (alertInput) {
      alertInput.value = isAlertDisabled ? '0' : ((product.minAlert !== undefined && product.minAlert !== null) ? product.minAlert : '5');
      alertInput.disabled = isAlertDisabled;
      if (isAlertDisabled) {
        alertInput.classList.add('opacity-50', 'bg-slate-100');
      } else {
        alertInput.classList.remove('opacity-50', 'bg-slate-100');
      }
    }

    const profit = product.salePrice - product.costPrice;
    const margin = product.salePrice > 0 ? ((profit / product.salePrice) * 100).toFixed(1) : '0.0';
    document.getElementById('modal-profit-preview').textContent = `กำไร: ฿${profit.toLocaleString()} (${margin}%)`;

    document.getElementById('product-modal')?.classList.remove('hidden');
  },

  closeProductModal() {
    document.getElementById('product-modal')?.classList.add('hidden');
  },

  async saveProductFromModal() {
    const productId = document.getElementById('modal-product-id').value.trim();
    const productName = document.getElementById('modal-product-name').value.trim();
    const category = document.getElementById('modal-product-category').value.trim();
    const unit = document.getElementById('modal-product-unit').value.trim();
    const costPrice = Number(document.getElementById('modal-product-cost').value) || 0;
    const salePrice = Number(document.getElementById('modal-product-sale').value) || 0;
    const initialStock = Number(document.getElementById('modal-product-stock').value) || 0;

    const isAlertEnabled = document.getElementById('modal-product-alert-toggle')?.checked !== false;
    let minAlert = 5;
    if (!isAlertEnabled) {
      minAlert = -1;
    } else {
      const minVal = document.getElementById('modal-product-minalert')?.value;
      minAlert = (minVal !== undefined && minVal !== null && minVal.trim() !== '') ? Number(minVal) : 5;
    }

    if (!productId || !productName) {
      this.showToast('กรุณากรอกรหัสและชื่อสินค้า', 'warning');
      return;
    }

    const isEdit = document.getElementById('modal-product-id').readOnly;
    if (!isEdit) {
      const dup = this.products.find(p => p.productId.toLowerCase() === productId.toLowerCase());
      if (dup) {
        this.showToast(`รหัสสินค้า "${productId}" ซ้ำกับสินค้า "${dup.productName}" ที่มีอยู่แล้ว! กรุณาเปลี่ยนรหัสใหม่เพื่อป้องกันการบันทึกทับ`, 'error');
        const warnEl = document.getElementById('modal-product-id-warning');
        if (warnEl) {
          warnEl.textContent = `⚠️ รหัสนี้ถูกใช้แล้วโดย: ${dup.productName}`;
          warnEl.classList.remove('hidden');
        }
        return;
      }
    }

    const existingProduct = isEdit ? this.products.find(p => p.productId.toLowerCase() === productId.toLowerCase()) : null;
    const isStockChanged = existingProduct && existingProduct.currentStock !== initialStock;

    try {
      this.showLoading(true);
      const res = await ApiService.saveProduct({
        productId,
        productName,
        category,
        unit,
        costPrice,
        salePrice,
        initialStock,
        minAlert,
        updateStock: !isEdit || isStockChanged
      });

      this.showToast(res.message || 'บันทึกสินค้าสำเร็จ!', 'success');
      this.closeProductModal();

      const savedProd = {
        productId,
        productName,
        category,
        unit,
        costPrice,
        salePrice,
        currentStock: (!isEdit || isStockChanged) ? initialStock : (existingProduct ? existingProduct.currentStock : initialStock),
        minAlert,
        isAlertEnabled: minAlert !== -1
      };
      if (window.appStore) {
        const idx = window.appStore.state.products.findIndex(p => p.productId === productId);
        if (idx !== -1) {
          window.appStore.state.products[idx] = { ...window.appStore.state.products[idx], ...savedProd };
        } else {
          window.appStore.state.products.push(savedProd);
        }
        window.appStore.broadcast('PRODUCT_UPDATED', savedProd);
      }

      await this.refreshData();
    } catch (err) {
      this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  async muteProductAlert(productId) {
    const product = this.products.find(p => p.productId === productId);
    if (!product) return;

    if (!confirm(`ต้องการปิดการแจ้งเตือนสต็อกใกล้หมดสำหรับสินค้า "${product.productName}" ใช่หรือไม่?`)) {
      return;
    }

    try {
      if (typeof OptimisticEngine !== 'undefined' && OptimisticEngine.executeMuteAlert) {
        await OptimisticEngine.executeMuteAlert(productId);
      } else {
        this.showLoading(true);
        await ApiService.muteProductAlert(productId);
        this.showToast(`🔕 ปิดการแจ้งเตือนสำหรับ "${product.productName}" แล้ว`, 'info');
        await this.refreshData();
      }
    } catch (err) {
      this.showToast('ไม่สามารถปิดการเตือนได้: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  async confirmDeleteProduct(productId) {
    if (!confirm(`คุณต้องการลบสินค้ารหัส ${productId} ใช่หรือไม่?`)) return;
    try {
      this.showLoading(true);
      const res = await ApiService.deleteProduct(productId);
      this.showToast(res.message || 'ลบสินค้าสำเร็จ', 'success');
      if (window.appStore) {
        const idx = window.appStore.state.products.findIndex(p => p.productId === productId);
        if (idx !== -1) window.appStore.state.products.splice(idx, 1);
        window.appStore.recalculateSummary();
      }
      await this.refreshData();
    } catch (err) {
      this.showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  openQuickTransModal(productId, type) {
    this.switchTab('pos');
    const typeSelect = document.getElementById('pos-type-select');
    if (typeSelect && type) {
      typeSelect.value = type;
      typeSelect.dispatchEvent(new Event('change'));
    }
    this.selectPosProduct(productId);
  },

  populateCategoryDropdowns() {
    const modalCatSelect = document.getElementById('modal-product-category');
    if (modalCatSelect) {
      modalCatSelect.innerHTML = this.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    const posSelect = document.getElementById('pos-product-select');
    if (posSelect) {
      posSelect.innerHTML = '<option value="">-- เลือกหรือสแกนสินค้า --</option>' + 
        this.products.map(p => `<option value="${p.productId}">[${p.productId}] ${p.productName} (คงเหลือ: ${p.currentStock} ${p.unit})</option>`).join('');
    }

    this.renderPosCategoryPills();
    this.renderPosSearchResults();
  },

  bindSettings() {
    const inputUrl = document.getElementById('settings-api-url');
    if (inputUrl) {
      inputUrl.value = getApiUrl();
    }

    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      const url = document.getElementById('settings-api-url')?.value || '';
      setApiUrl(url);
      this.updateConnectionStatus();
      this.showToast('บันทึกการตั้งค่าแล้ว กำลังรีเฟรชข้อมูล...', 'success');
      await this.refreshData();
    });

    document.getElementById('btn-init-sheets')?.addEventListener('click', async () => {
      if (!getApiUrl()) {
        this.showToast('กรุณาระบุ Web App URL ก่อนกดสร้างตาราง', 'warning');
        return;
      }
      try {
        this.showLoading(true);
        const res = await ApiService.initGoogleSheet();
        this.showToast(res.message || 'สร้าง/ซิงค์ตารางใน Google Sheets สำเร็จ!', 'success');
        await this.refreshData();
      } catch (err) {
        this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
      } finally {
        this.showLoading(false);
      }
    });
  },

  // =========================================================================
  // PWA 2.0 & BACKGROUND SYNC (OFFLINE RESILIENCE)
  // =========================================================================

  bindPwaAndSync() {
    const btnInstall = document.getElementById('btn-install-pwa');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (btnInstall) btnInstall.classList.remove('hidden');
    });

    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            this.showToast('ขอบคุณที่ติดตั้งแอป Lebon Toy!', 'success');
          }
          this.deferredPrompt = null;
          btnInstall.classList.add('hidden');
        } else {
          this.showToast('สามารถติดตั้งแอปได้โดยเลือก "เพิ่มไปยังหน้าจอโฮม" ในเมนูของเบราว์เซอร์', 'info');
        }
      });
    }

    window.addEventListener('appinstalled', () => {
      this.showToast('ติดตั้งแอปพลิเคชัน Lebon Toy เรียบร้อยแล้ว!', 'success');
      if (btnInstall) btnInstall.classList.add('hidden');
      this.deferredPrompt = null;
    });

    // ตรวจจับสถานะการเชื่อมต่ออินเทอร์เน็ต
    window.addEventListener('online', () => {
      this.showToast('🟢 เชื่อมต่ออินเทอร์เน็ตแล้ว ระบบกำลังซิงค์ข้อมูล...', 'success');
      this.updateSyncUI();
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.showToast('🔴 การเชื่อมต่อหลุด (ทำงานแบบออฟไลน์ บันทึกข้อมูลในเครื่องอัตโนมัติ)', 'warning');
      this.updateSyncUI();
    });
  },

  updateSyncUI() {
    const queue = ApiService.getPendingQueue();
    const count = queue.length;
    const btnSync = document.getElementById('btn-sync-now');
    const syncCountEl = document.getElementById('sync-count');
    const badge = document.getElementById('connection-status-badge');

    if (syncCountEl) syncCountEl.textContent = count;
    if (btnSync) {
      if (count > 0) {
        btnSync.classList.remove('hidden');
      } else {
        btnSync.classList.add('hidden');
      }
    }

    if (badge) {
      if (!navigator.onLine) {
        badge.innerHTML = '🔴 ออฟไลน์ (บันทึกลงเครื่อง)';
        badge.className = 'hidden sm:inline-block px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full text-xs font-medium';
      } else if (count > 0) {
        badge.innerHTML = `🟡 รอซิงค์ (${count})`;
        badge.className = 'hidden sm:inline-block px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-medium cursor-pointer';
      } else if (isOnlineMode()) {
        badge.innerHTML = '🟢 เชื่อมต่อ Google Sheets แล้ว';
        badge.className = 'hidden sm:inline-block px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-medium';
      } else {
        badge.innerHTML = '🟡 โหมดทดลอง (Demo)';
        badge.className = 'hidden sm:inline-block px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-medium';
      }
    }
  },

  async syncOfflineData() {
    if (!navigator.onLine) {
      this.showToast('ขณะนี้ยังออฟไลน์อยู่ ไม่สามารถซิงค์ขึ้นชีตได้', 'warning');
      return;
    }

    const btnSync = document.getElementById('btn-sync-now');
    const prevHtml = btnSync ? btnSync.innerHTML : '';
    if (btnSync) {
      btnSync.innerHTML = '<span class="animate-spin text-sm">🔄</span> กำลังซิงค์...';
    }

    try {
      const res = await ApiService.syncOfflineQueue();
      if (res.synced > 0) {
        this.showToast(`ซิงค์ข้อมูลขึ้น Google Sheets สำเร็จ ${res.synced} รายการ!`, 'success');
        await this.refreshData();
      } else if (res.remaining === 0) {
        this.showToast('ไม่มีรายการค้างซิงค์ ข้อมูลล่าสุดสมบูรณ์แล้ว', 'info');
      } else if (res.error) {
        this.showToast('การซิงค์มีข้อขัดข้อง: ' + res.error, 'warning');
      }
    } catch (err) {
      this.showToast('เกิดข้อผิดพลาดในการซิงค์: ' + err.message, 'error');
    } finally {
      if (btnSync) btnSync.innerHTML = prevHtml;
      this.updateSyncUI();
    }
  },

  // =========================================================================
  // BATCH STOCK IN (รับเข้าล็อตใหญ่ในบิลเดียว)
  // =========================================================================

  openBatchInModal() {
    const noteEl = document.getElementById('batch-invoice-note');
    if (noteEl) noteEl.value = '';
    this.clearBatchReceipt();

    // เริ่มต้นให้มี 3 แถวเพื่อความสะดวกในการกรอก
    this.batchRows = [
      { productId: '', qty: 1, costPrice: 0 },
      { productId: '', qty: 1, costPrice: 0 },
      { productId: '', qty: 1, costPrice: 0 }
    ];
    this.renderBatchRows();
    document.getElementById('batch-in-modal')?.classList.remove('hidden');
  },

  closeBatchInModal() {
    document.getElementById('batch-in-modal')?.classList.add('hidden');
  },

  addBatchRow() {
    this.batchRows.push({ productId: '', qty: 1, costPrice: 0 });
    this.renderBatchRows();
  },

  removeBatchRow(index) {
    if (this.batchRows.length <= 1) {
      this.batchRows = [{ productId: '', qty: 1, costPrice: 0 }];
    } else {
      this.batchRows.splice(index, 1);
    }
    this.renderBatchRows();
  },

  updateBatchRow(index, field, value) {
    if (!this.batchRows[index]) return;
    if (field === 'productId') {
      this.batchRows[index].productId = value;
      const product = this.products.find(p => p.productId === value);
      if (product) {
        this.batchRows[index].costPrice = product.costPrice || 0;
        const costInput = document.getElementById(`batch-cost-${index}`);
        if (costInput) costInput.value = product.costPrice || 0;
      }
    } else if (field === 'qty') {
      this.batchRows[index].qty = Math.max(1, Number(value) || 1);
    } else if (field === 'costPrice') {
      this.batchRows[index].costPrice = Math.max(0, Number(value) || 0);
    }

    const row = this.batchRows[index];
    const subtotal = (row.qty || 0) * (row.costPrice || 0);
    const subtotalEl = document.getElementById(`batch-subtotal-${index}`);
    if (subtotalEl) {
      subtotalEl.textContent = `฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    this.updateBatchSummary();
  },

  renderBatchRows() {
    const container = document.getElementById('batch-items-list');
    if (!container) return;

    container.innerHTML = this.batchRows.map((row, idx) => {
      const subtotal = (row.qty || 0) * (row.costPrice || 0);
      return `
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 bg-slate-50 hover:bg-indigo-50/30 rounded-xl border border-slate-200/80 items-center text-xs transition">
          <div class="col-span-12 sm:col-span-5">
            <label class="block sm:hidden text-[10px] font-bold text-slate-500 mb-0.5">สินค้า:</label>
            <select id="batch-product-${idx}" onchange="App.updateBatchRow(${idx}, 'productId', this.value)"
              class="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option value="">-- เลือกสินค้า --</option>
              ${this.products.map(p => `
                <option value="${p.productId}" ${p.productId === row.productId ? 'selected' : ''}>
                  ${p.productId} — ${p.productName} (สต็อก: ${p.currentStock})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="col-span-6 sm:col-span-2">
            <label class="block sm:hidden text-[10px] font-bold text-slate-500 mb-0.5">จำนวนรับ:</label>
            <input type="number" min="1" value="${row.qty}" id="batch-qty-${idx}"
              oninput="App.updateBatchRow(${idx}, 'qty', this.value)"
              placeholder="จำนวน"
              class="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-right focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          </div>

          <div class="col-span-6 sm:col-span-2">
            <label class="block sm:hidden text-[10px] font-bold text-slate-500 mb-0.5">ต้นทุนใหม่ (฿):</label>
            <input type="number" min="0" step="0.01" value="${row.costPrice}" id="batch-cost-${idx}"
              oninput="App.updateBatchRow(${idx}, 'costPrice', this.value)"
              placeholder="ต้นทุน/ชิ้น"
              class="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-right focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          </div>

          <div class="col-span-10 sm:col-span-2 text-right font-bold text-slate-700 py-1">
            <span class="inline sm:hidden text-[10px] text-slate-400 font-normal">รวม: </span>
            <span id="batch-subtotal-${idx}" class="text-indigo-600">฿${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          <div class="col-span-2 sm:col-span-1 text-center">
            <button type="button" onclick="App.removeBatchRow(${idx})" title="ลบรายการนี้"
              class="w-8 h-8 rounded-lg text-rose-500 hover:text-white hover:bg-rose-500 transition flex items-center justify-center font-bold text-sm mx-auto">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.updateBatchSummary();
  },

  updateBatchSummary() {
    const validRows = this.batchRows.filter(r => r.productId && r.qty > 0);
    const totalItems = validRows.length;
    const totalQty = validRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    const totalCost = validRows.reduce((sum, r) => sum + ((Number(r.qty) || 0) * (Number(r.costPrice) || 0)), 0);

    const itemsEl = document.getElementById('batch-summary-items');
    const qtyEl = document.getElementById('batch-summary-qty');
    const costEl = document.getElementById('batch-summary-cost');

    if (itemsEl) itemsEl.textContent = totalItems.toString();
    if (qtyEl) qtyEl.textContent = totalQty.toLocaleString();
    if (costEl) costEl.textContent = `฿${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  async handleBatchReceiptSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      this.showLoading(true);
      const base64 = await this.compressImage(file);
      this.batchReceiptBase64 = base64;
      const previewEl = document.getElementById('batch-receipt-preview');
      const wrapEl = document.getElementById('batch-receipt-preview-wrap');
      const labelEl = document.getElementById('batch-receipt-btn-label');

      if (previewEl) previewEl.src = base64;
      if (wrapEl) wrapEl.classList.remove('hidden');
      if (labelEl) labelEl.textContent = 'เปลี่ยนรูปใบเสร็จ';
      this.showToast('แนบรูปถ่ายใบเสร็จบิลรวมเรียบร้อย', 'success');
    } catch (err) {
      this.showToast('ไม่สามารถประมวลผลรูปภาพได้: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  clearBatchReceipt() {
    this.batchReceiptBase64 = null;
    const fileInput = document.getElementById('batch-receipt-input');
    const wrapEl = document.getElementById('batch-receipt-preview-wrap');
    const labelEl = document.getElementById('batch-receipt-btn-label');
    if (fileInput) fileInput.value = '';
    if (wrapEl) wrapEl.classList.add('hidden');
    if (labelEl) labelEl.textContent = 'เลือกรูปถ่ายใบเสร็จ';
  },

  async submitBatchInTransaction() {
    const validRows = this.batchRows.filter(r => r.productId && Number(r.qty) > 0);
    if (validRows.length === 0) {
      this.showToast('กรุณาเลือกสินค้าและระบุจำนวนอย่างน้อย 1 รายการ', 'warning');
      return;
    }

    const note = document.getElementById('batch-invoice-note')?.value || '';
    const user = AuthManager.getCurrentUser();
    const operator = (user ? user.fullName || user.username : 'Admin');
    const role = (user && user.role) ? user.role : 'admin';

    const items = validRows.map(r => ({
      productId: r.productId,
      quantity: Number(r.qty),
      costPrice: Number(r.costPrice) || 0
    }));

    try {
      this.showLoading(true);
      const res = await ApiService.batchAddTransactions({
        items: items,
        invoiceNote: note,
        imageBase64: this.batchReceiptBase64,
        operator: operator,
        role: role
      });

      this.showToast(res.message || `บันทึกรับเข้าสำเร็จ ${items.length} รายการ!`, 'success');
      this.closeBatchInModal();
      this.updateSyncUI();
      await this.refreshData();
    } catch (err) {
      this.showToast('เกิดข้อผิดพลาดในการรับเข้าล็อตใหญ่: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  updateConnectionStatus() {
    const badge = document.getElementById('connection-status-badge');
    if (!badge) return;

    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      badge.innerHTML = '⚡ Supabase Cloud DB (Ultra-Fast)';
      badge.className = 'hidden sm:inline-block px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-semibold';
    } else if (isOnlineMode()) {
      badge.innerHTML = '🟢 เชื่อมต่อ Google Sheets แล้ว';
      badge.className = 'hidden sm:inline-block px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-medium';
    } else {
      badge.innerHTML = '🟡 โหมดทดลอง (Demo)';
      badge.className = 'hidden sm:inline-block px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-medium';
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      warning: 'bg-amber-500 text-white',
      info: 'bg-indigo-600 text-white'
    };

    const toast = document.createElement('div');
    toast.className = `${colors[type] || colors.info} px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 50);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  showLoading(show) {
    const spinner = document.getElementById('global-loading-spinner');
    if (spinner) {
      if (show) spinner.classList.remove('hidden');
      else spinner.classList.add('hidden');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

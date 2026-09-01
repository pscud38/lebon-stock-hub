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
  currentAttachedPhotoBase64: null, // เก็บรูปภาพ Base64 ที่ถ่าย/แนบมา

  async init() {
    this.bindAuth();
    this.bindNavigation();
    this.bindModals();
    this.bindUserManagement();
    this.bindPosActions();
    this.bindSettings();
    this.bindSearchAndFilter();
    
    // ตรวจสอบการ Login
    if (!AuthManager.checkAuthAndApplyUI()) {
      return;
    }

    // โหลดข้อมูล
    await this.refreshData();
    ReportsManager.init();
    this.updateConnectionStatus();
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
      const lowList = this.products.filter(p => (p.currentStock || 0) <= (p.minAlert || 5));
      if (lowList.length === 0) {
        lowStockContainer.innerHTML = `
          <div class="py-6 text-center text-emerald-600 bg-emerald-50 rounded-xl">
            <span class="text-lg">🎉</span> สต็อกสินค้าทุกรายการอยู่ในเกณฑ์ปกติ
          </div>
        `;
      } else {
        lowStockContainer.innerHTML = lowList.map(p => `
          <div class="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div>
              <div class="font-medium text-slate-800">${p.productName}</div>
              <div class="text-xs text-slate-500 font-mono">รหัส: ${p.productId} | หมวด: ${p.category}</div>
            </div>
            <div class="text-right">
              <span class="px-2 py-1 bg-amber-200 text-amber-900 font-bold rounded-lg text-sm">
                เหลือ ${p.currentStock} ${p.unit}
              </span>
              <div class="text-xs text-amber-700 mt-1">เตือนเมื่อ &le; ${p.minAlert}</div>
            </div>
          </div>
        `).join('');
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
      const isLow = (p.currentStock || 0) <= (p.minAlert || 5);
      const stockBadge = isLow 
        ? `<span class="px-2 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-700">ใกล้หมด (${p.currentStock} ${p.unit})</span>`
        : `<span class="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800">${p.currentStock} ${p.unit}</span>`;

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
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
          <td class="px-4 py-3 font-mono text-xs text-slate-600 font-semibold">${p.productId}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-slate-800">${p.productName}</div>
            <span class="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600">${p.category}</span>
          </td>
          ${adminCols}
          <td class="px-4 py-3 text-right font-medium text-slate-800">฿${(p.salePrice || 0).toLocaleString()}</td>
          ${profitCol}
          <td class="px-4 py-3 text-center">${stockBadge}</td>
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

    const posTypeSelect = document.getElementById('pos-type-select');
    if (posTypeSelect) {
      posTypeSelect.addEventListener('change', () => {
        const productId = document.getElementById('pos-product-select')?.value;
        const product = this.products.find(p => p.productId === productId);
        const type = posTypeSelect.value;
        const labelEl = document.getElementById('pos-unit-price-label');
        const priceInput = document.getElementById('pos-unit-price-input');

        if (type === 'OUT') {
          if (labelEl) labelEl.innerHTML = '<span>ราคาขายจริง/ชิ้น (฿)</span> <span class="text-[10px] text-indigo-600 font-normal">แก้ไขได้</span>';
          if (priceInput && product) priceInput.value = product.salePrice || 0;
        } else if (type === 'IN') {
          if (labelEl) labelEl.innerHTML = '<span>ต้นทุนรับเข้า/ชิ้น (฿)</span> <span class="text-[10px] text-emerald-600 font-normal">แก้ไขได้</span>';
          if (priceInput && product) priceInput.value = product.costPrice || 0;
        } else {
          if (labelEl) labelEl.innerHTML = '<span>ยอดสต็อกเป้าหมาย</span>';
        }
        this.calculatePosLiveProfit();
      });
    }

    ['pos-qty-input', 'pos-unit-price-input'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.calculatePosLiveProfit());
    });

    document.getElementById('pos-submit-btn')?.addEventListener('click', () => this.submitPosTransaction());
  },

  handleScannedCode(code) {
    const select = document.getElementById('pos-product-select');
    if (!select) return;

    const found = this.products.find(p => p.productId.toLowerCase() === code.toLowerCase());
    if (found) {
      select.value = found.productId;
      this.updatePosProductInfo(found.productId);
      this.showToast(`สแกนพบ: ${found.productName}`, 'success');
    } else {
      this.showToast(`ไม่พบรหัสสินค้า: ${code}`, 'warning');
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

    if (priceInput) {
      priceInput.value = type === 'OUT' ? product.salePrice : product.costPrice;
    }
    if (labelEl) {
      labelEl.innerHTML = type === 'OUT' 
        ? '<span>ราคาขายจริง/ชิ้น (฿)</span> <span class="text-[10px] text-indigo-600 font-normal">แก้ไขได้</span>'
        : '<span>ต้นทุนรับเข้า/ชิ้น (฿)</span> <span class="text-[10px] text-emerald-600 font-normal">แก้ไขได้</span>';
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
    if (qty <= 0) {
      this.showToast('กรุณาระบุจำนวนที่มากกว่า 0', 'warning');
      return;
    }

    const product = this.products.find(p => p.productId === productId);

    try {
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

      this.showToast(res.message || 'บันทึกรายการและตัดสต็อกสำเร็จ!', 'success');
      
      // ล้างฟอร์มและรูปถ่าย
      document.getElementById('pos-qty-input').value = '1';
      document.getElementById('pos-note-input').value = '';
      this.currentAttachedPhotoBase64 = null;
      document.getElementById('pos-photo-input').value = '';
      document.getElementById('pos-photo-preview-container')?.classList.add('hidden');
      document.getElementById('btn-remove-photo')?.classList.add('hidden');

      await this.refreshData();
      this.updatePosProductInfo(productId);
    } catch (err) {
      this.showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
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

    document.getElementById('product-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveProductFromModal();
    });
  },

  openAddProductModal() {
    document.getElementById('modal-product-title').textContent = '➕ เพิ่มสินค้าใหม่';
    document.getElementById('modal-product-id').value = 'TOY-' + String(this.products.length + 1).padStart(3, '0');
    document.getElementById('modal-product-id').readOnly = false;
    document.getElementById('modal-product-name').value = '';
    document.getElementById('modal-product-category').value = this.categories[0] || 'Art Toy / กล่องสุ่ม';
    document.getElementById('modal-product-unit').value = 'ชิ้น';
    document.getElementById('modal-product-cost').value = '0';
    document.getElementById('modal-product-sale').value = '0';
    document.getElementById('modal-product-stock').value = '0';
    document.getElementById('modal-product-minalert').value = '5';
    document.getElementById('modal-profit-preview').textContent = 'กำไร: ฿0 (0.0%)';

    document.getElementById('product-modal')?.classList.remove('hidden');
  },

  openEditProductModal(productId) {
    const product = this.products.find(p => p.productId === productId);
    if (!product) return;

    document.getElementById('modal-product-title').textContent = '✏️ แก้ไขสินค้า';
    document.getElementById('modal-product-id').value = product.productId;
    document.getElementById('modal-product-id').readOnly = true;
    document.getElementById('modal-product-name').value = product.productName;
    document.getElementById('modal-product-category').value = product.category;
    document.getElementById('modal-product-unit').value = product.unit;
    document.getElementById('modal-product-cost').value = product.costPrice;
    document.getElementById('modal-product-sale').value = product.salePrice;
    document.getElementById('modal-product-stock').value = product.currentStock;
    document.getElementById('modal-product-minalert').value = product.minAlert;

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
    const minAlert = Number(document.getElementById('modal-product-minalert').value) || 5;

    if (!productId || !productName) {
      this.showToast('กรุณากรอกรหัสและชื่อสินค้า', 'warning');
      return;
    }

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
        updateStock: false
      });

      this.showToast(res.message || 'บันทึกสินค้าสำเร็จ!', 'success');
      this.closeProductModal();
      await this.refreshData();
    } catch (err) {
      this.showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
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
      await this.refreshData();
    } catch (err) {
      this.showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  },

  openQuickTransModal(productId, type) {
    this.switchTab('pos');
    const select = document.getElementById('pos-product-select');
    const typeSelect = document.getElementById('pos-type-select');
    if (select) {
      select.value = productId;
      this.updatePosProductInfo(productId);
    }
    if (typeSelect) {
      typeSelect.value = type;
      this.calculatePosLiveProfit();
    }
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

  updateConnectionStatus() {
    const badge = document.getElementById('connection-status-badge');
    if (!badge) return;

    if (isOnlineMode()) {
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

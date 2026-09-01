/**
 * API Service for communicating with Google Apps Script Web App or Local Storage
 */

const ApiService = {
  /**
   * ดึงข้อมูลทั้งหมดสำหรับแดชบอร์ด
   */
  async getDashboardData() {
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(`${apiUrl}?action=getDashboardData`);
        const json = await response.json();
        if (json.success) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(json.products || []));
          localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(json.transactions || []));
          localStorage.setItem(CONFIG.STORAGE_KEYS.CATEGORIES, JSON.stringify(json.categories || []));
          if (json.users) {
            localStorage.setItem('stock_local_users', JSON.stringify(json.users));
          }
          return json;
        } else {
          throw new Error(json.error || 'Failed to fetch from Google Sheets');
        }
      } catch (err) {
        console.warn('API fetch failed, falling back to local cache:', err);
      }
    }

    return this.getLocalDashboardData();
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

  /**
   * บันทึก Transaction รับเข้า / เบิกจ่าย / ปรับยอด
   */
  async addTransaction(transactionData) {
    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'addTransaction',
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
        console.error('API save failed:', err);
        throw err;
      }
    }

    return this.addLocalTransaction(transactionData);
  },

  /**
   * บันทึกเพิ่ม/แก้ไขสินค้า
   */
  async saveProduct(productData) {
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
        if (json.success) {
          return json;
        } else {
          throw new Error(json.error || 'Failed to save product');
        }
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
   * บันทึกเพิ่ม/แก้ไขผู้ใช้งาน
   */
  async saveUser(userData) {
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

    // Local Storage Fallback
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

  async initGoogleSheet() {
    const apiUrl = getApiUrl();
    if (!apiUrl) throw new Error('กรุณาระบุ Web App URL ก่อน');
    const response = await fetch(`${apiUrl}?action=init`);
    return await response.json();
  },

  // =========================================================================
  // LOCAL STORAGE FALLBACK LOGIC
  // =========================================================================
  
  getLocalDashboardData() {
    let products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS));
    let transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS));
    let categories = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CATEGORIES));
    let users = JSON.parse(localStorage.getItem('stock_local_users')) || [
      { username: 'admin', fullName: 'ผู้ดูแลระบบ (Admin)', role: 'admin', status: 'active' },
      { username: 'staff', fullName: 'พนักงานหน้าร้าน (Staff)', role: 'staff', status: 'active' }
    ];

    if (!products) {
      products = CONFIG.DEFAULT_PRODUCTS;
      localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    }
    if (!transactions) {
      transactions = CONFIG.DEFAULT_TRANSACTIONS;
      localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    }
    if (!categories) {
      categories = CONFIG.DEFAULT_CATEGORIES;
      localStorage.setItem(CONFIG.STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    }

    const summary = this.calculateSummaryMetrics(products, transactions);

    return {
      success: true,
      products,
      transactions,
      categories,
      users,
      summary
    };
  },

  calculateSummaryMetrics(products, transactions) {
    let totalStockValue = 0;
    let lowStockCount = 0;

    products.forEach(p => {
      totalStockValue += ((p.currentStock || 0) * (p.costPrice || 0));
      if ((p.currentStock || 0) <= (p.minAlert || 5)) {
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

    transactions.forEach(t => {
      if (t.type === 'OUT') {
        const rev = Number(t.totalRevenue) || 0;
        const cst = Number(t.totalCost) || 0;
        const prf = Number(t.profit) || (rev - cst);

        totalRevenue += rev;
        totalCost += cst;
        totalProfit += prf;

        const tDateStr = new Date(t.timestamp).toDateString();
        if (tDateStr === todayStr) {
          todayRevenue += rev;
          todayCost += cst;
          todayProfit += prf;
          todaySalesCount += (Number(t.quantity) || 0);
        }
      }
    });

    const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0;
    const todayMargin = todayRevenue > 0 ? ((todayProfit / todayRevenue) * 100).toFixed(2) : 0;

    return {
      totalProducts: products.length,
      lowStockCount: lowStockCount,
      totalStockValue: totalStockValue,
      todayRevenue: todayRevenue,
      todayCost: todayCost,
      todayProfit: todayProfit,
      todayMargin: Number(todayMargin),
      todaySalesCount: todaySalesCount,
      totalRevenue: totalRevenue,
      totalCost: totalCost,
      totalProfit: totalProfit,
      overallMargin: Number(overallMargin)
    };
  },

  addLocalTransaction(data) {
    const products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || CONFIG.DEFAULT_PRODUCTS;
    const transactions = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.TRANSACTIONS)) || CONFIG.DEFAULT_TRANSACTIONS;

    const productId = String(data.productId).trim();
    const type = String(data.type).toUpperCase();
    const qty = Number(data.quantity) || 0;

    const productIndex = products.findIndex(p => p.productId.toLowerCase() === productId.toLowerCase());
    if (productIndex === -1) throw new Error('ไม่พบสินค้ารหัส: ' + productId);

    const product = products[productIndex];
    let newStock = Number(product.currentStock) || 0;
    const costPrice = Number(data.costPrice) > 0 ? Number(data.costPrice) : (product.costPrice || 0);
    const salePrice = Number(data.salePrice) > 0 ? Number(data.salePrice) : (product.salePrice || 0);

    let totalCost = 0;
    let totalRevenue = 0;
    let profit = 0;

    if (type === 'IN') {
      newStock += qty;
      totalCost = qty * costPrice;
      if (data.costPrice) product.costPrice = costPrice;
    } else if (type === 'OUT') {
      if (newStock < qty) {
        throw new Error(`สต็อกคงเหลือไม่พอ! มีอยู่ ${newStock} แต่ต้องการเบิก ${qty}`);
      }
      newStock -= qty;
      totalCost = qty * costPrice;
      totalRevenue = qty * salePrice;
      profit = totalRevenue - totalCost;
    } else if (type === 'ADJUST') {
      newStock = qty;
    }

    product.currentStock = newStock;
    product.lastUpdated = new Date().toISOString();
    products[productIndex] = product;

    const transId = 'TRX-' + Date.now().toString().slice(-6);
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
      note: data.note || ''
    };

    transactions.unshift(newTrans);

    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    localStorage.setItem(CONFIG.STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));

    return {
      success: true,
      message: `บันทึกรายการ ${type} สำเร็จ! สต็อกคงเหลือ: ${newStock}`,
      transId: transId,
      newStock: newStock,
      profit: profit
    };
  },

  saveLocalProduct(data) {
    const products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || CONFIG.DEFAULT_PRODUCTS;
    const productId = String(data.productId).trim();
    const cost = Number(data.costPrice) || 0;
    const sale = Number(data.salePrice) || 0;
    const profit = sale - cost;
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
        minAlert: Number(data.minAlert) || 5,
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
        minAlert: Number(data.minAlert) || 5,
        lastUpdated: new Date().toISOString()
      };
      products.push(newProd);
    }

    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    return { success: true, message: `บันทึกข้อมูลสินค้า ${data.productName} สำเร็จ!` };
  },

  deleteLocalProduct(productId) {
    let products = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PRODUCTS)) || CONFIG.DEFAULT_PRODUCTS;
    products = products.filter(p => p.productId.toLowerCase() !== String(productId).toLowerCase());
    localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    return { success: true, message: `ลบสินค้า ${productId} เรียบร้อยแล้ว` };
  }
};

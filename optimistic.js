/**
 * Lebon Toy Stock Management - Optimistic Execution Engine
 * Provides 0ms UI Updates with Granular Inverse-Delta Rollback and Concurrency Safety
 */

const OptimisticEngine = {
  _recentFingerprints: new Map(),
  _inFlightPromises: new Map(),

  _checkAndLock(fingerprint, cooldownMs = 2500) {
    const now = Date.now();
    const lastTime = this._recentFingerprints.get(fingerprint);
    if (lastTime && (now - lastTime) < cooldownMs) {
      console.warn(`[OptimisticEngine] Duplicate identical transaction blocked (${fingerprint}) within ${now - lastTime}ms`);
      return false;
    }
    this._recentFingerprints.set(fingerprint, now);
    if (this._recentFingerprints.size > 50) {
      for (const [k, t] of this._recentFingerprints.entries()) {
        if (now - t > 10000) this._recentFingerprints.delete(k);
      }
    }
    return true;
  },

  /**
   * ตัดสต็อกเบิกขาย (Stock OUT) แบบ Optimistic 0ms
   */
  async executeStockOut({ productId, quantity, customPrice, operator, note, imageBase64, clientTransId }) {
    const fingerprint = `OUT:${productId}:${quantity}:${customPrice !== null && customPrice !== undefined ? customPrice : ''}`;

    // ถ้ามีรายการเดียวกันกำลังส่งขึ้น Cloud อยู่ (In-Flight) ให้รอ Promise เดิมร่วมกัน ป้องกันยิงเบิ้ล 100%
    if (this._inFlightPromises && this._inFlightPromises.has(fingerprint)) {
      console.warn(`[OptimisticEngine] In-flight transaction detected for ${fingerprint}, joining active promise...`);
      return await this._inFlightPromises.get(fingerprint);
    }

    if (!this._checkAndLock(fingerprint, 2500)) {
      console.warn(`[OptimisticEngine] Duplicate identical transaction suppressed (${fingerprint})`);
      return { success: true, message: 'รายการถูกบันทึกเรียบร้อยแล้ว (ป้องกันการกดซ้ำ)', duplicatePrevented: true };
    }

    const store = window.appStore;
    const product = store.getState('products').find((p) => p.productId === productId);

    if (!product) throw new Error('ไม่พบข้อมูลสินค้า');
    const currentStock = Number(product.currentStock) || 0;
    if (currentStock < quantity) {
      throw new Error(`สต็อกไม่พอ! คงเหลือ ${currentStock} ชิ้น`);
    }

    // 1. ทำ Delta Mutation ใน RAM ทันที (0 ms)
    product.currentStock = currentStock - quantity;
    product.lastUpdated = new Date().toISOString();

    const salePrice = (customPrice !== null && customPrice >= 0) ? customPrice : Number(product.salePrice || 0);
    const costPrice = Number(product.costPrice) || 0;
    const totalRevenue = quantity * salePrice;
    const totalCost = quantity * costPrice;
    const profit = totalRevenue - totalCost;
    const transId = clientTransId || ('TX-' + Date.now() + '-' + Math.floor(Math.random() * 10000));

    const optimisticTx = {
      transId: transId,
      timestamp: new Date().toISOString(),
      productId: product.productId,
      productName: product.productName,
      type: 'OUT',
      quantity,
      salePrice,
      costPrice,
      totalRevenue,
      totalCost,
      profit,
      operator: operator || 'Staff',
      note: note || '',
      isOptimistic: true
    };

    store.getState('transactions').unshift(optimisticTx);
    store.recalculateSummary();

    // 2. Targeted DOM Updates ทันที (0ms ไม่ล้างทั้งตาราง)
    patchProductRowDOM(product);
    prependTransactionRowDOM(optimisticTx);
    updateSummaryBadgesDOM(store.getState('summary'));
    if (typeof App !== 'undefined') {
      if (App.renderPosSearchResults) App.renderPosSearchResults();
      const currentSelected = document.getElementById('pos-product-select')?.value;
      if (currentSelected === productId && App.updatePosProductInfo) {
        App.updatePosProductInfo(productId);
      }
    }
    showFlashNotice('⚡ ตัดสต็อกสำเร็จทันที (กำลังบันทึกขึ้น Cloud...)', 'info');

    // 3. กระจายข้อมูล Optimistic ไปยังแท็บอื่น
    store.broadcast('PRODUCT_UPDATED', product);
    store.broadcast('TRANSACTION_ADDED', optimisticTx);

    // 4. บันทึกขึ้น Cloud ในเบื้องหลัง พร้อม In-Flight Promise Guard
    const cloudPromise = (async () => {
      try {
        const res = await ApiService.addTransaction({
          productId,
          type: 'OUT',
          quantity,
          salePrice,
          operator,
          note,
          imageBase64,
          clientTransId: transId,
          transId: transId
        });

        // Reconcile ID ชั่วคราวเป็น ID จริงจากฐานข้อมูล
        const realId = res.transId || transId;
        optimisticTx.transId = realId;
        optimisticTx.isOptimistic = false;
        updateTransactionDOMId(transId, realId);

        // กระจายบอกแท็บอื่นว่าสลับ ID แล้ว เพื่อป้องกันรายการเบิ้ลเมื่อ Realtime วิ่งมา
        store.broadcast('TRANSACTION_RECONCILED', { tempTransId: transId, realTransId: realId, productId });
        showFlashNotice('✅ บันทึกขึ้น Cloud สมบูรณ์!', 'success');
        return res;
      } catch (err) {
        // 5. INVERSE DELTA ROLLBACK: คืนค่าเฉพาะรายการที่ล้มเหลว
        product.currentStock = (Number(product.currentStock) || 0) + quantity;
        product.lastUpdated = new Date().toISOString();

        const txIndex = store.getState('transactions').findIndex((t) => t.transId === transId);
        if (txIndex !== -1) {
          store.getState('transactions').splice(txIndex, 1);
        }

        store.recalculateSummary();
        patchProductRowDOM(product);
        removeTransactionRowDOM(transId);
        updateSummaryBadgesDOM(store.getState('summary'));
        if (typeof App !== 'undefined') {
          if (App.renderPosSearchResults) App.renderPosSearchResults();
          const currentSelected = document.getElementById('pos-product-select')?.value;
          if (currentSelected === productId && App.updatePosProductInfo) {
            App.updatePosProductInfo(productId);
          }
        }

        // 6. ส่งข้อความชดเชยบอกแท็บอื่นให้คืนค่าตามทันที
        store.broadcast('TRANSACTION_ROLLBACK', {
          productId,
          restoredStock: product.currentStock,
          tempTransId: transId,
          quantity
        });

        showFlashNotice('❌ บันทึกล้มเหลว: ' + err.message + ' (ระบบคืนสต็อกหน้าร้านแล้ว)', 'error');
        throw err;
      } finally {
        if (this._inFlightPromises) this._inFlightPromises.delete(fingerprint);
      }
    })();

    if (this._inFlightPromises) this._inFlightPromises.set(fingerprint, cloudPromise);
    return await cloudPromise;
  },

  /**
   * รับสินค้าเข้าคลัง (Stock IN) แบบ Optimistic 0ms พร้อม WAC ถ่วงน้ำหนัก
   */
  async executeStockIn({ productId, quantity, costPrice, operator, note, imageBase64, clientTransId }) {
    const fingerprint = `IN:${productId}:${quantity}:${costPrice !== null && costPrice !== undefined ? costPrice : ''}`;

    // ถ้ามีรายการเดียวกันกำลังส่งขึ้น Cloud อยู่ (In-Flight) ให้รอ Promise เดิมร่วมกัน ป้องกันยิงเบิ้ล 100%
    if (this._inFlightPromises && this._inFlightPromises.has(fingerprint)) {
      console.warn(`[OptimisticEngine] In-flight transaction detected for ${fingerprint}, joining active promise...`);
      return await this._inFlightPromises.get(fingerprint);
    }

    if (!this._checkAndLock(fingerprint, 2500)) {
      console.warn(`[OptimisticEngine] Duplicate identical transaction suppressed (${fingerprint})`);
      return { success: true, message: 'รายการถูกบันทึกเรียบร้อยแล้ว (ป้องกันการกดซ้ำ)', duplicatePrevented: true };
    }

    const store = window.appStore;
    const product = store.getState('products').find((p) => p.productId === productId);

    if (!product) throw new Error('ไม่พบข้อมูลสินค้า');
    const oldStock = Number(product.currentStock) || 0;
    const oldCost = Number(product.costPrice) || 0;
    const inQty = Number(quantity) || 0;
    const inCost = (costPrice !== undefined && costPrice !== null && costPrice !== '') ? Math.max(0, Number(costPrice)) : oldCost;

    // คำนวณ WAC ใหม่ (MATH-01: รองรับต้นทุน 0 บาท)
    const newWac = calculateWAC(oldStock, oldCost, inQty, inCost);
    const newStock = oldStock + inQty;

    // 1. อัปเดตใน RAM ทันที
    product.currentStock = newStock;
    product.costPrice = newWac;
    product.profitPerUnit = Number((product.salePrice - newWac).toFixed(2));
    product.marginPercent = product.salePrice > 0 ? Number(((product.profitPerUnit / product.salePrice) * 100).toFixed(2)) : 0;
    product.lastUpdated = new Date().toISOString();

    const transId = clientTransId || ('TX-' + Date.now() + '-' + Math.floor(Math.random() * 10000));
    const optimisticTx = {
      transId: transId,
      timestamp: new Date().toISOString(),
      productId: product.productId,
      productName: product.productName,
      type: 'IN',
      quantity: inQty,
      costPrice: inCost,
      salePrice: Number(product.salePrice || 0),
      totalCost: inQty * inCost,
      totalRevenue: 0,
      profit: 0,
      operator: operator || 'Staff',
      note: note || '',
      isOptimistic: true
    };

    store.getState('transactions').unshift(optimisticTx);
    store.recalculateSummary();

    patchProductRowDOM(product);
    prependTransactionRowDOM(optimisticTx);
    updateSummaryBadgesDOM(store.getState('summary'));
    if (typeof App !== 'undefined') {
      if (App.renderPosSearchResults) App.renderPosSearchResults();
      const currentSelected = document.getElementById('pos-product-select')?.value;
      if (currentSelected === productId && App.updatePosProductInfo) {
        App.updatePosProductInfo(productId);
      }
    }
    showFlashNotice('⚡ รับเข้าสำเร็จทันที (กำลังบันทึกขึ้น Cloud...)', 'info');

    store.broadcast('PRODUCT_UPDATED', product);
    store.broadcast('TRANSACTION_ADDED', optimisticTx);

    const cloudPromise = (async () => {
      try {
        const res = await ApiService.addTransaction({
          productId,
          type: 'IN',
          quantity: inQty,
          costPrice: inCost,
          operator,
          note,
          imageBase64,
          clientTransId: transId,
          transId: transId
        });

        const realId = res.transId || transId;
        optimisticTx.transId = realId;
        optimisticTx.isOptimistic = false;
        updateTransactionDOMId(transId, realId);

        store.broadcast('TRANSACTION_RECONCILED', { tempTransId: transId, realTransId: realId, productId });
        showFlashNotice('✅ บันทึกรับเข้าขึ้น Cloud สมบูรณ์!', 'success');
        return res;
      } catch (err) {
        // Rollback
        product.currentStock = oldStock;
        product.costPrice = oldCost;
        product.profitPerUnit = Number((product.salePrice - oldCost).toFixed(2));
        product.marginPercent = product.salePrice > 0 ? Number(((product.profitPerUnit / product.salePrice) * 100).toFixed(2)) : 0;

        const txIndex = store.getState('transactions').findIndex((t) => t.transId === transId);
        if (txIndex !== -1) store.getState('transactions').splice(txIndex, 1);

        store.recalculateSummary();
        patchProductRowDOM(product);
        removeTransactionRowDOM(transId);
        updateSummaryBadgesDOM(store.getState('summary'));
        if (typeof App !== 'undefined') {
          if (App.renderPosSearchResults) App.renderPosSearchResults();
          const currentSelected = document.getElementById('pos-product-select')?.value;
          if (currentSelected === productId && App.updatePosProductInfo) {
            App.updatePosProductInfo(productId);
          }
        }

        store.broadcast('TRANSACTION_ROLLBACK', {
          productId,
          restoredStock: oldStock,
          tempTransId: transId,
          quantity: inQty
        });

        showFlashNotice('❌ บันทึกล้มเหลว: ' + err.message + ' (ระบบคืนสต็อกหน้าร้านแล้ว)', 'error');
        throw err;
      } finally {
        if (this._inFlightPromises) this._inFlightPromises.delete(fingerprint);
      }
    })();

    if (this._inFlightPromises) this._inFlightPromises.set(fingerprint, cloudPromise);
    return await cloudPromise;
  },

  /**
   * ปิดการแจ้งเตือนสต็อกใกล้หมด (Mute Alert) แบบ Optimistic 0ms
   * ป้องกัน BUG-01 ไม่ลบต้นทุนเดิมในฐานข้อมูล
   */
  async executeMuteAlert(productId) {
    const store = window.appStore;
    const product = store.getState('products').find((p) => p.productId === productId);
    if (!product) return;

    const oldMinAlert = product.minAlert;

    // 1. อัปเดตใน RAM ทันที
    product.minAlert = -1;
    store.recalculateSummary();
    patchProductRowDOM(product);
    updateSummaryBadgesDOM(store.getState('summary'));
    if (typeof App !== 'undefined' && App.renderDashboard) {
      App.renderDashboard();
    }
    showFlashNotice(`🔕 ปิดการแจ้งเตือนสำหรับ "${product.productName}" ทันที`, 'info');

    store.broadcast('PRODUCT_UPDATED', product);

    try {
      await ApiService.muteProductAlert(productId);
    } catch (err) {
      // Rollback
      product.minAlert = oldMinAlert;
      store.recalculateSummary();
      patchProductRowDOM(product);
      updateSummaryBadgesDOM(store.getState('summary'));
      if (typeof App !== 'undefined' && App.renderDashboard) {
        App.renderDashboard();
      }
      showFlashNotice('❌ ไม่สามารถบันทึกการปิดเตือนได้: ' + err.message, 'error');
      throw err;
    }
  }
};

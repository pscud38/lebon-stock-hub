/**
 * Periodic Reporting & Analytics Module (Daily / Weekly / Monthly / Custom)
 */

const ReportsManager = {
  trendChart: null,
  categoryChart: null,
  currentPeriod: 'daily', // daily, weekly, monthly, custom
  selectedDate: new Date().toISOString().split('T')[0],

  /**
   * เริ่มต้นโมดูลรายงาน
   */
  init() {
    this.bindEvents();
    this.renderReport();
  },

  bindEvents() {
    // สลับ Tab ช่วงเวลา
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.report-tab-btn').forEach(b => {
          b.classList.remove('bg-indigo-600', 'text-white', 'shadow');
          b.classList.add('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
        });
        btn.classList.add('bg-indigo-600', 'text-white', 'shadow');
        btn.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');

        this.currentPeriod = btn.dataset.period;
        this.updateDateControls();
        this.renderReport();
      });
    });

    // เปลี่ยนวันที่ / เดือน
    const dateInput = document.getElementById('report-date-input');
    if (dateInput) {
      dateInput.value = this.selectedDate;
      dateInput.addEventListener('change', (e) => {
        this.selectedDate = e.target.value;
        this.renderReport();
      });
    }

    const startDateInput = document.getElementById('report-start-date');
    const endDateInput = document.getElementById('report-end-date');
    if (startDateInput && endDateInput) {
      startDateInput.addEventListener('change', () => this.renderReport());
      endDateInput.addEventListener('change', () => this.renderReport());
    }

    // ปุ่ม Export & Print
    document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportToCSV());
    document.getElementById('btn-print-report')?.addEventListener('click', () => window.print());
  },

  updateDateControls() {
    const singleDateContainer = document.getElementById('report-single-date-container');
    const rangeDateContainer = document.getElementById('report-range-date-container');
    const dateInput = document.getElementById('report-date-input');

    if (this.currentPeriod === 'custom') {
      singleDateContainer?.classList.add('hidden');
      rangeDateContainer?.classList.remove('hidden');
    } else {
      singleDateContainer?.classList.remove('hidden');
      rangeDateContainer?.classList.add('hidden');
      
      if (dateInput) {
        if (this.currentPeriod === 'monthly') {
          dateInput.type = 'month';
          dateInput.value = this.selectedDate.slice(0, 7);
        } else {
          dateInput.type = 'date';
          dateInput.value = this.selectedDate;
        }
      }
    }
  },

  /**
   * ประมวลผลและ Render รายงาน
   */
  async renderReport() {
    const data = await ApiService.getDashboardData();
    const transactions = data.transactions || [];
    const products = data.products || [];

    const filtered = this.filterTransactions(transactions);
    const metrics = this.calculateReportMetrics(filtered);

    // 1. อัปเดตการ์ดตัวเลขสรุป (KPI Cards)
    this.updateKpiCards(metrics);

    // 2. เรนเดอร์กราฟแนวโน้ม (Trend Chart)
    this.renderTrendChart(filtered);

    // 3. เรนเดอร์กราฟสัดส่วนหมวดหมู่ (Category Donut Chart)
    this.renderCategoryChart(filtered, products);

    // 4. เรนเดอร์ตารางแจกแจงรายสินค้าและบิล
    this.renderProductBreakdownTable(filtered);
    this.renderTransactionsTable(filtered);
  },

  /**
   * กรอง Transaction ตามช่วงเวลาที่เลือก
   */
  filterTransactions(transactions) {
    const now = new Date();

    if (this.currentPeriod === 'daily') {
      const targetDateStr = this.selectedDate;
      return transactions.filter(t => {
        const tDateStr = new Date(t.timestamp).toISOString().split('T')[0];
        return tDateStr === targetDateStr;
      });
    }

    if (this.currentPeriod === 'weekly') {
      const selected = new Date(this.selectedDate);
      const startOfWeek = new Date(selected);
      startOfWeek.setDate(selected.getDate() - 6); // 7 วันล่าสุด
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(selected);
      endOfWeek.setHours(23, 59, 59, 999);

      return transactions.filter(t => {
        const tDate = new Date(t.timestamp);
        return tDate >= startOfWeek && tDate <= endOfWeek;
      });
    }

    if (this.currentPeriod === 'monthly') {
      const targetMonth = this.selectedDate.slice(0, 7); // YYYY-MM
      return transactions.filter(t => {
        const tMonth = new Date(t.timestamp).toISOString().slice(0, 7);
        return tMonth === targetMonth;
      });
    }

    if (this.currentPeriod === 'custom') {
      const startVal = document.getElementById('report-start-date')?.value;
      const endVal = document.getElementById('report-end-date')?.value;
      if (!startVal || !endVal) return transactions;

      const startDate = new Date(startVal);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(endVal);
      endDate.setHours(23, 59, 59, 999);

      return transactions.filter(t => {
        const tDate = new Date(t.timestamp);
        return tDate >= startDate && tDate <= endDate;
      });
    }

    return transactions;
  },

  /**
   * คำนวณตัวเลขสถิติของช่วงเวลานั้น
   */
  calculateReportMetrics(filtered) {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    let itemsSold = 0;
    let billsCount = 0;
    let itemsIn = 0;

    filtered.forEach(t => {
      if (t.type === 'OUT') {
        const rev = Number(t.totalRevenue) || 0;
        const cst = Number(t.totalCost) || 0;
        const prf = Number(t.profit) || (rev - cst);

        revenue += rev;
        cost += cst;
        profit += prf;
        itemsSold += (Number(t.quantity) || 0);
        billsCount++;
      } else if (t.type === 'IN') {
        itemsIn += (Number(t.quantity) || 0);
      }
    });

    const margin = revenue > 0 ? ((profit / revenue) * 100) : 0;

    return {
      revenue,
      cost,
      profit,
      margin: Number(margin.toFixed(2)),
      itemsSold,
      billsCount,
      itemsIn
    };
  },

  updateKpiCards(m) {
    const elRev = document.getElementById('kpi-report-revenue');
    const elCost = document.getElementById('kpi-report-cost');
    const elProfit = document.getElementById('kpi-report-profit');
    const elMargin = document.getElementById('kpi-report-margin');
    const elSold = document.getElementById('kpi-report-sold');

    if (elRev) elRev.textContent = '฿' + m.revenue.toLocaleString();
    if (elCost) elCost.textContent = '฿' + m.cost.toLocaleString();
    if (elProfit) {
      elProfit.textContent = (m.profit >= 0 ? '+' : '') + '฿' + m.profit.toLocaleString();
      elProfit.className = m.profit >= 0 ? 'text-2xl font-bold text-emerald-600' : 'text-2xl font-bold text-rose-600';
    }
    if (elMargin) elMargin.textContent = m.margin + '%';
    if (elSold) elSold.textContent = `${m.itemsSold.toLocaleString()} ชิ้น (${m.billsCount} บิล)`;
  },

  /**
   * แสดงกราฟแนวโน้ม (Chart.js)
   */
  renderTrendChart(filtered) {
    const ctx = document.getElementById('report-trend-chart')?.getContext('2d');
    if (!ctx) return;

    if (this.trendChart) {
      this.trendChart.destroy();
    }

    // จัดกลุ่มข้อมูลตามวัน
    const grouped = {};

    filtered.forEach(t => {
      if (t.type === 'OUT') {
        const dateKey = new Date(t.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        if (!grouped[dateKey]) {
          grouped[dateKey] = { revenue: 0, cost: 0, profit: 0 };
        }
        grouped[dateKey].revenue += (Number(t.totalRevenue) || 0);
        grouped[dateKey].cost += (Number(t.totalCost) || 0);
        grouped[dateKey].profit += (Number(t.profit) || 0);
      }
    });

    let labels = Object.keys(grouped);
    if (labels.length === 0) {
      labels = ['ไม่มีข้อมูลการขาย'];
      grouped['ไม่มีข้อมูลการขาย'] = { revenue: 0, cost: 0, profit: 0 };
    }

    const revenues = labels.map(k => grouped[k].revenue);
    const costs = labels.map(k => grouped[k].cost);
    const profits = labels.map(k => grouped[k].profit);

    this.trendChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'ยอดขาย (Revenue)',
            data: revenues,
            backgroundColor: '#3B82F6',
            borderRadius: 6
          },
          {
            label: 'ต้นทุน (Cost)',
            data: costs,
            backgroundColor: '#94A3B8',
            borderRadius: 6
          },
          {
            label: 'กำไรสุทธิ (Profit)',
            data: profits,
            backgroundColor: '#10B981',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ฿${Number(ctx.raw).toLocaleString()}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => '฿' + v.toLocaleString()
            }
          }
        }
      }
    });
  },

  /**
   * แสดงกราฟสัดส่วนกำไรตามหมวดหมู่ (Category Donut)
   */
  renderCategoryChart(filtered, products) {
    const ctx = document.getElementById('report-category-chart')?.getContext('2d');
    if (!ctx) return;

    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    // สร้าง Map product -> category
    const catMap = {};
    products.forEach(p => catMap[p.productId] = p.category || 'ทั่วไป');

    const catProfits = {};
    filtered.forEach(t => {
      if (t.type === 'OUT') {
        const cat = catMap[t.productId] || 'ทั่วไป';
        catProfits[cat] = (catProfits[cat] || 0) + (Number(t.profit) || 0);
      }
    });

    const labels = Object.keys(catProfits);
    const data = labels.map(k => catProfits[k]);

    if (labels.length === 0) {
      this.categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['ไม่มีข้อมูล'],
          datasets: [{ data: [1], backgroundColor: ['#E2E8F0'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
      return;
    }

    const palette = ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#64748B'];

    this.categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: palette.slice(0, labels.length)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => ` กำไร: ฿${Number(ctx.raw).toLocaleString()}`
            }
          }
        }
      }
    });
  },

  /**
   * ตารางสรุปกำไรแยกตามรายชื่อสินค้า (Product Profit Breakdown)
   */
  renderProductBreakdownTable(filtered) {
    const tbody = document.getElementById('report-product-breakdown-tbody');
    if (!tbody) return;

    const prodSummary = {};

    filtered.forEach(t => {
      if (t.type === 'OUT') {
        const id = t.productId;
        if (!prodSummary[id]) {
          prodSummary[id] = {
            productId: id,
            productName: t.productName || id,
            qtySold: 0,
            revenue: 0,
            cost: 0,
            profit: 0
          };
        }
        prodSummary[id].qtySold += (Number(t.quantity) || 0);
        prodSummary[id].revenue += (Number(t.totalRevenue) || 0);
        prodSummary[id].cost += (Number(t.totalCost) || 0);
        prodSummary[id].profit += (Number(t.profit) || 0);
      }
    });

    const list = Object.values(prodSummary).sort((a, b) => b.profit - a.profit);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">ไม่มีรายการขายในช่วงเวลานี้</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((item, idx) => {
      const margin = item.revenue > 0 ? ((item.profit / item.revenue) * 100).toFixed(1) : '0.0';
      const profitClass = item.profit >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold';
      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
          <td class="px-4 py-3 text-center text-slate-400 text-xs">${idx + 1}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-slate-800">${item.productName}</div>
            <div class="text-xs text-slate-400 font-mono">${item.productId}</div>
          </td>
          <td class="px-4 py-3 text-right font-medium text-slate-700">${item.qtySold.toLocaleString()}</td>
          <td class="px-4 py-3 text-right font-medium text-slate-700">฿${item.revenue.toLocaleString()}</td>
          <td class="px-4 py-3 text-right text-slate-500">฿${item.cost.toLocaleString()}</td>
          <td class="px-4 py-3 text-right ${profitClass}">
            <div>฿${item.profit.toLocaleString()}</div>
            <div class="text-xs text-slate-400 font-normal">(${margin}%)</div>
          </td>
        </tr>
      `;
    }).join('');
  },

  /**
   * ตารางประวัติบิลในช่วงเวลานั้น
   */
  renderTransactionsTable(filtered) {
    const tbody = document.getElementById('report-transactions-tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">ไม่มีรายการบันทึกในช่วงเวลานี้</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
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

      const photoBtn = t.imageUrl ? `
        <button onclick="App.openImageViewerModal('${t.imageUrl}', '${t.productName || t.productId}', '${timeStr}')" 
          class="ml-1 text-indigo-600 hover:text-indigo-800 text-xs font-semibold" title="ดูรูปถ่าย">📸</button>
      ` : '';

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
          <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">${timeStr}</td>
          <td class="px-4 py-2.5">${typeBadge}</td>
          <td class="px-4 py-2.5 font-medium text-slate-800">${t.productName || t.productId} ${photoBtn}</td>
          <td class="px-4 py-2.5 text-right font-medium text-slate-700">${t.quantity.toLocaleString()}</td>
          <td class="px-4 py-2.5 text-right text-slate-700">${t.totalRevenue ? '฿' + t.totalRevenue.toLocaleString() : '-'}</td>
          <td class="px-4 py-2.5 text-right">${profitDisplay}</td>
          <td class="px-4 py-2.5 text-slate-500 text-xs">${t.operator || 'Staff'} ${t.note ? `(${t.note})` : ''}</td>
        </tr>
      `;
    }).join('');
  },

  /**
   * ส่งออกเป็น CSV (UTF-8 with BOM เพื่อให้ภาษาไทยใน Excel ไม่เพี้ยน)
   */
  async exportToCSV() {
    const data = await ApiService.getDashboardData();
    const filtered = this.filterTransactions(data.transactions || []);

    if (filtered.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    const isAdmin = typeof AuthManager !== 'undefined' && AuthManager.isAdmin && AuthManager.isAdmin();

    let csvContent = '\uFEFF'; // UTF-8 BOM
    if (isAdmin) {
      csvContent += 'รหัสรายการ,วันเวลา,รหัสสินค้า,ชื่อสินค้า,ประเภท,จำนวน,ต้นทุนต่อหน่วย,ราคาขายต่อหน่วย,ต้นทุนรวม,ยอดขายรวม,กำไร,ผู้ทำรายการ,หมายเหตุ,ลิงก์รูปหลักฐาน\n';
    } else {
      csvContent += 'รหัสรายการ,วันเวลา,รหัสสินค้า,ชื่อสินค้า,ประเภท,จำนวน,ราคาขายต่อหน่วย,ยอดขายรวม,ผู้ทำรายการ,หมายเหตุ,ลิงก์รูปหลักฐาน\n';
    }

    filtered.forEach(t => {
      let row;
      if (isAdmin) {
        row = [
          `"${t.transId || ''}"`,
          `"${new Date(t.timestamp).toLocaleString('th-TH')}"`,
          `"${t.productId || ''}"`,
          `"${(t.productName || '').replace(/"/g, '""')}"`,
          `"${t.type || ''}"`,
          t.quantity || 0,
          t.costPrice || 0,
          t.salePrice || 0,
          t.totalCost || 0,
          t.totalRevenue || 0,
          t.profit || 0,
          `"${(t.operator || '').replace(/"/g, '""')}"`,
          `"${(t.note || '').replace(/"/g, '""')}"`,
          `"${(t.imageUrl || '').replace(/"/g, '""')}"`
        ];
      } else {
        row = [
          `"${t.transId || ''}"`,
          `"${new Date(t.timestamp).toLocaleString('th-TH')}"`,
          `"${t.productId || ''}"`,
          `"${(t.productName || '').replace(/"/g, '""')}"`,
          `"${t.type || ''}"`,
          t.quantity || 0,
          t.salePrice || 0,
          t.totalRevenue || 0,
          `"${(t.operator || '').replace(/"/g, '""')}"`,
          `"${(t.note || '').replace(/"/g, '""')}"`,
          `"${(t.imageUrl || '').replace(/"/g, '""')}"`
        ];
      }
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Stock_Report_${this.currentPeriod}_${this.selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReportsManager };
}

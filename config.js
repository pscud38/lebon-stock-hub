/**
 * Configuration & Default Mock Data
 * สำหรับ: ร้านขายของเล่น (Art Toy, Squishy, กล่องสุ่ม, ของเล่นสำเพ็ง)
 */

const CONFIG = {
  SHOP_NAME: 'Lebon Toy',
  DEFAULT_API_URL: 'https://script.google.com/macros/s/AKfycbzz8KQswE5FvwnicE3QhHKbIqO1j-kdVlVIsjAd4WBZG4JBBWNFRsoxhYoSHL6ZwwjhfQ/exec',

  STORAGE_KEYS: {
    API_URL: 'stock_sheets_api_url',
    PRODUCTS: 'stock_local_products',
    TRANSACTIONS: 'stock_local_transactions',
    CATEGORIES: 'stock_local_categories',
    APP_SETTINGS: 'stock_app_settings'
  },

  // หมวดหมู่สินค้าของเล่น
  DEFAULT_CATEGORIES: [
    'Art Toy / กล่องสุ่ม',
    'Squishy / นุ่มนิ่ม',
    'ของเล่นกระแส / สำเพ็ง',
    'ของเล่นเสริมพัฒนาการ / DIY',
    'การ์ด & ของสะสม',
    'โมเดล & ฟิกเกอร์',
    'อื่นๆ'
  ],

  // สินค้าตัวอย่างร้านของเล่น
  DEFAULT_PRODUCTS: [
    {
      productId: 'TOY-001',
      productName: 'กล่องสุ่ม Art Toy Baby Three V3 (จุ่มลุ้นซีเคร็ท)',
      category: 'Art Toy / กล่องสุ่ม',
      unit: 'กล่อง',
      costPrice: 280,
      salePrice: 490,
      profitPerUnit: 210,
      marginPercent: 42.86,
      currentStock: 24,
      minAlert: 6,
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-002',
      productName: 'Squishy แมวน้ำโมจิจัมโบ้ นุ่มสโลว์ กลิ่นหอม',
      category: 'Squishy / นุ่มนิ่ม',
      unit: 'ชิ้น',
      costPrice: 45,
      salePrice: 99,
      profitPerUnit: 54,
      marginPercent: 54.55,
      currentStock: 45,
      minAlert: 10,
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-003',
      productName: 'กล่องสุ่ม Crybaby Sunset Concert Series',
      category: 'Art Toy / กล่องสุ่ม',
      unit: 'กล่อง',
      costPrice: 380,
      salePrice: 650,
      profitPerUnit: 270,
      marginPercent: 41.54,
      currentStock: 12,
      minAlert: 4,
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-004',
      productName: 'พวงกุญแจ Labubu The Monsters ขนนุ่มฟู (งานกระแส)',
      category: 'ของเล่นกระแส / สำเพ็ง',
      unit: 'ตัว',
      costPrice: 85,
      salePrice: 199,
      profitPerUnit: 114,
      marginPercent: 57.29,
      currentStock: 3,
      minAlert: 10, // สินค้าใกล้หมด
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-005',
      productName: 'Squishy ขนมปังปอนด์ยักษ์ สโลว์บีบฟิน',
      category: 'Squishy / นุ่มนิ่ม',
      unit: 'ชิ้น',
      costPrice: 60,
      salePrice: 139,
      profitPerUnit: 79,
      marginPercent: 56.83,
      currentStock: 18,
      minAlert: 5,
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-006',
      productName: 'เลโก้นาโนบล็อก ตัวการ์ตูนยอดฮิต (ไซส์ L)',
      category: 'ของเล่นเสริมพัฒนาการ / DIY',
      unit: 'กล่อง',
      costPrice: 25,
      salePrice: 69,
      profitPerUnit: 44,
      marginPercent: 63.77,
      currentStock: 35,
      minAlert: 8,
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-007',
      productName: 'สไลม์คริสตัล กากเพชรสายรุ้ง พร้อมท็อปปิ้ง',
      category: 'ของเล่นกระแส / สำเพ็ง',
      unit: 'กระปุก',
      costPrice: 20,
      salePrice: 50,
      profitPerUnit: 30,
      marginPercent: 60.00,
      currentStock: 50,
      minAlert: 15,
      lastUpdated: new Date().toISOString()
    },
    {
      productId: 'TOY-008',
      productName: 'ซองสุ่มการ์ดพลังอนิเมะ การ์ดทองวิบวับ',
      category: 'การ์ด & ของสะสม',
      unit: 'ซอง',
      costPrice: 15,
      salePrice: 39,
      profitPerUnit: 24,
      marginPercent: 61.54,
      currentStock: 80,
      minAlert: 20,
      lastUpdated: new Date().toISOString()
    }
  ],

  DEFAULT_TRANSACTIONS: [
    {
      transId: 'TRX-2001',
      timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      productId: 'TOY-001',
      productName: 'กล่องสุ่ม Art Toy Baby Three V3 (จุ่มลุ้นซีเคร็ท)',
      type: 'IN',
      quantity: 30,
      costPrice: 280,
      salePrice: 490,
      totalCost: 8400,
      totalRevenue: 0,
      profit: 0,
      operator: 'Admin',
      note: 'รับของล็อตใหม่จากจีน',
      imageUrl: ''
    },
    {
      transId: 'TRX-2002',
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      productId: 'TOY-001',
      productName: 'กล่องสุ่ม Art Toy Baby Three V3 (จุ่มลุ้นซีเคร็ท)',
      type: 'OUT',
      quantity: 6,
      costPrice: 280,
      salePrice: 490,
      totalCost: 1680,
      totalRevenue: 2940,
      profit: 1260,
      operator: 'Staff A',
      note: 'ลูกค้ายกบ็อกหน้าร้าน',
      imageUrl: ''
    },
    {
      transId: 'TRX-2003',
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      productId: 'TOY-002',
      productName: 'Squishy แมวน้ำโมจิจัมโบ้ นุ่มสโลว์ กลิ่นหอม',
      type: 'OUT',
      quantity: 5,
      costPrice: 45,
      salePrice: 99,
      totalCost: 225,
      totalRevenue: 495,
      profit: 270,
      operator: 'Staff A',
      note: 'ขายหน้าร้าน',
      imageUrl: ''
    },
    {
      transId: 'TRX-2004',
      timestamp: new Date().toISOString(),
      productId: 'TOY-003',
      productName: 'กล่องสุ่ม Crybaby Sunset Concert Series',
      type: 'OUT',
      quantity: 2,
      costPrice: 380,
      salePrice: 650,
      totalCost: 760,
      totalRevenue: 1300,
      profit: 540,
      operator: 'Staff B',
      note: 'สั่งออนไลน์ทาง TikTok',
      imageUrl: ''
    },
    {
      transId: 'TRX-2005',
      timestamp: new Date().toISOString(),
      productId: 'TOY-004',
      productName: 'พวงกุญแจ Labubu The Monsters ขนนุ่มฟู (งานกระแส)',
      type: 'OUT',
      quantity: 7,
      costPrice: 85,
      salePrice: 199,
      totalCost: 595,
      totalRevenue: 1393,
      profit: 798,
      operator: 'Staff A',
      note: 'ขายหน้าร้าน (ขายดีมาก)',
      imageUrl: ''
    }
  ]
};

function getApiUrl() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.API_URL) || CONFIG.DEFAULT_API_URL;
  }
  return CONFIG.DEFAULT_API_URL;
}

function setApiUrl(url) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CONFIG.STORAGE_KEYS.API_URL, url.trim());
  }
}

function isOnlineMode() {
  return !!getApiUrl();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG,
    getApiUrl,
    setApiUrl,
    isOnlineMode
  };
}

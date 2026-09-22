/**
 * Authentication & Role-Based Access Control (RBAC) Module
 * Dedicated to Supabase Server-Side Authentication
 */

const AuthManager = {
  STORAGE_KEY: 'stock_auth_user',

  // ดึงข้อมูลผู้ใช้ปัจจุบันที่ล็อกอินอยู่
  getCurrentUser() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.warn('Failed to parse current user from localStorage:', e);
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getCurrentUser();
  },

  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  },

  /**
   * ล็อกอินเข้าสู่ระบบ (Server-Side Authentication via Supabase RPC login_user)
   */
  async login(username, password) {
    const u = (username || '').trim();
    const p = (password || '').trim();

    if (!u || !p) {
      throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    }

    if (typeof isSupabaseConfigured !== 'function' || !isSupabaseConfigured()) {
      throw new Error('ยังไม่ได้กำหนดค่าการเชื่อมต่อฐานข้อมูล Supabase');
    }

    try {
      const { url, key } = getSupabaseConfig();
      const headers = {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      };

      // เรียกใช้ Server-side RPC login_user
      const rpcRes = await fetch(`${url}/rest/v1/rpc/login_user`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ p_username: u, p_password: p })
      });

      if (rpcRes.ok) {
        const result = await rpcRes.json();
        if (result && result.success && result.user) {
          this.setCurrentUser(result.user);
          return result.user;
        } else {
          const errMsg = result?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
          const authErr = new Error(errMsg);
          authErr.isAuthRejection = true;
          throw authErr;
        }
      } else {
        const errJson = await rpcRes.json().catch(() => null);
        if (rpcRes.status === 401 || rpcRes.status === 403) {
          throw new Error('สิทธิ์การเข้าถึงฐานข้อมูลถูกปฏิเสธ (ตรวจสอบสิทธิ์ login_user)');
        }
        throw new Error(errJson?.message || 'ไม่สามารถเชื่อมต่อฐานข้อมูลยืนยันตัวตนได้ (' + rpcRes.status + ')');
      }
    } catch (err) {
      console.warn('Supabase login error:', err);
      throw err;
    }
  },

  setCurrentUser(user) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem(this.STORAGE_KEY);
    window.location.reload();
  },

  /**
   * ตรวจสอบสถานะการเข้าสู่ระบบและปรับแต่งหน้าจอตาม Role
   */
  checkAuthAndApplyUI() {
    const loginModal = document.getElementById('login-modal');
    const user = this.getCurrentUser();

    if (!user) {
      loginModal?.classList.remove('hidden');
      return false;
    }

    loginModal?.classList.add('hidden');

    // อัปเดตข้อมูลผู้ใช้บนแถบ Header
    const userNameEl = document.getElementById('header-user-name');
    const userRoleEl = document.getElementById('header-user-role');
    const userBadgeEl = document.getElementById('header-user-profile');

    if (userNameEl) userNameEl.textContent = user.fullName || user.username;
    if (userRoleEl) userRoleEl.textContent = user.role === 'admin' ? '🛡️ ผู้ดูแลระบบ' : '👤 พนักงาน';
    if (userBadgeEl) userBadgeEl.classList.remove('hidden');

    // กำหนดสิทธิ์การแสดงผลตาม Role
    if (user.role !== 'admin') {
      // ซ่อนต้นทุนและกำไรสำหรับ Staff
      document.querySelectorAll('.admin-only').forEach(el => {
        el.classList.add('hidden');
      });
    } else {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.classList.remove('hidden');
      });
    }

    return true;
  }
};

/**
 * Authentication & Role-Based Access Control (RBAC) Module
 */

const AuthManager = {
  STORAGE_KEY: 'stock_auth_user',

  // ดึงข้อมูลผู้ใช้ปัจจุบันที่ล็อกอินอยู่
  getCurrentUser() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
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
   * ล็อกอินเข้าสู่ระบบ
   */
  async login(username, password) {
    const u = username.trim();
    const p = password.trim();

    if (!u || !p) {
      throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    }

    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
      try {
        const { url, key } = getSupabaseConfig();
        const headers = {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        };
        const response = await fetch(`${url}/rest/v1/users?username=eq.${encodeURIComponent(u)}&select=*`, { headers });
        if (response.ok) {
          const users = await response.json();
          if (users.length > 0) {
            const dbUser = users[0];
            if (dbUser.password === p) {
              if (dbUser.status === 'inactive') {
                const authErr = new Error('บัญชีผู้ใช้นี้ถูกระงับการใช้งาน');
                authErr.isAuthRejection = true;
                throw authErr;
              }
              const userObj = {
                username: dbUser.username,
                fullName: dbUser.full_name || dbUser.username,
                role: dbUser.role || 'staff'
              };
              this.setCurrentUser(userObj);
              return userObj;
            }
          }
          const authErr = new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
          authErr.isAuthRejection = true;
          throw authErr;
        }
      } catch (err) {
        if (err && err.isAuthRejection) throw err;
        console.warn('Supabase login error, checking fallback:', err);
      }
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'login',
            username: u,
            password: p
          })
        });
        const json = await response.json();
        if (json.success && json.user) {
          this.setCurrentUser(json.user);
          return json.user;
        } else {
          const authErr = new Error(json.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
          authErr.isAuthRejection = true;
          throw authErr;
        }
      } catch (err) {
        if (err && err.isAuthRejection) {
          throw err;
        }
        // เฉพาะกรณีเกิดปัญหาเครือข่าย/ออฟไลน์ จึงจะอนุญาตให้ใช้ Local Fallback
        console.warn('API login network failure, checking fallback credentials:', err);
      }
    }

    // Default Fallback Accounts
    if (u === 'admin' && p === 'admin1234') {
      const user = { username: 'admin', fullName: 'ผู้ดูแลระบบ (Admin)', role: 'admin' };
      this.setCurrentUser(user);
      return user;
    } else if (u === 'staff' && p === 'staff1234') {
      const user = { username: 'staff', fullName: 'พนักงานหน้าร้าน (Staff)', role: 'staff' };
      this.setCurrentUser(user);
      return user;
    }

    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
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
      // ซ่อนต้นทุนและกำไรบางจุดสำหรับ Staff
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

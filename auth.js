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
   * ล็อกอินเข้าสู่ระบบ (Server-Side Authentication via Supabase RPC)
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

        // 1. เรียกใช้ Server-side RPC login_user อย่างปลอดภัย
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
            const authErr = new Error(result?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            authErr.isAuthRejection = true;
            throw authErr;
          }
        } else {
          // หากยังไม่ได้รัน patch (ฟังก์ชัน login_user ยังไม่ถูกสร้าง) ให้ fallback ชั่วคราว
          const errTxt = await rpcRes.text();
          if (errTxt.includes('login_user') && (errTxt.includes('does not exist') || errTxt.includes('404'))) {
            console.warn('RPC login_user not found on database, attempting direct lookup fallback...');
            const response = await fetch(`${url}/rest/v1/users?username=eq.${encodeURIComponent(u)}&select=*`, { headers });
            if (response.ok) {
              const users = await response.json();
              if (users.length > 0 && users[0].password === p) {
                if (users[0].status === 'inactive') {
                  const authErr = new Error('บัญชีผู้ใช้นี้ถูกระงับการใช้งาน');
                  authErr.isAuthRejection = true;
                  throw authErr;
                }
                const userObj = {
                  username: users[0].username,
                  fullName: users[0].full_name || users[0].username,
                  role: users[0].role || 'staff'
                };
                this.setCurrentUser(userObj);
                return userObj;
              }
            }
          }
          const authErr = new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
          authErr.isAuthRejection = true;
          throw authErr;
        }
      } catch (err) {
        if (err && err.isAuthRejection) throw err;
        console.warn('Supabase login communication error:', err);
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
        console.warn('API login network failure:', err);
      }
    }

    // Fail-closed: ไม่อนุญาตให้ล็อกอินหากไม่มีการยืนยันตัวตนจากฐานข้อมูล (ลบ Backdoor credentials ออก 100%)
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือไม่สามารถเชื่อมต่อฐานข้อมูลยืนยันตัวตนได้');
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

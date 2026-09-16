/**
 * 中國朝代 SOKOBAN - CAI 電腦輔助教學系統服務模組
 * 負責：st.tc.edu.tw 學生登入認證、免登入體驗管理、GAS 成績上傳與班級排行榜
 */

const CAI_CONFIG = {
  CLIENT_ID: '403500919614-rn7o78kh1dr3pu923c3re8c9ri1s3onq.apps.googleusercontent.com',
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbwMarS0501vncxJcIhAK0XjuwlMA6We3txTsrww0wg-WM_M8SOtwci9B3bCfUUY9_vyWw/exec',
  HOSTED_DOMAIN: 'st.tc.edu.tw',
  TEACHER_EMAIL: 't202@st.tc.edu.tw',
  SESSION_KEY: 'CAI_STUDENT_SESSION' // 使用 sessionStorage，關閉瀏覽器即清空防呆
};

const CAI = {
  /**
   * 取得當前 session 中的學生資訊
   * @returns {Object|null}
   */
  getStudent() {
    try {
      const raw = sessionStorage.getItem(CAI_CONFIG.SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * 是否為免登入體驗模式
   */
  isGuest() {
    const s = this.getStudent();
    return s && s.isGuest === true;
  },

  /**
   * 是否為已登入之正式學生（或教師）
   */
  isLoggedIn() {
    const s = this.getStudent();
    return s && s.email && !s.isGuest;
  },

  /**
   * 設定為免登入體驗模式
   */
  setGuestMode() {
    const guestUser = {
      isGuest: true,
      name: '訪客體驗者',
      classId: '體驗',
      seatNo: '00',
      email: ''
    };
    sessionStorage.setItem(CAI_CONFIG.SESSION_KEY, JSON.stringify(guestUser));
    return guestUser;
  },

  /**
   * 儲存已登入學生資訊至 sessionStorage
   */
  setStudent(studentData) {
    sessionStorage.setItem(CAI_CONFIG.SESSION_KEY, JSON.stringify({
      isGuest: false,
      email: studentData.email || '',
      name: studentData.name || '',
      classId: studentData.classId || '',
      seatNo: studentData.seatNo || '',
      isTeacher: studentData.isTeacher || false,
      loginTime: new Date().toISOString()
    }));
  },

  /**
   * 登出並清除 session
   */
  logout() {
    sessionStorage.removeItem(CAI_CONFIG.SESSION_KEY);
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
  },

  /**
   * 解析 Google JWT Credential Token
   */
  decodeJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('JWT 解析失敗:', e);
      return null;
    }
  },

  /**
   * 提交成績至 Google 試算表 (GAS)
   * 備註：體驗模式不發送任何請求
   */
  async submitScore(scoreData) {
    if (this.isGuest()) {
      return {
        status: 'guest',
        message: '體驗模式不記錄成績'
      };
    }

    const student = this.getStudent();
    if (!student || !student.email) {
      return {
        status: 'not_logged_in',
        message: '未登入學生資訊'
      };
    }

    const payload = {
      action: 'submitScore',
      email: student.email,
      name: student.name,
      classId: student.classId,
      seatNo: student.seatNo,
      totalScore: scoreData.totalScore || 0,
      moves: scoreData.moves || 0,
      durationSeconds: scoreData.durationSeconds || 0,
      maxLevel: scoreData.maxLevel || 1,
      isCompleted: scoreData.isCompleted || false,
      levelDetails: scoreData.levelDetails || []
    };

    try {
      // 使用 text/plain 避免觸發 CORS 預檢限制
      const res = await fetch(CAI_CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok || !result || result.status !== 'success') {
        console.warn('GAS 回傳成績寫入失敗:', result);
        return {
          status: 'error',
          message: (result && result.message) || `HTTP ${res.status}`
        };
      }
      return result;
    } catch (err) {
      console.warn('成績上傳失敗或離線:', err.message || err);
      return {
        status: 'network_error',
        message: '無法連線至成績伺服器'
      };
    }
  },

  /**
   * 取得指定班級前 10 名排行榜
   */
  async getLeaderboard(classId) {
    try {
      const url = `${CAI_CONFIG.GAS_API_URL}?action=getLeaderboard&classId=${encodeURIComponent(classId || '')}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      console.warn('無法取得排行榜:', err);
      return {
        status: 'error',
        topList: []
      };
    }
  }
};

window.CAI = CAI;

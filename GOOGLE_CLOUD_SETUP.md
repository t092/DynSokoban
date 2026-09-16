# Google Cloud Console：Google 登入與憑證設定指南

本指南專門為《中國朝代 SOKOBAN》CAI 教學系統設定 **Google 登入（Google Identity Services）** 所編寫。完成設定後，即可取得一組 **`Client ID`**，用於限制與驗證學生使用 `@st.tc.edu.tw` 帳號登入。

---

## 步驟一：進入 Google Cloud Console 並建立專案

1. 開啟瀏覽器，前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建議使用**學校教育帳號**或**教師 Google 帳號**登入。
3. 點擊頂端列的 **專案下拉選單** $\rightarrow$ 點擊右上角 **「新增專案」**。
4. **專案名稱**：輸入好辨識的名稱（例如：`Dynasty-Sokoban-CAI`）。
5. 點擊 **「建立」**，並確認頂端切換至該專案。

---

## 步驟二：配置「OAuth 同意畫面」

> ⚠️ 若是新專案，Google 會強制要求先設定同意畫面才能建立憑證。

1. 點擊左上角漢堡選單（☰）$\rightarrow$ 選擇 **「API 和服務」** $\rightarrow$ **「OAuth 同意畫面」**。
2. **使用者類型（User Type）**：
   - **內部（Internal）**：若您使用的是學校 Google Workspace 帳號，請選此項（最安全，僅同校/同網域帳號可登入）。
   - **外部（External）**：若您使用的是個人 `@gmail.com` 帳號建立專案，請選此項。
3. 點擊 **「建立」**。
4. **填寫應用程式資訊**：
   - **應用程式名稱**：`中國朝代 SOKOBAN 教學系統`
   - **使用者支援電子郵件**：選擇您的 Email
   - **開發人員聯絡資訊**：填寫您的 Email
5. 點擊 **「儲存並繼續」**（後續的「範圍」與「測試使用者」步驟直接點儲存到底即可）。

---

## 步驟三：建立 OAuth 用戶端 ID 並找到「授權的 JavaScript 來源」

1. 點選左側選單的 **「憑證」**（Credentials）。
2. 點擊頂部的 **「＋ 建立憑證」** $\rightarrow$ 選擇 **「OAuth 用戶端 ID」**。
3. **應用程式類型**（Application type）：下拉選單選擇 **「網頁應用程式」**（Web application）。
4. **名稱**：可保留預設或輸入 `朝代推箱子前端`。
5. 往下滾動頁面，找到關鍵區塊：**「授權的 JavaScript 來源」**（Authorized JavaScript origins）：
   - 點擊 **「＋ 新增 URI」**。
   - 根據您的運行環境填入網址（**注意：網址末端絕不可加斜線 `/`**）：
     - **GitHub Pages 網址**（重要）：  
       `https://t092.github.io`
     - **本機開發測試網址**（依您使用的本機伺服器而定）：  
       `http://localhost:5500`  
       `http://127.0.0.1:5500`  
       `http://localhost:3000`
6. （備註：「已授權的重新導向 URI」前端單純登入時**不需填寫**，留空即可）。
7. 點擊最下方的 **「建立」**。

---

## 步驟四：取得並妥善保存 Client ID

建立成功後，畫面上會彈出 **「已建立 OAuth 用戶端」** 視窗：

- **用戶端 ID (Client ID)**：長度約 70~80 個字元，格式如下：
  ```text
  123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
  ```
- 點擊右側的 **複製圖示**，將這串字元保留下來。
- （用戶端密碼 Client Secret 純前端不會用到，無須擔心）。

---

## 步驟五：未來於前端專案的填寫位置

取得 Client ID 後，將會配置在遊戲前端的設定中，範例如下：

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
  const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com";

  // Google 登入初始化配置（限制僅允許 st.tc.edu.tw 網域）
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    hd: "st.tc.edu.tw" // 強制限制台中市學生網域
  });
</script>
```

---

## 常見問題與排除（FAQ）

1. **Q：登入時跳出 `[GSI_LOGGER]: The given origin is not allowed for the given client ID`？**
   - **A**：代表您目前的網頁網址沒有列在「授權的 JavaScript 來源」中，或是網址末端多加了斜線 `/`。請回到憑證編輯畫面，補上當前網址並儲存，等待約 3~5 分鐘生效。
2. **Q：剛修改完授權來源，為什麼還是無法登入？**
   - **A**：Google 的雲端網域設定全球同步通常需要 **1 到 5 分鐘**，請稍等片刻並使用無痕視窗重新整理測試。

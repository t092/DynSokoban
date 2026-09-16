# 「中國朝代 SOKOBAN」電腦輔助教學（CAI）系統升級計畫書

本計畫書旨在將現有的純前端單機遊戲《中國朝代 SOKOBAN》升級為具備教育評量與課堂互動效力的**電腦輔助教學（CAI）系統**。透過整合**台中市學生教育帳號（`st.tc.edu.tw`）單一簽入**與**教師端 Google 試算表（Google Apps Script）**，達成學生免記密碼快速登入、學習歷程精準診斷、以及課堂即時排行榜激勵三大核心目標。

---

## 一、 專案目標與三大核心需求

1. **學生身分認證（Authentication & Identification）**
   - 採用台中市教育局 Google Workspace 網域（`@st.tc.edu.tw`）進行 OAuth 2.0 登入。
   - 透過網域白名單（Hosted Domain: `hd: "st.tc.edu.tw"`）嚴格防偽，杜絕非校內人士或冒名代考。
   - 一鍵單一簽入（SSO），學生在 Chromebook 或已登入學校帳號的 Chrome 瀏覽器上免密碼 1 秒進入。

2. **記錄學生成績與學習歷程（Learning Analytics）**
   - 記錄每位學生的最高總分、通關時間、通關總步數。
   - 記錄關卡診斷數據（第 1～5 關分別得分、步數、重試次數），提供教師掌握班級在特定歷史分期（如魏晉南北朝、遼宋金元）的認知盲點。

3. **記錄得分與即時排行榜比較（Leaderboard & Peer Motivation）**
   - 即時計算學生在「班級內部」的名次（Rank）與超越百分比（PR 值）。
   - 提供全班即時光榮榜，激發課堂挑戰氣氛。
   - 通關結算時提供個人成就反饋。

---

## 二、 系統架構與技術選型

```mermaid
graph TD
    subgraph Client ["學生端 (Web 前端)"]
        UI_Login["st.tc.edu.tw Google 一鍵登入"]
        Game_Core["朝代推箱子核心遊戲邏輯"]
        UI_HUD["頂部學籍狀態列與即時排行榜浮窗"]
        UI_Summary["通關結算卡 (排名、PR值、步數)"]
    end

    subgraph Auth ["Google 身分驗證 (GIS)"]
        GIS["Google Identity Services<br/>hd: st.tc.edu.tw"]
    end

    subgraph Backend ["後端與資料儲存 (Google 生態系)"]
        GAS["Google Apps Script (Web App)<br/>LockService 併發排隊控制"]
        Sheet_Roster["工作表 1：學生名冊 (VLOOKUP)"]
        Sheet_Logs["工作表 2：成績歷程流水帳"]
        Sheet_Rank["工作表 3：即時排行榜 (Leaderboard)"]
    end

    subgraph Teacher ["教師端 (課堂管理)"]
        Dashboard["Google 試算表即時戰況投影牆"]
    end

    UI_Login -->|授權請求| GIS
    GIS -->|回傳學生姓名與 Email Token| UI_Login
    UI_Login --> Game_Core
    Game_Core --> UI_HUD
    Game_Core -->|通關/結算 POST 數據| GAS
    GAS -->|讀寫資料| Sheet_Logs
    GAS -->|更新最佳紀錄與算排名| Sheet_Rank
    Sheet_Roster -.->|媒合班級座號| Sheet_Rank
    GAS -->>|回傳班級名次與 Top10| UI_Summary
    Sheet_Rank --> Dashboard
```

- **前端技術**：HTML5 + 原生 CSS3 + Vanilla JavaScript + Google Identity Services (GIS) SDK。
- **後端技術**：Google Apps Script（輕量 Serverless API，零主機維護成本）。
- **資料庫**：Google 試算表（Google Spreadsheet，教師最熟悉的管理介面，支援一鍵匯出 Excel）。

---

## 三、 Google 試算表結構設計（資料庫綱要）

在老師帳號下的單一 Google 試算表中建立三張工作表：

### 1. `學生名冊`（Roster，可選但建議由老師預先匯入）
| 欄位 | 說明 | 範例 |
| :--- | :--- | :--- |
| `Email` (PK) | 學生教育帳號 | `s111001@st.tc.edu.tw` |
| `班級` | 班級代碼 | `702` |
| `座號` | 兩位數座號 | `05` |
| `姓名` | 學生官方真實姓名 | `陳小華` |

### 2. `即時排行榜`（Leaderboard，主資料表）
以學生的 `Email` 作為唯一鍵，每個學生只保留**歷史最佳表現**：
| 欄位 | 說明 | 備註 |
| :--- | :--- | :--- |
| `Email` (PK) | 學生帳號 | 用於防偽與唯一識別 |
| `班級` | 班級代號 | 供班級篩選 |
| `座號` | 座號 | 供排序檢視 |
| `姓名` | 學生姓名 | 榜單顯示（可遮罩保護個資） |
| `最高總分` | 歷史最高積分 | 排名主要依據（降冪） |
| `最少總步數` | 通關總步數 | 同分時次要依據（升冪） |
| `最佳耗時(秒)` | 通關總秒數 | 同步數時第三依據（升冪） |
| `最高解鎖關卡` | 目前突破至第幾關 | 顯示學習進度（如「第5關通關」） |
| `最近測驗時間` | 最後更新時間 | 格式：`YYYY/MM/DD HH:mm` |
| `班級名次` | 試算表公式自動計算 | `=RANK(...)` 或 GAS 計算 |

### 3. `成績歷程`（Scores_Log，學習診斷流水帳）
學生每次點擊重新開始、中途結算或通關，均追加一筆歷程，供教學成效診斷：
| 欄位 | 說明 |
| :--- | :--- |
| `時間戳記` | 提交時間 |
| `Email` / `班級` / `座號` / `姓名` | 學生完整基本資訊 |
| `本次得分` / `總步數` / `耗時(秒)` | 當次遊玩總體數據 |
| `第1關 (夏商周大分期)` | 本關得分 / 步數 / 重試扣分次數 |
| `第2關 (商到漢)` | 本關得分 / 步數 / 重試扣分次數 |
| `第3關 (秦到唐/魏晉)` | 本關得分 / 步數 / 重試扣分次數 |
| `第4關 (唐到宋元明清)` | 本關得分 / 步數 / 重試扣分次數 |
| `第5關 (歷代全時序)` | 本關得分 / 步數 / 重試扣分次數 |
| `通關判定` | `全部通關` / `第X關中斷` / `分數歸零結束` |

---

## 四、 前端與後端 API 互動規格

### 1. 前端向後端提交成績 (`submitScore`)
- **請求方法**：`POST`（透過 `fetch` 傳送 JSON 字串）
- **發送資料**：
  ```json
  {
    "action": "submitScore",
    "idToken": "Google_JWT_憑證",
    "email": "s111001@st.tc.edu.tw",
    "name": "陳小華",
    "classId": "702",
    "seatNo": "05",
    "totalScore": 95,
    "moves": 132,
    "durationSeconds": 240,
    "maxLevel": 5,
    "isCompleted": true,
    "levelDetails": [
      { "level": 1, "score": 10, "moves": 14, "retries": 0 },
      { "level": 2, "score": 15, "moves": 22, "retries": 0 },
      { "level": 3, "score": 20, "moves": 30, "retries": 0 },
      { "level": 4, "score": 25, "moves": 32, "retries": 0 },
      { "level": 5, "score": 25, "moves": 34, "retries": 1 }
    ]
  }
  ```
- **GAS 後端處理**：
  1. 使用 `LockService.getScriptLock()`，設定 10 秒排隊，避免全班併發寫入衝突。
  2. 寫入 `Scores_Log` 工作表。
  3. 比對並更新 `Leaderboard` 中該生最高分數（若刷新紀錄則覆蓋）。
  4. 計算該生在該班級中的名次與超越百分比（PR 值）。
  5. 回傳最新班級前 10 名排行榜摘要。
- **回傳內容**：
  ```json
  {
    "status": "success",
    "rank": 2,
    "totalStudents": 35,
    "percentile": 94,
    "isNewRecord": true,
    "classTop10": [
      { "rank": 1, "name": "張○豪", "score": 100, "moves": 118 },
      { "rank": 2, "name": "陳○華", "score": 95, "moves": 132 }
    ]
  }
  ```

### 2. 查詢即時排行榜 (`getLeaderboard`)
- **請求方法**：`GET`
- **參數**：`?action=getLeaderboard&classId=702`
- **回傳**：該班目前最佳前 10 名名冊，供遊戲中「🏆 排行榜」按鈕彈窗顯示。

---

## 五、 使用者介面（UI/UX）改動規劃

### 1. 首頁 (`index.html`)
- **模組主題**：標題設為 **「學習作業」**。
- **未登入狀態**：
  - 認證卡提供：`[ 使用學生學習帳號登入 (st.tc.edu.tw) ]`。
  - **免登入體驗功能**：提供 `[ 🎮 免登入直接體驗試玩 ]` 按鈕，可進入遊戲體驗所有關卡，但介面明確提示「體驗模式不會將成績記錄至試算表與排行榜」。
  - **公用裝置安全性（教室防呆）**：全面採用 **`sessionStorage`** 儲存狀態，只要學生關閉網頁分頁或瀏覽器，所有學籍登入資訊立刻自動抹除，下一位同學使用該電腦必須重新登入。
  - **班級座號綁定（一般學生）**：學生首次以學習帳號登入後，彈出極簡確認窗確認「班級」與「座號」，確認後存入 session。
  - **隱藏教師測試機制**：若登入 Email 為 `t202@st.tc.edu.tw`，UI 不做任何提示，系統背景自動將班級設為「教師」、座號設為「測試」，直接進入遊戲。

- **已登入狀態**：
  - 顯示學員標籤：`👤 702班 05號 陳小華`（教師帳號則顯示 `👤 教師`），附帶 `[登出]` 按鈕。
  - 「開始作業」按鈕解鎖點亮。

### 2. 遊戲頁 (`dynasty-push-game.html`)
- **頂部 HUD 升級**：
  - 若已登入：顯示 `👤 702班 05號 陳小華`，並顯示 `[🏆 班級排行榜]` 快捷按鈕。
  - 若免登入體驗：顯示 `👤 體驗模式（不計成績）`，排行榜按鈕反灰或提示需登入才可查看。
- **成績上傳判定**：
  - 只有**正式登入的帳號**在通關時才會背景非同步送出成績至 Google 試算表並換算班級排名。
  - 體驗模式通關僅在本地彈窗結算分數，不與後端連線發送數據。
- **排行榜浮動視窗（Leaderboard Modal）**：
  - 典雅的古風羊皮紙風格彈窗，展示該班 Top 10（金、銀、銅獎牌徽章、姓名遮罩、得分、步數）。
- **通關結算榮譽卡（Game Clear Modal）**：
  - 正式登入學生結算時跳出精美卡片：
    > 📜 **朝代大挑戰 · 測驗成果**  
    > 本次得分：**95 分**（步數：132 步 / 耗時：4分0秒）  
    > 🏆 目前在 **702 班** 排名第 **2** 名（超越 **94%** 的同學）！  
    > 成績已同步上傳至課堂紀錄簿。

---

## 六、 課堂實施可行性與前置作業

本方案只需兩項前置作業，完全免費且永久有效：
1. **Google Cloud Console 建立 OAuth Client ID**：
   - 在 Google Cloud Console 啟用 Google Identity Services，將「授權的 JavaScript 來源」填入遊戲發布的網址（如 GitHub Pages、學校網站等），取得一組 `Client ID`。
2. **建立 Google 試算表與部署 Apps Script**：
   - 建立一張新的試算表，進入「擴充功能 > Apps Script」，貼上後端程式碼。
   - 點擊「部署 > 新增部署 > 網頁應用程式」，存取權限設為「任何人」，取得一組 `Web App URL` 並填入前端設定檔。

---

## 七、 實施階段規劃（Milestones）

| 階段 | 任務內容 | 產出成果 |
| :--- | :--- | :--- |
| **階段 1** | **Google Apps Script 後端腳本與試算表模板開發** | 完整的試算表模板、GAS API 程式碼（含 LockService 防撞機制） |
| **階段 2** | **前端 Google Identity Services (GIS) 登入串接** | 限制 `st.tc.edu.tw` 的登入模組、登入狀態記憶、姓名解析 |
| **階段 3** | **遊戲歷程遙測與成績自動同步** | 記錄各關步數/重試數據，通關自動非同步傳送至 GAS |
| **階段 4** | **排行榜 UI 與名次結算卡實裝** | 班級 Top 10 彈窗、通關即時名次與百分比反饋 |
| **階段 5** | **課堂情境壓力測試與離線防呆** | 測試無痕模式相容性、40 人同時提交抗壓性、斷網暫存機制 |

---

## User Review Required

> [!IMPORTANT]
> **請確認以下實施前提：**
> 1. 學生在電腦教室或平板遊玩時，是否皆具備外網連線能力以存取 Google 登入與試算表服務？
> 2. 老師是否有個人的 Google 帳號（或學校的 `@tc.edu.tw` 教師帳號），可供建立試算表作為成績後台？

---

## Open Questions

> [!NOTE]
> **設計偏好確認：**
> 1. **班級座號辨識方式**：您偏好由老師在試算表預先貼上「學生名冊」自動由 Email 帶出班級座號，還是讓學生在第一次登入時自行輸入一次「班級」與「座號」並綁定？
> 2. **排行榜範圍**：在課堂上，排行榜是以「單一班級內部競賽」為主，還是希望同時能切換查看「全年級榮譽總榜」？

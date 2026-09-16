# Google Apps Script (GAS) 後端建置與 CLASP 部署規劃書

本文件詳細規劃《中國朝代 SOKOBAN》CAI 系統之 Google Apps Script (GAS) 後端架構、程式碼設計與 CLASP 自動化部署指令。

---

## 一、 基本資訊與專案配置

- **Apps Script 專案 ID**：`1GFpzbC5PhfPbCbctl6PodUQKhBSmjQ3QIr2i6yHjcvX37E4iwIMCQOSD`
- **目錄架構規劃**：
  建議在專案中建立獨立的 `gas/` 資料夾，將 GAS 後端腳本與前端 HTML 乾淨分離，避免檔案混雜：
  ```text
  l2b1/
  ├── .clasp.json               <-- CLASP 設定檔 (指向 scriptId 與 rootDir)
  ├── gas/
  │   ├── appsscript.json       <-- Apps Script 專案設定檔 (V8、台北時區)
  │   └── Code.js               <-- GAS 後端核心邏輯 (doGet, doPost, 資料庫操作)
  ├── dynasty-push-game.html    <-- 遊戲前端
  ├── index.html                <-- 遊戲首頁
  └── ...
  ```

---

## 二、 GAS 後端程式碼 (`Code.js`) 功能規劃

後端將承擔「資料庫初始化」、「成績寫入防撞」、「即時排名運算」三大任務：

### 1. 資料庫自動初始化機制（Auto-Init）
當試算表首次接收請求時，自動建立並格式化三張工作表，無需手動建立：
- **`即時排行榜`**：欄位包括 `Email`, `班級`, `座號`, `姓名`, `最高總分`, `最少總步數`, `最佳秒數`, `最高關卡`, `最後更新時間`。
- **`成績歷程`**：欄位包括 `時間戳記`, `Email`, `班級`, `座號`, `姓名`, `總得分`, `總步數`, `總秒數`, `通關狀態`, `各關細節 JSON`。
- **`學生名冊`**（備用）：欄位包括 `Email`, `班級`, `座號`, `姓名`。

### 2. `doPost(e)`：提交成績與併發防撞（Concurrency Control）
- **高併發防撞**：使用 `LockService.getScriptLock()`，設定 10 秒排隊鎖定，避免全班 40 位學生下課前同時通關導致寫入衝突或掉資料。
- **資料處理流程**：
  1. 解析前端傳入的 JSON 酬載（`email`, `name`, `classId`, `seatNo`, `totalScore`, `moves`, `durationSeconds`, `levelDetails` 等）。
  2. 寫入一筆完整歷程至 `成績歷程` 表。
  3. 比對 `即時排行榜`：
     - 若為新學生，新增一列。
     - 若為既有學生，判斷是否破個人紀錄（分數更高，或同分但步數更少），破紀錄則更新。
  4. 依班級（或全體）即時計算名次（Rank）與超越百分比（PR 值）。
  5. 抓取該班 Top 10 排行榜快照。
  6. 回傳 JSON 結果（使用 `ContentService.createTextOutput` 搭配 `MimeType.JSON`）。

### 3. `doGet(e)`：排行榜查詢與健康檢查
- `action === 'getLeaderboard'`：依據傳入的 `classId`，回傳該班前 10 名排行榜。
- 預設動作：回傳健康檢查 JSON `{ status: 'ok', time: new Date() }`。

---

## 三、 CLASP 部署與執行步驟指令

取得您的確認許可後，將執行的具體指令流程如下：

### 步驟 1：建立專案配置檔 `.clasp.json`
```json
{
  "scriptId": "1GFpzbC5PhfPbCbctl6PodUQKhBSmjQ3QIr2i6yHjcvX37E4iwIMCQOSD",
  "rootDir": "./gas"
}
```

### 步驟 2：建立 GAS 腳本檔案
1. 建立 `gas/appsscript.json`（設定時區 `Asia/Taipei` 與 webapp 執行權限）。
2. 建立 `gas/Code.js`（撰寫完整的後端 API 與試算表邏輯）。

### 步驟 3：透過 CLASP 推送至 Google Apps Script
```bash
# 1. 檢查 clasp 登入狀態
clasp login --status

# 2. 將本地 gas/ 程式碼推送到 Google Apps Script 雲端
clasp push

# 3. (選用) 建立或更新版本部署
clasp deploy --description "v1.0.0 CAI Leaderboard and Score Logging"
```

---

## 四、 預期回傳給前端的 API 規格範例

### 學生通關送出成績回傳：
```json
{
  "status": "success",
  "rank": 3,
  "totalInClass": 36,
  "percentile": 92,
  "isNewRecord": true,
  "top10": [
    { "rank": 1, "name": "陳*明", "score": 100, "moves": 118 },
    { "rank": 2, "name": "林*豪", "score": 98, "moves": 124 },
    { "rank": 3, "name": "王*華", "score": 95, "moves": 130 }
  ]
}
```

---

## 五、 請您確認事項

1. **CLASP 登入狀態**：您的終端機先前是否已執行過 `clasp login` 登入過具備該 Script ID 權限的 Google 帳號？
2. **目錄結構**：將 GAS 檔案放在 `./gas` 子目錄中是否符合您的偏好？

> ⚠️ **在您檢閱並回覆「確認 OK」之前，不會執行任何檔案建立或 CLASP 指令。**

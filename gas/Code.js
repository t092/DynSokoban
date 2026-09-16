/**
 * 中國朝代 SOKOBAN - CAI 教學系統 Google Apps Script 後端 API
 * 支援：學生登入紀錄、學習歷程流水帳、即時班級排行榜、40人高併發排隊防撞
 */

const SHEET_NAMES = {
  LEADERBOARD: '即時排行榜',
  LOGS: '成績歷程',
  ROSTER: '學生名冊'
};

const TARGET_SPREADSHEET_ID = '1Gsf_NKPJZHbG5WbmW7qKh2jPBYkuTyhoCVlxx2pDfXE';

/**
 * 取得試算表物件 (以 TARGET_SPREADSHEET_ID 開啟，或讀取容器綁定試算表)
 */
function getSpreadsheet() {
  let ss = null;
  if (TARGET_SPREADSHEET_ID) {
    try {
      ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } catch (err) {
      console.warn('無法透過 TARGET_SPREADSHEET_ID 開啟:', err);
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) {
    const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (propId) {
      ss = SpreadsheetApp.openById(propId);
    }
  }
  if (!ss) {
    throw new Error('找不到可用的 Google 試算表。請確認 TARGET_SPREADSHEET_ID 或設定 SPREADSHEET_ID 屬性。');
  }
  return ss;
}

/**
 * 自動檢查並建立工作表與標題列
 */
function ensureSheet(ss, sheetName, headers, headerColor) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight('bold')
         .setBackground(headerColor || '#3c352d')
         .setFontColor('#ffffff')
         .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 初始化所有必要工作表
 */
function initSheets(ss) {
  ensureSheet(ss, SHEET_NAMES.LEADERBOARD, [
    'Email', '班級', '座號', '姓名', '最高總分', '最少總步數', '最佳耗時(秒)', '最高關卡', '最後更新時間'
  ], '#2a4d69');

  ensureSheet(ss, SHEET_NAMES.LOGS, [
    '時間戳記', 'Email', '班級', '座號', '姓名', '本次得分', '總步數', '總耗時(秒)', '通關狀態', '各關細節 JSON'
  ], '#4b5d67');

  ensureSheet(ss, SHEET_NAMES.ROSTER, [
    'Email', '班級', '座號', '姓名'
  ], '#63707e');
}

/**
 * 姓名個資保護遮罩 (如: 王大明 -> 王○明, 歐陽美美 -> 歐○○美)
 */
function maskName(name) {
  if (!name || typeof name !== 'string') return '匿名學生';
  const len = name.length;
  if (len <= 1) return name;
  if (len === 2) return name[0] + '○';
  return name[0] + '○'.repeat(len - 2) + name[len - 1];
}

/**
 * 格式化時間戳記 (台北時間 YYYY-MM-DD HH:mm:ss)
 */
function getTimestamp() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
}

/**
 * 回傳統一格式 JSON
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * GET 請求處理：查詢排行榜或健康檢查
 */
function doGet(e) {
  try {
    const ss = getSpreadsheet();
    initSheets(ss);
    const params = (e && e.parameter) || {};
    const action = params.action || 'ping';

    if (action === 'getLeaderboard') {
      const classId = (params.classId || '').trim();
      const topList = getTopStudents(ss, classId, 10);
      return createJsonResponse({
        status: 'success',
        action: 'getLeaderboard',
        classId: classId || 'ALL',
        topList: topList,
        timestamp: getTimestamp()
      });
    }

    return createJsonResponse({
      status: 'ok',
      message: '中國朝代 SOKOBAN CAI API 運作中',
      timestamp: getTimestamp()
    });
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: err.message
    });
  }
}

/**
 * POST 請求處理：提交學生成績
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(10000); // 10秒排隊防止併發搶佔

  if (!hasLock) {
    return createJsonResponse({
      status: 'error',
      message: '伺服器正忙碌中，請稍候重試'
    });
  }

  try {
    const ss = getSpreadsheet();
    initSheets(ss);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = e.parameter || {};
      }
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action || 'submitScore';

    if (action === 'submitScore') {
      const email = String(payload.email || '').trim().toLowerCase();
      const name = String(payload.name || '').trim();
      const classId = String(payload.classId || '').trim();
      const seatNo = String(payload.seatNo || '').trim();
      const totalScore = Number(payload.totalScore) || 0;
      const moves = Number(payload.moves) || 0;
      const durationSeconds = Number(payload.durationSeconds) || 0;
      const maxLevel = Number(payload.maxLevel) || 1;
      const isCompleted = Boolean(payload.isCompleted);
      const levelDetails = JSON.stringify(payload.levelDetails || []);
      const statusText = isCompleted ? '全部通關' : `挑戰至第 ${maxLevel} 關`;
      const timeStr = getTimestamp();

      if (!email) {
        return createJsonResponse({
          status: 'error',
          message: '缺少學生 Email 辨識資訊'
        });
      }

      // 1. 寫入【成績歷程】流水帳
      const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      logSheet.appendRow([
        timeStr, email, classId, seatNo, name, totalScore, moves, durationSeconds, statusText, levelDetails
      ]);

      // 2. 更新【即時排行榜】最佳紀錄
      const rankSheet = ss.getSheetByName(SHEET_NAMES.LEADERBOARD);
      const data = rankSheet.getDataRange().getValues();
      let rowIndex = -1;
      let existingRecord = null;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === email) {
          rowIndex = i + 1; // 1-indexed for Sheet row
          existingRecord = {
            score: Number(data[i][4]) || 0,
            moves: Number(data[i][5]) || 999999,
            duration: Number(data[i][6]) || 999999
          };
          break;
        }
      }

      let isNewRecord = false;
      if (!existingRecord) {
        // 全新學生
        isNewRecord = true;
        rankSheet.appendRow([
          email, classId, seatNo, name, totalScore, moves, durationSeconds, statusText, timeStr
        ]);
      } else {
        // 破紀錄判斷：分數更高，或同分但步數更少
        if (totalScore > existingRecord.score || (totalScore === existingRecord.score && moves < existingRecord.moves)) {
          isNewRecord = true;
          rankSheet.getRange(rowIndex, 2, 1, 8).setValues([[
            classId, seatNo, name, totalScore, moves, durationSeconds, statusText, timeStr
          ]]);
        }
      }

      // 3. 計算該生在班級中的即時名次與 PR 值
      const rankInfo = computeRankAndPercentile(rankSheet, email, classId);
      const topList = getTopStudents(ss, classId, 10);

      return createJsonResponse({
        status: 'success',
        isNewRecord: isNewRecord,
        rank: rankInfo.rank,
        totalInClass: rankInfo.totalInClass,
        percentile: rankInfo.percentile,
        classId: classId || 'ALL',
        topList: topList,
        timestamp: timeStr
      });
    }

    return createJsonResponse({
      status: 'error',
      message: `未知的 action: ${action}`
    });

  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: err.message
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 計算名次與超越百分比 (PR值)
 */
function computeRankAndPercentile(rankSheet, targetEmail, classId) {
  const data = rankSheet.getDataRange().getValues();
  const students = [];

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][0]).trim().toLowerCase();
    const rowClass = String(data[i][1]).trim();
    if (!classId || rowClass === classId) {
      students.push({
        email: rowEmail,
        score: Number(data[i][4]) || 0,
        moves: Number(data[i][5]) || 999999,
        duration: Number(data[i][6]) || 999999
      });
    }
  }

  // 排序規則：分數高者優先 -> 步數少者優先 -> 秒數少者優先
  students.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.moves !== b.moves) return a.moves - b.moves;
    return a.duration - b.duration;
  });

  const totalInClass = students.length;
  let rank = 1;
  for (let i = 0; i < students.length; i++) {
    if (students[i].email === targetEmail) {
      rank = i + 1;
      break;
    }
  }

  // 百分等級 (PR值)：超越多少比例的同學
  const percentile = totalInClass <= 1 ? 100 : Math.max(1, Math.min(99, Math.round(((totalInClass - rank + 1) / totalInClass) * 100)));

  return { rank, totalInClass, percentile };
}

/**
 * 抓取班級或全體 Top N 排行榜
 */
function getTopStudents(ss, classId, limit) {
  const rankSheet = ss.getSheetByName(SHEET_NAMES.LEADERBOARD);
  if (!rankSheet) return [];
  const data = rankSheet.getDataRange().getValues();
  const list = [];

  for (let i = 1; i < data.length; i++) {
    const rowClass = String(data[i][1]).trim();
    if (!classId || rowClass === classId) {
      list.push({
        name: maskName(String(data[i][3])),
        seatNo: String(data[i][2]),
        classId: rowClass,
        score: Number(data[i][4]) || 0,
        moves: Number(data[i][5]) || 0,
        duration: Number(data[i][6]) || 0,
        maxLevel: String(data[i][7])
      });
    }
  }

  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.moves !== b.moves) return a.moves - b.moves;
    return a.duration - b.duration;
  });

  return list.slice(0, limit || 10).map((item, idx) => ({
    rank: idx + 1,
    ...item
  }));
}

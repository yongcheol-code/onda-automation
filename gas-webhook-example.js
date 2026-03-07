// =====================================================
// GAS (Google Apps Script) 에 추가할 코드
// 기존 메일 파싱 코드 아래에 붙여넣기
// =====================================================

const RENDER_URL = 'https://onda-automation.onrender.com'; // Render 배포 후 URL로 변경
const WEBHOOK_SECRET = 'YOUR_SECRET_HERE'; // .env의 WEBHOOK_SECRET과 동일

/**
 * 방막기 호출 (예약 완료 시)
 * @param {string} roomName - 객실명 (예: "Lodge Loft A")
 * @param {string[]} dates - 날짜 배열 (예: ["2026-03-10", "2026-03-11"])
 * @param {string} memo - 메모
 */
function closeRoom(roomName, dates, memo) {
  const url = RENDER_URL + '/close';
  const payload = JSON.stringify({ room: roomName, dates: dates, memo: memo });
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: payload,
    muteHttpExceptions: true,
  };
  
  const res = UrlFetchApp.fetch(url, options);
  Logger.log('방막기 응답: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

/**
 * 방열기 호출 (예약 취소 시)
 */
function openRoom(roomName, dates, memo) {
  const url = RENDER_URL + '/open';
  const payload = JSON.stringify({ room: roomName, dates: dates, memo: memo });
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: payload,
    muteHttpExceptions: true,
  };
  
  const res = UrlFetchApp.fetch(url, options);
  Logger.log('방열기 응답: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

// =====================================================
// 기존 메일 파싱 함수에서 호출 예시:
// =====================================================
// 예약 완료 메일 처리 시:
//   closeRoom('Lodge Loft A', ['2026-03-10', '2026-03-11'], '예약#12345');
//
// 예약 취소 메일 처리 시:
//   openRoom('Lodge Loft A', ['2026-03-10', '2026-03-11'], '취소#12345');

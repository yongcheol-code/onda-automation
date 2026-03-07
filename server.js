require('dotenv').config();
const express = require('express');
const { getToken } = require('./auth');
const { closeRooms, openRooms, ROOM_MAP } = require('./onda-api');
const { sendSlack } = require('./slack');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

// 웹훅 시크릿 검증 미들웨어
function verifySecret(req, res, next) {
  if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: '인증 실패' });
  }
  next();
}

// ── 헬스체크 ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: '온다 자동화 서버 가동중' });
});

// ── 방막기 웹훅 ────────────────────────────────────────
// POST /close
// Body: { room: "Lodge Loft A", dates: ["2026-03-10"], memo: "예약완료" }
app.post('/close', verifySecret, async (req, res) => {
  const { room, dates, memo = '자동 방막기' } = req.body;

  if (!room || !dates || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'room, dates 필수' });
  }
  if (!ROOM_MAP[room]) {
    return res.status(400).json({ error: `알 수 없는 객실: ${room}`, available: Object.keys(ROOM_MAP) });
  }

  console.log(`[Close] ${room} / ${dates.join(', ')}`);

  try {
    const token = await getToken();
    const result = await closeRooms(token, room, dates, memo);
    
    const msg = `🚫 *방막기 완료*\n• 객실: ${room}\n• 날짜: ${dates.join(', ')}\n• 메모: ${memo}`;
    await sendSlack(msg);
    
    res.json({ success: true, room, dates, result });
  } catch (err) {
    console.error('[Close] 실패:', err.message);
    await sendSlack(`❌ *방막기 실패*\n• 객실: ${room}\n• 날짜: ${dates.join(', ')}\n• 오류: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 방열기 웹훅 ────────────────────────────────────────
// POST /open
// Body: { room: "Lodge Loft A", dates: ["2026-03-10"], memo: "예약취소" }
app.post('/open', verifySecret, async (req, res) => {
  const { room, dates, memo = '자동 방열기' } = req.body;

  if (!room || !dates || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'room, dates 필수' });
  }
  if (!ROOM_MAP[room]) {
    return res.status(400).json({ error: `알 수 없는 객실: ${room}`, available: Object.keys(ROOM_MAP) });
  }

  console.log(`[Open] ${room} / ${dates.join(', ')}`);

  try {
    const token = await getToken();
    const result = await openRooms(token, room, dates, memo);
    
    const msg = `✅ *방열기 완료*\n• 객실: ${room}\n• 날짜: ${dates.join(', ')}\n• 메모: ${memo}`;
    await sendSlack(msg);
    
    res.json({ success: true, room, dates, result });
  } catch (err) {
    console.error('[Open] 실패:', err.message);
    await sendSlack(`❌ *방열기 실패*\n• 객실: ${room}\n• 날짜: ${dates.join(', ')}\n• 오류: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 객실 목록 ──────────────────────────────────────────
app.get('/rooms', (req, res) => {
  res.json({ rooms: Object.keys(ROOM_MAP) });
});

app.listen(PORT, () => {
  console.log(`🏨 온다 자동화 서버 시작 (port ${PORT})`);
});

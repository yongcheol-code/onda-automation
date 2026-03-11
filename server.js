require('dotenv').config();
const express = require('express');
const { getToken } = require('./auth');
const { closeRooms, openRooms, ROOM_MAP } = require('./onda-api');
const { sendSlack } = require('./slack');
const { login: sfLogin, createBooking, ROOM_ID_MAP } = require('./stayfolio');

// 스테이폴리오 세션 캐시
let sfSession = null;
async function getSfSession() {
  if (sfSession) return sfSession;
  sfSession = await sfLogin(process.env.SF_EMAIL, process.env.SF_PASSWORD);
  return sfSession;
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function verifySecret(req, res, next) {
  if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: '인증 실패' });
  }
  next();
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: '온다 자동화 서버 가동중' });
});

// 방막기
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
    await sendSlack(`🚫 *방막기 완료*\n• 객실: ${room}\n• 날짜: ${dates.join(', ')}\n• 메모: ${memo}`);
    res.json({ success: true, room, dates, result });
  } catch (err) {
    console.error('[Close] 실패:', err.message);
    await sendSlack(`❌ *방막기 실패*\n• 객실: ${room}\n• 오류: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 방열기
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
    await sendSlack(`✅ *방열기 완료*\n• 객실: ${room}\n• 날짜: ${dates.join(', ')}\n• 메모: ${memo}`);
    res.json({ success: true, room, dates, result });
  } catch (err) {
    console.error('[Open] 실패:', err.message);
    await sendSlack(`❌ *방열기 실패*\n• 객실: ${room}\n• 오류: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 스테이폴리오 수기예약 생성
app.post('/stayfolio-create', verifySecret, async (req, res) => {
  const {
    room, checkin, checkout,
    guestName, phone, email = '',
    adults = 2, children = 0, infants = 0,
    countryCode = '+82',
    ondaBookingId = '', ondaGuestName = '',
  } = req.body;

  if (!room || !checkin || !checkout || !guestName || !phone) {
    return res.status(400).json({ error: 'room, checkin, checkout, guestName, phone 필수' });
  }
  const roomId = ROOM_ID_MAP[room];
  if (!roomId) {
    return res.status(400).json({ error: `객실 ID 미설정: ${room}` });
  }

  const adminMemo = [
    '[ONDA 자동생성]',
    ondaBookingId ? `예약번호: ${ondaBookingId}` : '',
    ondaGuestName ? `예약자(온다): ${ondaGuestName}` : '',
  ].filter(Boolean).join('\n');

  console.log(`[SF Create] ${room} / ${checkin}~${checkout} / ${guestName}`);

  try {
    let cookies;
    try { cookies = await getSfSession(); }
    catch (_) { sfSession = null; cookies = await getSfSession(); }

    const result = await createBooking(cookies, {
      roomId, checkin, checkout,
      guestName, phone, email,
      adults, children, infants,
      countryCode, adminMemo,
    });

    const msg = `📋 *스테이폴리오 수기예약 생성 완료*\n• 객실: ${room}\n• 기간: ${checkin} ~ ${checkout}\n• 예약자: ${guestName}\n• 온다 예약번호: ${ondaBookingId || '-'}\n• SF 예약ID: ${result.bookingId || '-'}`;
    await sendSlack(msg);
    res.json({ success: true, bookingId: result.bookingId });
  } catch (err) {
    console.error('[SF Create] 실패:', err.message);
    sfSession = null;
    await sendSlack(`❌ *스테이폴리오 수기예약 실패*\n• 객실: ${room}\n• 오류: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/rooms', (req, res) => {
  res.json({ rooms: Object.keys(ROOM_MAP) });
});

app.listen(PORT, () => {
  console.log(`🏨 온다 자동화 서버 시작 (port ${PORT})`);
});
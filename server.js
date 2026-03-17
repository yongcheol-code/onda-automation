'use strict';
const express = require('express');
const path = require('path');
const { closeVacancy, openVacancy } = require('./onda-api');
const { login, createBooking } = require('./stayfolio');
const { getCheckinData, saveMemo } = require('./checkin');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'onda2026secret';

function verifySecret(req, res) {
  const secret = req.headers['x-webhook-secret'] || req.body?.secret;
  if (secret !== WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// ── 헬스체크 ──────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'onda-automation' });
});

// ── 체크인 리스트 웹화면 ───────────────────────────
app.get('/checkin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

// ── 체크인 데이터 API ──────────────────────────────
app.get('/checkin-list', async (req, res) => {
  try {
    const date = req.query.date || null;
    const data = await getCheckinData(date);
    res.json(data);
  } catch (e) {
    console.error('[checkin-list] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 현장 메모 저장 API ─────────────────────────────
app.post('/save-memo', async (req, res) => {
  try {
    const result = await saveMemo(req.body);
    res.json(result);
  } catch (e) {
    console.error('[save-memo] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── ONDA 방막기 ────────────────────────────────────
app.post('/close-vacancy', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const { roomId, checkin, checkout, memo } = req.body;
    const result = await closeVacancy(roomId, checkin, checkout, memo);
    res.json(result);
  } catch (e) {
    console.error('[close-vacancy] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── ONDA 방열기 ────────────────────────────────────
app.post('/open-vacancy', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const { roomId, checkin, checkout } = req.body;
    const result = await openVacancy(roomId, checkin, checkout);
    res.json(result);
  } catch (e) {
    console.error('[open-vacancy] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 스테이폴리오 수기예약 ──────────────────────────
app.post('/stayfolio-create', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const sfEmail = process.env.SF_EMAIL;
    const sfPassword = process.env.SF_PASSWORD;
    const ROOM_ID_MAP = {
  'Lodge Loft A': 96, 'Lodge Loft B': 97,
  'Lodge Twin A': 98, 'Lodge Twin B': 99,
  'Lodge Suite A': 100, 'Lodge Suite B': 101,
  'Lodge Suite Family': 102,
  'Airstream 17ft': 117, 'Airstream 27ft': 118,
  'Airstream 31ft': 119, 'Airstream 31ft +': 799,
  'Cabin A': 464, 'Cabin B': 465
};
const { room, checkin, checkout, guestName, phone,
        countryCode, adults, children, infants,
        ondaBookingId, ondaGuestName, price } = req.body;
const roomId = ROOM_ID_MAP[room];
if (!roomId) throw new Error('알 수 없는 객실명: ' + room);
const cookies = await login(sfEmail, sfPassword);
const result = await createBooking(cookies, {
  roomId, checkin, checkout,
  guestName: guestName || '',
  phone: (phone || '').replace(/[^0-9]/g, ''),
  countryCode: countryCode || '+82',
  adults: adults || 2,
  children: children || 0,
  infants: infants || 0,
  adminMemo: '[ONDA 자동생성]\n예약번호: ' + (ondaBookingId || '') + '\n예약자(온다): ' + (ondaGuestName || ''),
  price: price || '0'
});
    res.json(result);
  } catch (e) {
    console.error('[stayfolio-create] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 스테이폴리오 예약 취소 ─────────────────────────
app.post('/stayfolio-cancel', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const { ondaBookingId, guestName, room, dateRange } = req.body;
    const sfEmail = process.env.SF_EMAIL;
    const sfPassword = process.env.SF_PASSWORD;
    const cookies = await login(sfEmail, sfPassword);
    const result = await cancelBooking(cookies, ondaBookingId);
    res.json(result);
  } catch (e) {
    console.error('[stayfolio-cancel] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[onda-automation] Server running on port ${PORT}`);
});

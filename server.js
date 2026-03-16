'use strict';
const express = require('express');
const path = require('path');
const { closeVacancy, openVacancy } = require('./onda-api');
const { createStayfolioBooking } = require('./stayfolio');
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
    const result = await createStayfolioBooking(req.body);
    res.json(result);
  } catch (e) {
    console.error('[stayfolio-create] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[onda-automation] Server running on port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const { getToken } = require('./auth');
const { closeRooms, openRooms, ROOM_MAP } = require('./onda-api');
const { sendSlack } = require('./slack');
const { login: sfLogin, createBooking, ROOM_ID_MAP } = require('./stayfolio');

// ì¤íì´í´ë¦¬ì¤ ì¸ì ìºì
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
    return res.status(401).json({ error: 'ì¸ì¦ ì¤í¨' });
  }
  next();
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'ì¨ë¤ ìëí ìë² ê°ëì¤' });
});

// ë°©ë§ê¸°
app.post('/close', verifySecret, async (req, res) => {
  const { room, dates, memo = 'ìë ë°©ë§ê¸°' } = req.body;
  if (!room || !dates || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'room, dates íì' });
  }
  if (!ROOM_MAP[room]) {
    return res.status(400).json({ error: `ì ì ìë ê°ì¤: ${room}`, available: Object.keys(ROOM_MAP) });
  }
  console.log(`[Close] ${room} / ${dates.join(', ')}`);
  try {
    const token = await getToken();
    const result = await closeRooms(token, room, dates, memo);
    await sendSlack(`ð« *ë°©ë§ê¸° ìë£*\nâ¢ ê°ì¤: ${room}\nâ¢ ë ì§: ${dates.join(', ')}\nâ¢ ë©ëª¨: ${memo}`);
    res.json({ success: true, room, dates, result });
  } catch (err) {
    console.error('[Close] ì¤í¨:', err.message);
    await sendSlack(`â *ë°©ë§ê¸° ì¤í¨*\nâ¢ ê°ì¤: ${room}\nâ¢ ì¤ë¥: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ë°©ì´ê¸°
app.post('/open', verifySecret, async (req, res) => {
  const { room, dates, memo = 'ìë ë°©ì´ê¸°' } = req.body;
  if (!room || !dates || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'room, dates íì' });
  }
  if (!ROOM_MAP[room]) {
    return res.status(400).json({ error: `ì ì ìë ê°ì¤: ${room}`, available: Object.keys(ROOM_MAP) });
  }
  console.log(`[Open] ${room} / ${dates.join(', ')}`);
  try {
    const token = await getToken();
    const result = await openRooms(token, room, dates, memo);
    await sendSlack(`â *ë°©ì´ê¸° ìë£*\nâ¢ ê°ì¤: ${room}\nâ¢ ë ì§: ${dates.join(', ')}\nâ¢ ë©ëª¨: ${memo}`);
    res.json({ success: true, room, dates, result });
  } catch (err) {
    console.error('[Open] ì¤í¨:', err.message);
    await sendSlack(`â *ë°©ì´ê¸° ì¤í¨*\nâ¢ ê°ì¤: ${room}\nâ¢ ì¤ë¥: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ì¤íì´í´ë¦¬ì¤ ìê¸°ìì½ ìì±
app.post('/stayfolio-create', verifySecret, async (req, res) => {
  const {
    room, checkin, checkout,
    guestName, phone, email = '',
    adults = 2, children = 0, infants = 0,
    countryCode = '+82',
    ondaBookingId = '', ondaGuestName = '',
  } = req.body;

  if (!room || !checkin || !checkout || !guestName || !phone) {
    return res.status(400).json({ error: 'room, checkin, checkout, guestName, phone íì' });
  }
  const roomId = ROOM_ID_MAP[room];
  if (!roomId) {
    return res.status(400).json({ error: `ê°ì¤ ID ë¯¸ì¤ì : ${room}` });
  }

  const adminMemo = [
    '[ONDA ìëìì±]',
    ondaBookingId ? `ìì½ë²í¸: ${ondaBookingId}` : '',
    ondaGuestName ? `ìì½ì(ì¨ë¤): ${ondaGuestName}` : '',
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

    const msg = `ð *ì¤íì´í´ë¦¬ì¤ ìê¸°ìì½ ìì± ìë£*\nâ¢ ê°ì¤: ${room}\nâ¢ ê¸°ê°: ${checkin} ~ ${checkout}\nâ¢ ìì½ì: ${guestName}\nâ¢ ì¨ë¤ ìì½ë²í¸: ${ondaBookingId || '-'}\nâ¢ SF ìì½ID: ${result.bookingId || '-'}`;
    await sendSlack(msg);
    res.json({ success: true, bookingId: result.bookingId });
  } catch (err) {
    console.error('[SF Create] ì¤í¨:', err.message);
    sfSession = null;
    await sendSlack(`â *ì¤íì´í´ë¦¬ì¤ ìê¸°ìì½ ì¤í¨*\nâ¢ ê°ì¤: ${room}\nâ¢ ì¤ë¥: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/rooms', (req, res) => {
  res.json({ rooms: Object.keys(ROOM_MAP) });
});


// 임시 디버그: 스테이폴리오 로그인 페이지 응답 확인
app.get('/debug-login', async (req, res) => {
  const https = require('https');
  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'host.stayfolio.com',
      path: '/users/sign_in',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Encoding': 'identity',
      }
    };
    const req2 = https.request(options, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, bodyStart: data.substring(0, 500), location: r.headers.location }));
    });
    req2.on('error', reject);
    req2.end();
  });
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`ð¨ ì¨ë¤ ìëí ìë² ìì (port ${PORT})`);
});
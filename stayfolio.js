const https = require('https');

const STAYFOLIO_HOST = 'host.stayfolio.com';
const PLACE_SLUG = 'aroundfollie-lodge';

const ROOM_ID_MAP = {
  'Lodge Loft A':      96,
  'Lodge Loft B':      97,
  'Lodge Twin A':      98,
  'Lodge Twin B':      99,
  'Airstream 17ft':   117,
  'Airstream 27ft':   118,
  'Airstream 31ft':   119,
  'Airstream 31ft +': 799,
  'Cabin A':          464,
  'Cabin B':          465,
  'Lodge Suite A':    100,
  'Lodge Suite B':    101,
  'Lodge Suite Family': 102,
};

async function login(email, password) {
  const body = JSON.stringify({
    user: { email, password, remember_me: '0' }
  });

  const res = await request('POST', STAYFOLIO_HOST, '/api/v1/session/login', body, {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  });

  console.log('[Stayfolio] 로그인 status:', res.statusCode);
  console.log('[Stayfolio] set-cookie 헤더:', JSON.stringify(res.headers['set-cookie']));
  console.log('[Stayfolio] 응답 body:', res.body.substring(0, 200));

  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`스테이폴리오 로그인 실패: HTTP ${res.statusCode} - ${res.body.substring(0, 100)}`);
  }

  const cookies = parseCookies(res.headers);
  const cookieNames = Object.keys(cookies);
  console.log('[Stayfolio] 파싱된 쿠키 이름:', cookieNames.join(', ') || '없음');

  if (cookieNames.length === 0) {
    throw new Error('스테이폴리오 로그인 실패 (쿠키 없음)');
  }

  console.log('[Stayfolio] 로그인 성공');
  return cookies;
}

async function createBooking(cookies, {
  roomId, checkin, checkout, guestName, phone,
  email = '', adults = 2, children = 0, infants = 0,
  countryCode = '+82', adminMemo = '',
}) {
  const payload = {
    status: 'ready',
    paid_status: 'not_paid',
    paid_method: 'Transfer',
    paid_method_to_s: '계좌이체',
    booking_type: 'onda',
    phone: phone,
    price: '0',
    adult_cnt: adults,
    child_cnt: children,
    baby_cnt: infants,
    inventory_id: 1,
    name: guestName,
    room_id: roomId,
    start: checkin,
    end: checkout,
    country_code: countryCode,
    locale: 'ko',
  };

  if (email) payload.email = email;
  if (adminMemo) payload.memo = adminMemo;

  console.log('[Stayfolio] 예약 POST 시작:', payload.name, payload.start, '~', payload.end, 'room_id:', payload.room_id);

  const res = await request(
    'POST',
    STAYFOLIO_HOST,
    `/places/${PLACE_SLUG}/bookings.json`,
    JSON.stringify(payload),
    {
      'Cookie': cookiesToString(cookies),
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `https://${STAYFOLIO_HOST}/places/${PLACE_SLUG}/mono_calendar`,
      'Origin': `https://${STAYFOLIO_HOST}`,
    }
  );

  console.log('[Stayfolio] 예약 POST status:', res.statusCode);
  console.log('[Stayfolio] 응답 body:', res.body.substring(0, 300));

  if (res.statusCode >= 400) {
    throw new Error(`예약 생성 실패: HTTP ${res.statusCode} - ${res.body.substring(0, 100)}`);
  }

  let bookingId = null;
  try {
    const json = JSON.parse(res.body);
    bookingId = json.id || json.booking_id || null;
  } catch (_) {
    const locMatch = (res.headers['location'] || '').match(/bookings\/(\d+)/);
    if (locMatch) bookingId = locMatch[1];
  }

  console.log(`[Stayfolio] 수기예약 생성 완료 / 예약ID: ${bookingId}`);
  return { bookingId, statusCode: res.statusCode };
}

function request(method, host, path, body, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host, path, method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Encoding': 'identity',
        ...headers,
      },
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseCookies(headers, existing = {}) {
  const result = { ...existing };
  const setCookie = headers['set-cookie'];
  if (!setCookie) return result;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const eqIdx = c.indexOf('=');
    const semi = c.indexOf(';');
    if (eqIdx < 0) continue;
    const k = c.substring(0, eqIdx).trim();
    const v = (semi > eqIdx ? c.substring(eqIdx + 1, semi) : c.substring(eqIdx + 1)).trim();
    if (k) result[k] = v;
  }
  return result;
}

function cookiesToString(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

module.exports = { login, createBooking, ROOM_ID_MAP };

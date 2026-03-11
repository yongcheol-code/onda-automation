const https = require('https');

const STAYFOLIO_HOST = 'host.stayfolio.com';
const PLACE_SLUG = 'aroundfollie-lodge';

const ROOM_ID_MAP = {
  'Lodge Loft A':       1,
  'Lodge Loft B':       2,
  'Lodge Twin A':       3,
  'Lodge Twin B':       4,
  'Airstream 17ft':     5,
  'Airstream 27ft':     6,
  'Airstream 31ft':     7,
  'Airstream 31ft +':   8,
  'Cabin A':            9,
  'Cabin B':            10,
  'Lodge Suite A':      11,
  'Lodge Suite B':      12,
  'Lodge Suite Family': 13,
};

async function login(email, password) {
  const loginPage = await request('GET', STAYFOLIO_HOST, '/users/sign_in', null, {});
  const csrfMatch = loginPage.body.match(/name="authenticity_token"[^>]*value="([^"]+)"/);
  if (!csrfMatch) throw new Error('CSRF 토큰 획득 실패');
  const csrfToken = csrfMatch[1];
  const cookies = parseCookies(loginPage.headers);

  const formData = new URLSearchParams({
    'authenticity_token': csrfToken,
    'user[email]': email,
    'user[password]': password,
    'user[remember_me]': '0',
    'commit': '로그인',
  }).toString();

  const loginRes = await request('POST', STAYFOLIO_HOST, '/users/sign_in', formData, {
    'Cookie': cookiesToString(cookies),
    'Content-Type': 'application/x-www-form-urlencoded',
  });

  const sessionCookies = parseCookies(loginRes.headers, cookies);
  if (!sessionCookies['_stayfolio_session']) throw new Error('스테이폴리오 로그인 실패');
  console.log('[Stayfolio] 로그인 성공');
  return sessionCookies;
}

async function createBooking(cookies, {
  roomId, checkin, checkout,
  guestName, phone, email = '',
  adults = 2, children = 0, infants = 0,
  countryCode = '+82', adminMemo = '',
}) {
  const calPage = await request('GET', STAYFOLIO_HOST, `/places/${PLACE_SLUG}/mono_calendar`, null, {
    'Cookie': cookiesToString(cookies),
  });
  const csrfMatch = calPage.body.match(/name="csrf-token"[^>]*content="([^"]+)"/);
  if (!csrfMatch) throw new Error('CSRF 토큰 획득 실패');
  const csrfToken = csrfMatch[1];

  const formData = new URLSearchParams({
    'authenticity_token': csrfToken,
    'inventory_id':       String(roomId),
    'check_in':           checkin,
    'check_out':          checkout,
    'booking_type':       'onda',
    'status':             'accepted',
    'paid_status':        'paid',
    'name':               guestName,
    'phone':              phone,
    'country_code':       countryCode,
    'email':              email,
    'adult_cnt':          String(adults),
    'child_cnt':          String(children),
    'baby_cnt':           String(infants),
    'memo':               adminMemo,
    'paid_method_to_s':   '계좌이체',
    'commit':             '저장',
  }).toString();

  const res = await request('POST', STAYFOLIO_HOST, `/places/${PLACE_SLUG}/bookings`, formData, {
    'Cookie': cookiesToString(cookies),
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-CSRF-Token': csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': `https://${STAYFOLIO_HOST}/places/${PLACE_SLUG}/mono_calendar`,
  });

  if (res.statusCode >= 400) throw new Error(`예약 생성 실패: HTTP ${res.statusCode}`);

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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; onda-bot/1.0)', 'Accept': '*/*', ...headers },
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
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (k && v) result[k.trim()] = v.trim();
  }
  return result;
}

function cookiesToString(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

module.exports = { login, createBooking, ROOM_ID_MAP };
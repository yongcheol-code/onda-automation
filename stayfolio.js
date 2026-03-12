const https = require('https');

const STAYFOLIO_HOST = 'host.stayfolio.com';
const PLACE_SLUG = 'aroundfollie-lodge';

const ROOM_ID_MAP = {
  'Lodge Loft A': 1,
  'Lodge Loft B': 2,
  'Lodge Twin A': 3,
  'Lodge Twin B': 4,
  'Airstream 17ft': 5,
  'Airstream 27ft': 6,
  'Airstream 31ft': 7,
  'Airstream 31ft +': 8,
  'Cabin A': 9,
  'Cabin B': 10,
  'Lodge Suite A': 11,
  'Lodge Suite B': 12,
  'Lodge Suite Family': 13,
};

// CSRF 토큰 추출 (여러 패턴 시도)
function extractCsrf(html) {
  const patterns = [
    /name="csrf-token"[^>]*content="([^"]+)"/,
    /content="([^"]+)"[^>]*name="csrf-token"/,
    /name="authenticity_token"[^>]*value="([^"]+)"/,
    /value="([^"]+)"[^>]*name="authenticity_token"/,
    /<meta[^>]*csrf-token[^>]*content="([^"]+)"/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function login(email, password) {
  // 1단계: 로그인 페이지에서 CSRF + 초기 쿠키 획득
  const loginPage = await request('GET', STAYFOLIO_HOST, '/users/sign_in', null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  });

  const csrfToken = extractCsrf(loginPage.body);
  if (!csrfToken) {
    console.error('[Stayfolio] 로그인 페이지 앞부분:', loginPage.body.substring(0, 300));
    throw new Error('로그인 페이지 CSRF 토큰 획득 실패');
  }

  const cookies = parseCookies(loginPage.headers);
  console.log('[Stayfolio] 초기 쿠키:', Object.keys(cookies).join(', '));

  // 2단계: 로그인 POST
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
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Referer': `https://${STAYFOLIO_HOST}/users/sign_in`,
    'Origin': `https://${STAYFOLIO_HOST}`,
  });

  const sessionCookies = parseCookies(loginRes.headers, cookies);
  console.log('[Stayfolio] 로그인 응답 status:', loginRes.statusCode, '쿠키:', Object.keys(sessionCookies).join(', '));

  if (loginRes.statusCode === 200 && !sessionCookies['_stayfolio_session']) {
    throw new Error('스테이폴리오 로그인 실패 (잘못된 이메일/비밀번호)');
  }

  // 3단계: 리다이렉트 따라가서 세션 확정
  const redirectUrl = loginRes.headers['location'];
  if (redirectUrl) {
    const redirectPath = redirectUrl.startsWith('http')
      ? new URL(redirectUrl).pathname
      : redirectUrl;
    const redir = await request('GET', STAYFOLIO_HOST, redirectPath, null, {
      'Cookie': cookiesToString(sessionCookies),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
    Object.assign(sessionCookies, parseCookies(redir.headers));
  }

  if (!sessionCookies['_stayfolio_session']) {
    throw new Error('스테이폴리오 로그인 실패 (세션 쿠키 없음)');
  }

  console.log('[Stayfolio] 로그인 성공');
  return sessionCookies;
}

async function createBooking(cookies, {
  roomId, checkin, checkout, guestName, phone,
  email = '', adults = 2, children = 0, infants = 0,
  countryCode = '+82', adminMemo = '',
}) {
  // CSRF 토큰: 캘린더 페이지에서 먼저 시도
  const calPage = await request('GET', STAYFOLIO_HOST, `/places/${PLACE_SLUG}/mono_calendar`, null, {
    'Cookie': cookiesToString(cookies),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  });

  console.log('[Stayfolio] 캘린더 페이지 status:', calPage.statusCode);

  if (calPage.statusCode === 302 || calPage.body.includes('/users/sign_in')) {
    throw new Error('스테이폴리오 세션 만료 - 재로그인 필요');
  }

  let csrfToken = extractCsrf(calPage.body);

  // 캘린더에서 못 찾으면 bookings 페이지 시도
  if (!csrfToken) {
    console.log('[Stayfolio] 캘린더 CSRF 없음, bookings 페이지 시도...');
    const bookPage = await request('GET', STAYFOLIO_HOST, `/places/${PLACE_SLUG}/bookings`, null, {
      'Cookie': cookiesToString(cookies),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
    csrfToken = extractCsrf(bookPage.body);
    console.log('[Stayfolio] bookings 페이지 status:', bookPage.statusCode);
  }

  if (!csrfToken) throw new Error('CSRF 토큰 획득 실패');
  console.log('[Stayfolio] CSRF 토큰 획득 성공');

  // 예약 POST
  const formData = new URLSearchParams({
    'authenticity_token': csrfToken,
    'inventory_id': String(roomId),
    'check_in': checkin,
    'check_out': checkout,
    'booking_type': 'onda',
    'status': 'accepted',
    'paid_status': 'paid',
    'name': guestName,
    'phone': phone,
    'country_code': countryCode,
    'email': email,
    'adult_cnt': String(adults),
    'child_cnt': String(children),
    'baby_cnt': String(infants),
    'memo': adminMemo,
    'paid_method_to_s': '계좌이체',
    'commit': '저장',
  }).toString();

  const res = await request('POST', STAYFOLIO_HOST, `/places/${PLACE_SLUG}/bookings`, formData, {
    'Cookie': cookiesToString(cookies),
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-CSRF-Token': csrfToken,
    'Referer': `https://${STAYFOLIO_HOST}/places/${PLACE_SLUG}/mono_calendar`,
    'Origin': `https://${STAYFOLIO_HOST}`,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  console.log('[Stayfolio] 예약 POST status:', res.statusCode);
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
      hostname: host,
      path,
      method,
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

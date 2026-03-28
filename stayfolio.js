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
  countryCode = '', adminMemo = '', price = '0',
}) {
  const payload = {
    status: 'ready',
    paid_status: 'not_paid',
    paid_method: 'Transfer',
    paid_method_to_s: '계좌이체',
    booking_type: 'onda',
    phone: phone || '00000000000',
    price: String(parseInt((price || '0').toString().replace(/[^0-9]/g, '')) || 0),
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
async function cancelBooking(cookies, ondaBookingId, guestName = '', checkin = '') {
  const searchRes = await request('GET', STAYFOLIO_HOST,
    '/places/' + PLACE_SLUG + '/bookings.json?per=200', null, {
      'Cookie': cookiesToString(cookies),
      'Accept': 'application/json',
    });
  if (searchRes.statusCode !== 200) throw new Error('예약 검색 실패: HTTP ' + searchRes.statusCode);

  const data = JSON.parse(searchRes.body);
  console.log('[SF Cancel] 검색 응답:', JSON.stringify(data).substring(0, 300));
  const bookings = Array.isArray(data.items) ? data.items
    : Array.isArray(data.bookings) ? data.bookings
    : Array.isArray(data) ? data : [];

  let booking = null;
  for (const b of bookings) {
    const detailRes = await request('GET', STAYFOLIO_HOST,
      '/places/' + PLACE_SLUG + '/bookings/' + b.id + '.json', null, {
        'Cookie': cookiesToString(cookies),
        'Accept': 'application/json',
      });
    if (detailRes.statusCode !== 200) continue;
    const detail = JSON.parse(detailRes.body);
    console.log('[SF Cancel] 상세 응답 admin_memo:', detail.admin_memo, 'id:', detail.id);
    if (detail.admin_memo && detail.admin_memo.includes(ondaBookingId)) {
      booking = detail;
      break;
    }
    if (guestName && checkin &&
      detail.name === guestName &&
      detail.start && detail.start.startsWith(checkin)) {
      booking = detail;
      break;
    }
  }

  if (!booking) throw new Error('ONDA 예약번호 ' + ondaBookingId + '에 해당하는 스테이폴리오 예약 없음');

  console.log('[Stayfolio] 취소 대상 예약 ID:', booking.id);
  console.log('[SF Cancel] 취소 URL ID:', booking.old_id || booking.id, '/ old_id:', booking.old_id, '/ id:', booking.id);

  const cancelBody = 'booking[host_cancel_reason]=ONDA+%EC%B7%A8%EC%86%8C&booking[select_cancel_reason]=%EA%B2%8C%EC%8A%A4%ED%8A%B8%EA%B0%80+%EC%98%88%EC%95%BD+%EC%B7%A8%EC%86%8C%EB%A5%BC+%EC%9B%90%ED%95%A9%EB%8B%88%EB%8B%A4.&booking[select_refund_price]=-2&booking[send_cancel_msg]=0';
  const cancelRes = await request('POST', STAYFOLIO_HOST,
  '/places/' + PLACE_SLUG + '/bookings/' + (booking.old_id || booking.id) + '/cancel',
  cancelBody, {
    'Cookie': cookiesToString(cookies),
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  });

  console.log('[Stayfolio] 예약 취소 status:', cancelRes.statusCode);
  console.log('[Stayfolio] 예약 취소 body:', cancelRes.body.substring(0, 200));

  if (cancelRes.statusCode !== 200 && cancelRes.statusCode !== 204) {
    throw new Error('예약 취소 실패: HTTP ' + cancelRes.statusCode + ' - ' + cancelRes.body);
  }

  console.log('[Stayfolio] 예약 취소 완료 bookingId:', booking.id);
  return { success: true, bookingId: booking.id };
}

function addMyeongjigakConfig() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  
  // stayfolio.js 가져오기
  const getRes = UrlFetchApp.fetch(
    'https://api.github.com/repos/yongcheol-code/onda-automation/contents/stayfolio.js',
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  const fileData = JSON.parse(getRes.getContentText());
  const sha = fileData.sha;
  const content = Utilities.newBlob(Utilities.base64Decode(fileData.content.replace(/\n/g,''))).getDataAsString();
  
  // 명지각 ROOM_ID_MAP 추가
  const addition = `
const MYEONGJIGAK_PLACE_SLUG = 'myeongjigak';
const MYEONGJIGAK_ROOM_ID_MAP = {
  '명 1': 3830,
  '지 2': 3831,
  '지 3': 3858,
  '지 4': 3859,
  '지 5': 3860,
  '지 6': 3861,
};
`;
  
  const updated = content + addition;
  const encoded = Utilities.base64Encode(updated, Utilities.Charset.UTF_8);
  
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/yongcheol-code/onda-automation/contents/stayfolio.js',
    {
      method: 'put',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ message: 'Add: 명지각 ROOM_ID_MAP', content: encoded, sha: sha })
    }
  );
  Logger.log('HTTP ' + res.getResponseCode());
}

async function getBookings(cookies, slug) {
  // 오늘부터 120일 후까지 예약만 가져오기 (페이지네이션)
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + 120);
  const fromStr = today.toISOString().substring(0, 10);
  const toStr = future.toISOString().substring(0, 10);

  let allItems = [];
  let page = 1;

  while (true) {
    const res = await request(
      'GET', STAYFOLIO_HOST,
      `/places/${slug}/bookings.json?page=${page}&status=accepted`,
      null,
      { 'Cookie': cookiesToString(cookies), 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    );
    if (res.statusCode >= 400) throw new Error(`SF bookings 조회 실패: HTTP ${res.statusCode}`);
    const data = JSON.parse(res.body);
    const items = data.items || [];

    // 날짜 필터: 오늘~120일 후 사이 체크인 예약만
    const filtered = items.filter(b => {
      if (!b.start) return false;
      const checkin = b.start.substring(0, 10);
      return checkin >= fromStr && checkin <= toStr;
    });
    allItems = allItems.concat(filtered);

    // 현재 페이지 아이템이 모두 fromStr 이전이면 중단
    const allBeforeFrom = items.every(b => !b.start || b.start.substring(0, 10) < fromStr);
    if (allBeforeFrom || items.length === 0) break;

    // 다음 페이지
    const totalPages = Math.ceil((data.page?.total_count || 0) / (data.page?.per_page || 20));
    if (page >= totalPages) break;
    page++;
  }

  console.log(`[getBookings] ${slug} → ${allItems.length}건 (${fromStr}~${toStr})`);
  return { items: allItems };
}
module.exports = { login, createBooking, cancelBooking, getBookings, ROOM_ID_MAP };

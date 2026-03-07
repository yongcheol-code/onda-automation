const puppeteer = require('puppeteer');

let cachedToken = null;
let tokenExpiry = 0;

/**
 * JWT payload 디코딩 (서명 검증 없이)
 */
function decodeJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return decoded.exp * 1000; // ms
  } catch {
    return 0;
  }
}

/**
 * 온다 어드민에 로그인해서 JWT 토큰 획득
 */
async function getToken() {
  // 캐시된 토큰이 유효하면 재사용 (만료 5분 전까지)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    console.log('[Auth] 캐시된 토큰 재사용 (만료:', new Date(tokenExpiry).toISOString(), ')');
    return cachedToken;
  }

  console.log('[Auth] 새 토큰 획득 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();

    // XHR 인터셉트로 토큰 캡처
    let capturedToken = null;
    await page.setRequestInterception(true);
    page.on('request', req => {
      const headers = req.headers();
      if (req.url().includes('tport.io') && headers['authorization']) {
        capturedToken = headers['authorization'];
        console.log('[Auth] 토큰 캡처 성공');
      }
      req.continue();
    });

    // 로그인 페이지로 이동
    await page.goto('https://pension.onda.me/login', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

    // 이메일/비밀번호 입력
    await page.type('input[type="email"], input[name="email"]', process.env.ONDA_EMAIL);
    await page.type('input[type="password"]', process.env.ONDA_PASSWORD);
    await page.click('button[type="submit"]');

    // 로그인 후 대시보드 대기
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // vacancies 페이지로 이동해서 API 호출 유발 (토큰 캡처용)
    if (!capturedToken) {
      await page.goto('https://pension.onda.me/vacancies', { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!capturedToken) {
      throw new Error('토큰 캡처 실패 - 로그인 실패 또는 API 호출 없음');
    }

    cachedToken = capturedToken;
    tokenExpiry = decodeJwtExpiry(capturedToken);
    console.log('[Auth] 토큰 획득 완료, 만료:', new Date(tokenExpiry).toISOString());
    return capturedToken;

  } finally {
    await browser.close();
  }
}

module.exports = { getToken };

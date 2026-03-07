const COGNITO_REGION = 'ap-northeast-2';
const COGNITO_CLIENT_ID = '7rn5f7nuqsgm75p7d7m27j2s02';

let cachedToken = null;
let tokenExpiry = 0;

function decodeJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return decoded.exp * 1000;
  } catch { return 0; }
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    console.log('[Auth] 캐시된 토큰 재사용');
    return cachedToken;
  }
  console.log('[Auth] Cognito 로그인 시작...');
  const fetch = require('node-fetch');
  const res = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: process.env.ONDA_EMAIL,
        PASSWORD: process.env.ONDA_PASSWORD,
      },
    }),
  });
  if (!res.ok) throw new Error(`Cognito 실패: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const idToken = data?.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error('IdToken 없음');
  cachedToken = idToken;
  tokenExpiry = decodeJwtExpiry(idToken);
  console.log('[Auth] 로그인 성공!');
  return idToken;
}

module.exports = { getToken };

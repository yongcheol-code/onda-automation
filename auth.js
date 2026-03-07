const {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} = require('amazon-cognito-identity-js');

const COGNITO_USER_POOL_ID = 'ap-northeast-2_xEnTN6EgW';
const COGNITO_CLIENT_ID = '7rn5f7nuqsgm75p7d7m27j2s02';

let cachedToken = null;
let tokenExpiry = 0;

function decodeJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return decoded.exp * 1000;
  } catch {
    return 0;
  }
}

function getToken() {
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    console.log('[Auth] 캐시된 토큰 재사용');
    return Promise.resolve(cachedToken);
  }

  console.log('[Auth] Cognito SRP 로그인 시작...');

  return new Promise((resolve, reject) => {
    const userPool = new CognitoUserPool({
      UserPoolId: COGNITO_USER_POOL_ID,
      ClientId: COGNITO_CLIENT_ID,
    });

    const authDetails = new AuthenticationDetails({
      Username: process.env.ONDA_EMAIL,
      Password: process.env.ONDA_PASSWORD,
    });

    const cognitoUser = new CognitoUser({
      Username: process.env.ONDA_EMAIL,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess(session) {
        const idToken = session.getIdToken().getJwtToken();
        cachedToken = idToken;
        tokenExpiry = decodeJwtExpiry(idToken);
        console.log('[Auth] 로그인 성공! 만료:', new Date(tokenExpiry).toISOString());
        resolve(idToken);
      },
      onFailure(err) {
        console.error('[Auth] 로그인 실패:', err);
        reject(new Error('Cognito 로그인 실패: ' + (err.message || err)));
      },
      newPasswordRequired() {
        reject(new Error('비밀번호 변경 필요'));
      },
    });
  });
}

module.exports = { getToken };

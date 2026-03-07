// 객실 rateplan_id 매핑 (2026.03.07 확인)
const PROPERTY_ID = '137195';

const ROOM_MAP = {
  'Lodge Loft A':      '1704035',
  'Lodge Loft B':      '1704036',
  'Lodge Twin A':      '1704037',
  'Lodge Twin B':      '1704038',
  'Lodge Suite A':     '1704039',
  'Lodge Suite B':     '1704040',
  'Lodge Suite Family':'1704041',
  'Airstream 17ft':    '1704042',
  'Airstream 27ft':    '1704043',
  'Airstream 31ft':    '1704044',
  'Airstream 31ft +':  '1704045',
  'Cabin A':           '1704046',
  'Cabin B':           '1704047',
};

// 방막기 GraphQL 뮤테이션
const MUTATION_CLOSE = `
mutation MutationCloseVacancy($property_id: ID!, $memo: String!, $data: [VacancyInputType]!) {
  closeVacancy(property_id: $property_id, memo: $memo, data: $data)
}`;

// 방열기 GraphQL 뮤테이션
const MUTATION_OPEN = `
mutation MutationOpenVacancy($property_id: ID!, $memo: String!, $data: [VacancyInputType]!) {
  openVacancy(property_id: $property_id, memo: $memo, data: $data)
}`;

/**
 * GraphQL API 호출
 * @param {string} token - Authorization JWT 토큰
 * @param {string} operationName
 * @param {string} query
 * @param {object} variables
 */
async function callGql(token, operationName, query, variables) {
  const fetch = require('node-fetch');
  const res = await fetch('https://plus.tport.io/gql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': token,
      'service': 'pension_pms',
      'locale': 'ko-KR',
      'platform': 'web',
    },
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!res.ok) throw new Error(`GQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GQL Error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/**
 * 방막기 실행
 * @param {string} token - JWT 토큰
 * @param {string} roomName - 객실명 (ROOM_MAP의 키)
 * @param {string[]} dates - ['2026-03-10', '2026-03-11', ...]
 * @param {string} memo
 */
async function closeRooms(token, roomName, dates, memo = '') {
  const rateplanId = ROOM_MAP[roomName];
  if (!rateplanId) throw new Error(`알 수 없는 객실명: ${roomName}`);

  const data = dates.map(date => ({
    rateplan_id: rateplanId,
    date,
    roomtype_name: roomName,
    vacancy: 1,
    base: true,
  }));

  return callGql(token, 'MutationCloseVacancy', MUTATION_CLOSE, {
    property_id: PROPERTY_ID,
    memo,
    data,
  });
}

/**
 * 방열기 실행
 * @param {string} token - JWT 토큰
 * @param {string} roomName - 객실명
 * @param {string[]} dates - ['2026-03-10', ...]
 * @param {string} memo
 */
async function openRooms(token, roomName, dates, memo = '') {
  const rateplanId = ROOM_MAP[roomName];
  if (!rateplanId) throw new Error(`알 수 없는 객실명: ${roomName}`);

  const data = dates.map(date => ({
    rateplan_id: rateplanId,
    date,
    roomtype_name: roomName,
    vacancy: 1,
    base: true,
  }));

  return callGql(token, 'MutationOpenVacancy', MUTATION_OPEN, {
    property_id: PROPERTY_ID,
    memo,
    data,
  });
}

module.exports = { closeRooms, openRooms, ROOM_MAP, PROPERTY_ID };

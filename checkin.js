const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.CHECKIN_SPREADSHEET_ID;
const SHEET_NAME = '체크인 리스트';
const MEMO_SHEET = '현장메모';

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetData(sheetName) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });
  return res.data.values || [];
}

async function updateSheetRow(sheetName, row, values) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const colEnd = String.fromCharCode(64 + values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${row}:${colEnd}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function appendSheetRow(sheetName, values) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRoomCode(type, name) {
  const t = (type || '').toUpperCase().trim();
  const n = (name || '').toUpperCase().trim();
  if (t === 'LODGE') {
    if (n === 'LA') return 'LA'; if (n === 'LB') return 'LB';
    if (n === 'TA') return 'TA'; if (n === 'TB') return 'TB';
    if (n === 'SA') return 'SA'; if (n === 'SB') return 'SB';
    if (n === 'SF' || n.includes('FAMILY')) return 'SF';
  }
  if (t === 'AIR STREAM' || t === 'AIRSTREAM') {
    if (n.includes('17')) return '17ft'; if (n.includes('27')) return '27ft';
    if (n.includes('31+') || n === '31+ FT') return '31ft+';
    if (n.includes('31')) return '31ft';
  }
  if (t === 'CABIN') {
    if (n === 'CA') return 'CA'; if (n === 'CB') return 'CB';
  }
  return n || t;
}

const ROOM_NAMES = {
  LA:'Lodge Loft A', LB:'Lodge Loft B', TA:'Lodge Twin A', TB:'Lodge Twin B',
  '17ft':'Airstream 17ft', '27ft':'Airstream 27ft', '31ft':'Airstream 31ft', '31ft+':'Airstream 31ft+',
  CA:'Cabin A', CB:'Cabin B', SA:'Lodge Suite A', SB:'Lodge Suite B', SF:'Lodge Suite Family'
};

// A=날짜, B=객실타입, C=객실명, D=체크인일, E=체크아웃일, F=예약자명
// G=국가코드, H=전화번호, I=이메일, J=성인, K=아동, L=영아, M=채널
// N=관리자메모, O=추가기구, P=옵션, Q=비배큐, R=그릴, S=파이어핏
// T=비빔밥, U=곰탕, V=피크닉, W=결제필요
const COL = {
  date:0, roomType:1, room:2, checkIn:3, checkOut:4, guest:5,
  country:6, phone:7, email:8, adults:9, children:10, infants:11,
  channel:12, note:13, extra:14, options:15, bbq:16, grill:17,
  firepit:18, bibimbap:19, gomtang:20, picnic:21, payNeeded:22
};

async function getCheckinData(dateStr) {
  const rows = await getSheetData(SHEET_NAME);
  if (!rows.length) return { date: dateStr, checkin: [], checkout: [] };

  const targetDate = dateStr || formatDate(new Date());
  const checkin = [], checkout = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const guest = (row[COL.guest] || '').toString().trim();
    if (!guest) continue;

    const ciDate = formatDate(parseDate(row[COL.checkIn]));
    const coDate = formatDate(parseDate(row[COL.checkOut]));

    const options = [];
    if (row[COL.grill]) options.push('Weber Grill');
    if (row[COL.firepit]) options.push('Fire Pit');
    if (row[COL.picnic]) options.push('피크닉 바스켓');

    const bfCount = parseInt(row[COL.options] || '') || 0;
    const payNeeded = parseInt(row[COL.payNeeded] || '') || 0;

    const record = {
      rowNum: i + 1,
      roomCode: getRoomCode(row[COL.roomType], row[COL.room]),
      roomFull: ROOM_NAMES[getRoomCode(row[COL.roomType], row[COL.room])] || row[COL.room],
      guest,
      country: (row[COL.country] || '').toString().trim(),
      phone: (row[COL.phone] || '').toString().trim(),
      adults: parseInt(row[COL.adults]) || 0,
      children: parseInt(row[COL.children]) || 0,
      channel: (row[COL.channel] || '').toString().trim(),
      options,
      note: (row[COL.note] || '').toString().trim(),
      payNeeded,
      breakfast: bfCount,
      checkinDate: ciDate,
      checkoutDate: coDate,
    };

    if (ciDate === targetDate) checkin.push({ ...record, type: 'in' });
    if (coDate === targetDate) checkout.push({ ...record, type: 'out' });
  }

  // 저장된 메모 불러오기
  const memos = await getMemoData(targetDate);

  return { date: targetDate, checkin, checkout, memos };
}

async function getMemoData(dateStr) {
  try {
    const rows = await getSheetData(MEMO_SHEET);
    const memos = {};
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').toString() === dateStr) {
        memos[rows[i][1]] = {
          staff: rows[i][2] || '', inspector: rows[i][3] || '',
          time: rows[i][4] || '', plate: rows[i][5] || '',
          note: rows[i][6] || '', done: rows[i][7] === 'Y',
          paid: rows[i][8] === 'Y', pillow: rows[i][9] === 'Y',
          cleaned: rows[i][10] === 'Y', bfTime: rows[i][11] || '',
          bfMenu: rows[i][12] || ''
        };
      }
    }
    return memos;
  } catch (e) { return {}; }
}

async function saveMemo(data) {
  // 현장메모 시트 없으면 생성 불가 (API로 시트 생성은 별도) - 있다고 가정
  try {
    const rows = await getSheetData(MEMO_SHEET);
    if (!rows.length) {
      // 헤더 추가
      await appendSheetRow(MEMO_SHEET, ['date','roomCode','staff','inspector','time','plate','note','done','paid','pillow','cleaned','bfTime','bfMenu','timestamp']);
    }
    const key = `${data.date}|${data.roomCode}`;
    let found = -1;
    for (let i = 1; i < rows.length; i++) {
      if (`${rows[i][0]}|${rows[i][1]}` === key) { found = i + 1; break; }
    }
    const rowData = [
      data.date, data.roomCode, data.staff||'', data.inspector||'',
      data.time||'', data.plate||'', data.note||'',
      data.done?'Y':'N', data.paid?'Y':'N', data.pillow?'Y':'N',
      data.cleaned?'Y':'N', data.bfTime||'', data.bfMenu||'',
      new Date().toISOString()
    ];
    if (found > 0) {
      await updateSheetRow(MEMO_SHEET, found, rowData);
    } else {
      await appendSheetRow(MEMO_SHEET, rowData);
    }
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { getCheckinData, saveMemo };

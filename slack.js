const fetch = require('node-fetch');

/**
 * 슬랙으로 메시지 전송
 */
async function sendSlack(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL 미설정, 알림 스킵');
    return;
  }
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('[Slack] 전송 실패:', e.message);
  }
}

module.exports = { sendSlack };

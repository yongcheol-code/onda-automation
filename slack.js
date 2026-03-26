const fetch = require('node-fetch');

async function sendSlack(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
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

async function postSlackThread(channel, thread_ts, text) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, thread_ts, text }),
    });
  } catch (e) {
    console.error('[Slack] 스레드 댓글 실패:', e.message);
  }
}

async function sendSlackMJ(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL_MJ;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('[Slack MJ] 전송 실패:', e.message);
  }
}

module.exports = { sendSlack, sendSlackMJ, postSlackThread };

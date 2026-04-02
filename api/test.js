// Test endpoint — verifies full stack: Groq LLM + Telegram sendMessage
// GET /api/test?chat_id=<id>  → calls Groq, sends reply to chat_id, returns result

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export default async function handler(req, res) {
  const chatId = req.query.chat_id ? parseInt(req.query.chat_id) : null;

  // Step 1: Test Groq
  let llmReply = null;
  let llmError = null;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are Nova. Reply with exactly: Nova is online and working correctly.' },
          { role: 'user', content: 'status check' },
        ],
        max_tokens: 20,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      llmReply = data.choices?.[0]?.message?.content?.trim();
    } else {
      llmError = `${r.status}: ${await r.text()}`;
    }
  } catch (e) {
    llmError = e.message;
  }

  // Step 2: Send to Telegram if chat_id provided
  let telegramResult = 'skipped (no chat_id)';
  if (chatId && llmReply) {
    try {
      const tr = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `[TEST] ${llmReply}` }),
      });
      const tData = await tr.json();
      telegramResult = tr.ok ? 'sent OK' : `failed: ${JSON.stringify(tData)}`;
    } catch (e) {
      telegramResult = `error: ${e.message}`;
    }
  }

  res.status(200).json({
    groq: llmError ? { error: llmError } : { ok: true, reply: llmReply },
    telegram: telegramResult,
    env_check: {
      groq_key: GROQ_API_KEY ? `set (${GROQ_API_KEY.slice(0,8)}...)` : 'MISSING',
      bot_token: BOT_TOKEN ? `set (${BOT_TOKEN.slice(0,10)}...)` : 'MISSING',
    },
  });
}

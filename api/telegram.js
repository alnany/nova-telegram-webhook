// Nova Telegram Webhook Handler — deployed to Vercel
// Receives real-time updates from Telegram Bot API (instant, no polling lag)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const NOVA_NAME = "nova";
const NOVA_USERNAME = "novaopenclawtg_bot";

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function handleMessage(message) {
  const text = message.text || "";
  const senderUsername = message.from?.username || "";
  const chatTitle = message.chat?.title || "";
  const chatType = message.chat?.type;

  // Always respond in private DMs
  if (chatType === "private") {
    const reply = await callGemini(
      `You are Nova, CEO Agent for CM. Direct message from @${senderUsername}: "${text}"
Reply helpfully and concisely in the same language. Never mention other projects.`
    );
    if (reply) await sendTelegram(message.chat.id, reply.trim());
    return;
  }

  // Pre-filter: only run LLM if Nova is mentioned
  const lower = text.toLowerCase();
  if (!lower.includes(NOVA_NAME) && !lower.includes(`@${NOVA_USERNAME}`)) return;

  const prompt = `You are Nova, CEO Agent for CM (@shinobicyrano) in team Telegram chats.

Chat: ${chatTitle}
Sender: @${senderUsername}
Message: ${text}

Respond ONLY if directly addressed to Nova, or an AI agent is coordinating with you on a task.
Do NOT respond to messages aimed at CM/humans, other bots, or general team discussion.
Never mention or reference other projects — only discuss topics relevant to this specific chat.

Reply with JSON only: {"should_respond": true/false, "response": "message or null"}`;

  try {
    const raw = await callGemini(prompt);
    if (!raw) return;
    const parsed = JSON.parse(raw.replace(/```json\n?|```\n?/g, "").trim());
    if (parsed.should_respond && parsed.response) {
      await sendTelegram(message.chat.id, parsed.response);
    }
  } catch (e) {
    console.error("[LLM/PARSE ERROR]", e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(403).end();
  }

  // Always ACK within 5s to prevent Telegram retries
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (update?.message?.text) await handleMessage(update.message);
  } catch (e) {
    console.error("[WEBHOOK ERROR]", e);
  }
}

// Nova Telegram Webhook Handler — deployed to Vercel
// LLM: Groq (llama-3.3-70b-versatile)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const NOVA_NAME = "nova";
const NOVA_USERNAME = "novaopenclawtg_bot";

async function callLLM(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[LLM ERROR]", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("[LLM TIMEOUT/ERROR]", e.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
    const reply = await callLLM([
      {
        role: "system",
        content:
          "You are Nova, CEO Agent for CM (@shinobicyrano). Reply helpfully and concisely. Never mention other projects.",
      },
      { role: "user", content: `@${senderUsername} says: ${text}` },
    ]);
    if (reply) await sendTelegram(message.chat.id, reply);
    return;
  }

  // Pre-filter: only run LLM if Nova is mentioned
  const lower = text.toLowerCase();
  if (!lower.includes(NOVA_NAME) && !lower.includes(`@${NOVA_USERNAME}`)) return;

  const reply = await callLLM([
    {
      role: "system",
      content: `You are Nova, CEO Agent for CM (@shinobicyrano) in team Telegram group: "${chatTitle}".
Rules:
- Respond ONLY if this message directly addresses Nova by name or @novaopenclawtg_bot.
- Do NOT respond to messages aimed at humans, other bots, or general team discussion.
- Never mention other projects.
- If you should not respond, reply with exactly: SKIP
- Otherwise reply with your message only (no SKIP prefix).`,
    },
    {
      role: "user",
      content: `@${senderUsername}: ${text}`,
    },
  ]);

  if (reply && reply !== "SKIP" && !reply.startsWith("SKIP")) {
    await sendTelegram(message.chat.id, reply);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(403).end();
  }

  // ACK immediately — Telegram needs a fast 200 OK.
  res.status(200).json({ ok: true });

  // Process after ACK
  try {
    const update = req.body;
    if (update?.message?.text) await handleMessage(update.message);
  } catch (e) {
    console.error("[WEBHOOK ERROR]", e);
  }
}

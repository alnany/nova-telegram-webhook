// Nova Telegram Webhook — Vercel serverless
// LLM: Groq (llama-3.3-70b-versatile)
// Flow: await LLM + sendMessage BEFORE returning 200
// (Vercel terminates async work after res.end — must finish first)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const NOVA_NAME = "nova";
const NOVA_USERNAME = "novaopenclawtg_bot";

async function callLLM(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
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
      const err = await res.text();
      console.error("[LLM ERROR]", res.status, err);
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
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error("[SEND ERROR]", res.status, await res.text());
  }
}

async function handleMessage(message) {
  const text = message.text || "";
  const senderUsername = message.from?.username || "";
  const chatTitle = message.chat?.title || "";
  const chatType = message.chat?.type;
  const chatId = message.chat?.id;

  console.log(`[MSG] type=${chatType} from=@${senderUsername} text="${text.slice(0,80)}"`);

  // Always respond in private DMs
  if (chatType === "private") {
    const reply = await callLLM([
      {
        role: "system",
        content:
          "You are Nova, CEO Agent for CM (@shinobicyrano). Reply helpfully and concisely.",
      },
      { role: "user", content: `@${senderUsername} says: ${text}` },
    ]);
    console.log(`[REPLY] to=${chatId} reply=${reply?.slice(0,80)}`);
    if (reply) await sendTelegram(chatId, reply);
    return;
  }

  // Group: only respond if Nova is explicitly mentioned
  const lower = text.toLowerCase();
  if (!lower.includes(NOVA_NAME) && !lower.includes(`@${NOVA_USERNAME}`)) {
    console.log("[SKIP] not addressed to Nova");
    return;
  }

  const reply = await callLLM([
    {
      role: "system",
      content: `You are Nova, CEO Agent for CM (@shinobicyrano) in team Telegram group: "${chatTitle}".
Rules:
- Respond ONLY if this message directly addresses Nova by name or @novaopenclawtg_bot.
- Do NOT respond to messages aimed at humans, other bots, or general team discussion.
- If you should not respond, reply with exactly: SKIP
- Otherwise reply with your message only.`,
    },
    {
      role: "user",
      content: `@${senderUsername}: ${text}`,
    },
  ]);

  console.log(`[REPLY] group to=${chatId} reply=${reply?.slice(0,80)}`);
  if (reply && reply !== "SKIP" && !reply.startsWith("SKIP")) {
    await sendTelegram(chatId, reply);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body;
    if (update?.message?.text) {
      // Do ALL work (LLM + send) BEFORE returning 200.
      // Telegram waits up to 60s; Groq responds in <3s — no issue.
      // Vercel terminates the process after res.end(), so async-after-response fails.
      await handleMessage(update.message);
    }
  } catch (e) {
    console.error("[WEBHOOK ERROR]", e);
  }

  res.status(200).json({ ok: true });
}

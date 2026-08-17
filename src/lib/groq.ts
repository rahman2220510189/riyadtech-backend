import { env } from "../env.js";

/**
 * The Groq connection.
 *
 * Keys are read as GROQ_API_KEY_1, _2, _3 … with no fixed limit, so adding
 * capacity later is an environment variable rather than a code change. They
 * are tried in order: a key that returns 429 is rested for a minute and the
 * next one takes over, so a spent quota degrades the service instead of
 * breaking it.
 *
 * When every key is spent the caller gets a reason, and the chat route says so
 * plainly. On a site that sells AI systems, a bot that invents an answer is
 * worse than a bot that admits it is stuck.
 */

/* Overridable, because Groq retires models on a few months' notice. When the
   next one goes, this is a dashboard edit rather than a deploy. */
const MODEL = env.GROQ_MODEL || "openai/gpt-oss-120b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** How long a rate-limited key is set aside before being tried again. */
const COOLDOWN_MS = 60_000;

type KeyState = { key: string; restingUntil: number };

function collectKeys(): string[] {
  const found: string[] = [];

  for (let i = 1; i <= 20; i += 1) {
    const value = process.env[`GROQ_API_KEY_${i}`]?.trim();
    if (value) found.push(value);
  }

  /* The unnumbered form too, so a single-key setup needs no renaming. */
  const single = env.GROQ_API_KEY?.trim();
  if (single && !found.includes(single)) found.push(single);

  return found;
}

const keys: KeyState[] = collectKeys().map((key) => ({ key, restingUntil: 0 }));

export const chatConfigured = keys.length > 0;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult =
  | { ok: true; reply: string }
  | { ok: false; reason: "unconfigured" | "exhausted" | "failed" };

export async function chat(messages: ChatMessage[]): Promise<ChatResult> {
  if (keys.length === 0) return { ok: false, reason: "unconfigured" };

  const now = Date.now();
  const available = keys.filter((state) => state.restingUntil < now);

  if (available.length === 0) return { ok: false, reason: "exhausted" };

  for (const state of available) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${state.key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          /* Low, because the job is to repeat what the site says accurately,
             not to be interesting about it. */
          temperature: 0.2,
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (response.status === 429) {
        state.restingUntil = Date.now() + COOLDOWN_MS;
        console.warn("[groq] key rate limited, resting it");
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        /* A rejected key never recovers on its own, so rest it for a day
           rather than retrying it on every request for the life of the
           process. */
        state.restingUntil = Date.now() + 24 * 60 * 60 * 1000;
        console.warn("[groq] key rejected — check it in the dashboard");
        continue;
      }

      if (!response.ok) {
        /* Groq answers 400 for a retired model name, and the body says which.
           Worth printing: the alternative is a chat that fails silently for
           weeks after a deprecation nobody read the email about. */
        const detail = await response.text().catch(() => "");
        console.warn(
          `[groq] replied ${response.status}`,
          detail.slice(0, 300),
        );
        continue;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) continue;

      return { ok: true, reply };
    } catch (error) {
      console.warn("[groq] request failed:", error);
    }
  }

  return { ok: false, reason: "failed" };
}
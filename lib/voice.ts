// Server-side speech through Groq: Orpheus for speaking, Whisper for listening.
// Optional: without a key the browser's own voice and speech recognition are used.
type Fetch = typeof fetch;

export class VoiceError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

export type VoiceConfig = { baseUrl: string; apiKey: string; ttsModel: string; voice: string; sttModel: string };

const GROQ = "https://api.groq.com/openai/v1";

export function voiceConfig(): VoiceConfig | null {
  const aiOnGroq = (process.env.AI_BASE_URL ?? "").includes("api.groq.com");
  const apiKey = process.env.VOICE_API_KEY || (aiOnGroq ? process.env.AI_API_KEY : undefined);
  if (!apiKey) return null;
  return {
    baseUrl: (process.env.VOICE_BASE_URL || GROQ).replace(/\/+$/, ""),
    apiKey,
    ttsModel: process.env.VOICE_TTS_MODEL || "canopylabs/orpheus-v1-english",
    voice: process.env.VOICE_TTS_VOICE || "hannah",
    sttModel: process.env.VOICE_STT_MODEL || "whisper-large-v3-turbo",
  };
}

function requireConfig(): VoiceConfig {
  const config = voiceConfig();
  if (!config) throw new VoiceError("voice is not configured", null);
  return config;
}

async function send(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new VoiceError(`voice request failed: ${(err as Error).name}`, null);
  }
  if (!res.ok) throw new VoiceError(`voice request failed with status ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  return res;
}

// A daily cap so one visitor can't use up the shared free voice quota; over it, browsers use their own voice.
export async function speechAllowed(bump: () => Promise<number> = async () => (await import("@/lib/db")).bumpDailySpeechCalls()): Promise<boolean> {
  const cap = Number(process.env.DAILY_SPEECH_CAP || 3000);
  return (await bump()) <= cap;
}

export async function synthesizeSpeech(text: string, f: Fetch = fetch): Promise<ArrayBuffer> {
  const c = requireConfig();
  const res = await send(f, `${c.baseUrl}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: c.ttsModel, voice: c.voice, input: text, response_format: "wav" }),
  });
  return res.arrayBuffer();
}

export async function transcribeAudio(audio: Blob, filename: string, f: Fetch = fetch): Promise<string> {
  const c = requireConfig();
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", c.sttModel);
  form.append("language", "en");
  form.append("response_format", "json");
  // Biases Whisper towards the words this app hears most.
  form.append("prompt", "Shopping by voice: reading glasses, crossword book, confirm, cancel, repeat, help.");
  const res = await send(f, `${c.baseUrl}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${c.apiKey}` }, body: form });
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
